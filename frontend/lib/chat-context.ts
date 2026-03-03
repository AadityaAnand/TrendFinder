/**
 * Assembles full trend context for LLM prompt injection.
 * Queries Supabase for all available data about a trend to maximize grounding.
 */

import { getServerSupabase } from './supabase-server'

export interface Citation {
  signal_id?: string
  title: string
  url: string | null
  source: string
  excerpt?: string
}

export interface TrendContext {
  trendId: string
  trendName: string
  contextString: string   // formatted for LLM prompt
  signals: Citation[]     // top signals for citation lookup
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function truncate(s: string | null | undefined, max = 200): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max) + '…' : s
}

export async function assembleTrendContext(trendId: string): Promise<TrendContext> {
  const db = getServerSupabase()

  // 1. Trend basics
  const { data: trend } = await db
    .from('detected_trends')
    .select('id, theme, status')
    .eq('id', trendId)
    .single()

  const trendName = trend?.theme || 'Unknown trend'

  // 2. Pre-generated brief (most information-rich source)
  const { data: briefRow } = await db
    .from('opportunity_briefs')
    .select('synthesis, persona_roles, persona_pain_points, hypotheses, competition_narrative, competition_repos, competition_tools, validation_experiments, risk_narrative, risk_factors')
    .eq('trend_id', trendId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 3. Top 20 signals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: signalRows } = await db
    .from('trend_signals')
    .select('raw_signals!inner(id, title, source, url, score, created_at)')
    .eq('trend_id', trendId)
    .limit(30) as { data: any[] | null }

  // Deduplicate and sort by score
  const seen = new Set<string>()
  const signals: Citation[] = []
  for (const row of (signalRows || [])) {
    const s = row.raw_signals
    if (!s?.title || seen.has(s.title)) continue
    seen.add(s.title)
    signals.push({
      signal_id: s.id,
      title: s.title,
      url: s.url,
      source: s.source,
      excerpt: truncate(s.title, 150),
    })
  }
  const topSignals = signals.slice(0, 20)

  // 4. Hypothesis
  const { data: hypothesis } = await db
    .from('problem_hypotheses')
    .select('hypothesis_title, hypothesis_summary, confidence, who_it_affects, pain_signals, demand_evidence')
    .eq('trend_id', trendId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 5. Competition
  const { data: competition } = await db
    .from('trend_competitive_intelligence')
    .select('competition_level, saturation_score, confidence')
    .eq('trend_id', trendId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 6. Timing
  const { data: timing } = await db
    .from('trend_timing_signals')
    .select('timing_label, timing_reasons, expiry_risk')
    .eq('trend_id', trendId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Build context string
  const parts: string[] = []

  parts.push(`TREND: ${trendName}`)

  if (briefRow?.synthesis) {
    parts.push(`\nSUMMARY:\n${truncate(briefRow.synthesis, 600)}`)
  } else if (hypothesis?.hypothesis_summary) {
    parts.push(`\nSUMMARY:\n${truncate(hypothesis.hypothesis_summary, 400)}`)
  }

  if (hypothesis?.who_it_affects) {
    const who = Array.isArray(hypothesis.who_it_affects)
      ? hypothesis.who_it_affects.join(', ')
      : String(hypothesis.who_it_affects)
    parts.push(`\nWHO IS AFFECTED: ${who}`)
  }

  if (briefRow?.persona_roles?.length) {
    parts.push(`\nPERSONA ROLES: ${briefRow.persona_roles.join(', ')}`)
  }

  if (hypothesis?.pain_signals) {
    const pains = Array.isArray(hypothesis.pain_signals)
      ? hypothesis.pain_signals.slice(0, 5)
      : []
    if (pains.length) parts.push(`\nPAIN POINTS:\n${pains.map((p: string) => `- ${p}`).join('\n')}`)
  }

  if (briefRow?.hypotheses?.length) {
    const ideas = (briefRow.hypotheses as { idea: string; effort: string }[]).slice(0, 4)
    parts.push(`\nWHAT TO BUILD:\n${ideas.map(h => `- ${h.idea} (${h.effort})`).join('\n')}`)
  }

  if (competition) {
    parts.push(`\nCOMPETITION: Level=${competition.competition_level}, Saturation=${Math.round((competition.saturation_score || 0) * 100)}%`)
  }
  if (briefRow?.competition_narrative) {
    parts.push(`COMPETITION DETAIL: ${truncate(briefRow.competition_narrative, 300)}`)
  }

  if (timing) {
    parts.push(`\nTIMING: ${timing.timing_label}${timing.expiry_risk ? ` (expiry risk: ${timing.expiry_risk})` : ''}`)
    if (timing.timing_reasons?.length) {
      parts.push(`TIMING REASONS: ${(timing.timing_reasons as string[]).slice(0, 3).join('; ')}`)
    }
  }

  if (briefRow?.risk_narrative) {
    parts.push(`\nRISKS: ${truncate(briefRow.risk_narrative, 300)}`)
  }

  if (topSignals.length > 0) {
    parts.push(`\nSIGNALS (${topSignals.length} total):`)
    topSignals.forEach((s, i) => {
      parts.push(`${i + 1}. [${s.source}] ${s.title}${s.url ? ` — ${s.url}` : ''}`)
    })
  }

  // Demand evidence
  if (hypothesis?.demand_evidence) {
    const demand = Array.isArray(hypothesis.demand_evidence)
      ? hypothesis.demand_evidence.slice(0, 5)
      : []
    if (demand.length) {
      parts.push(`\nDEMAND EVIDENCE:`)
      demand.forEach((d: { title: string; source: string }) => {
        parts.push(`- [${d.source}] ${d.title}`)
      })
    }
  }

  const contextString = parts.join('\n')

  return {
    trendId,
    trendName,
    contextString,
    signals: topSignals,
  }
}
