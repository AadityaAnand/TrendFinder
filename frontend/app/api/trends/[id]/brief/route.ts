import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getLatestSnapshot, getHypothesisDisplayTitle } from '@/lib/supabase-server'

// ============================================================
// Helper: parse JSON strings or passthrough arrays/objects
// ============================================================
const parseJson = (v: unknown, fallback: unknown[]) => {
  if (!v) return fallback
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return fallback } }
  return v
}

// ============================================================
// Helper: format pre-generated brief into the standard response shape
// ============================================================
function formatPreGeneratedBrief(
  briefRow: Record<string, unknown>,
  trend: { id: string; theme: string; status: string; first_seen: string },
  snapshot: { id: string; run_at: string },
  trendName: string,
  // Trajectory / timing / lifecycle still fetched for metrics
  trajectoryRow: Record<string, unknown> | null,
  timing: Record<string, unknown> | null,
  lifecycle: Record<string, unknown> | null,
  wedges: unknown[],
  signals: unknown[],
  sourceBreakdown: Record<string, number>,
  opportunity: Record<string, unknown> | null,
) {
  const synthesis_citations = parseJson(briefRow.synthesis_citations, []) as { title: string; url: string; source: string }[]
  const hypotheses = parseJson(briefRow.hypotheses, []) as { idea: string; effort: string; audience: string }[]
  const validation = parseJson(briefRow.validation_experiments, []) as { title: string; description: string; success_criteria: string; effort: string }[]
  const risk_factors = parseJson(briefRow.risk_factors, []) as { label: string; severity: string }[]
  const persona_pain_points = parseJson(briefRow.persona_pain_points, []) as { phrase: string; quote: string }[]
  const competition_repos = parseJson(briefRow.competition_repos, []) as { name: string }[]
  const competition_tools = parseJson(briefRow.competition_tools, []) as { name: string }[]

  let trajectory: unknown[] = []
  if (trajectoryRow?.trajectory_data) {
    trajectory = typeof trajectoryRow.trajectory_data === 'string'
      ? JSON.parse(trajectoryRow.trajectory_data as string)
      : (trajectoryRow.trajectory_data as unknown[]) || []
  }
  const latestPoint = (trajectory as Record<string, unknown>[])[trajectory.length - 1]

  const whyNow: string[] = []
  if (timing) {
    const timingLabels: Record<string, string> = {
      early_edge: 'The market window is open — early movers have an advantage right now.',
      too_early: 'Still very early — limited data, but worth watching.',
      crowded: 'The space is getting crowded. Differentiation is key.',
      late_but_monetizable: 'Late to the trend, but monetization paths still exist.',
    }
    const label = timing.timing_label as string
    if (timingLabels[label]) whyNow.push(timingLabels[label])
  }
  if (lifecycle?.lifecycle_stage === 'rising') {
    whyNow.push('Momentum is accelerating — signal volume is increasing.')
  }

  return {
    trend_id: trend.id,
    trend_name: trendName,
    trend_status: 'valid',
    stage: lifecycle?.lifecycle_stage || (trajectoryRow as Record<string, unknown> | null)?.current_stage || null,
    stage_confidence: lifecycle?.stage_confidence || 0,
    updated_at: snapshot.run_at,
    first_seen: trend.first_seen,
    confidence: briefRow.persona_confidence || 0,
    qualified: opportunity?.qualified || false,
    opportunity_score: opportunity?.opportunity_score || 0,

    // Phase 3 rich brief sections
    brief: {
      whats_happening: briefRow.synthesis || null,
      synthesis_citations,
      who_wants_this: briefRow.persona_roles || [],
      persona_level: briefRow.persona_level || null,
      persona_domain: briefRow.persona_domain || null,
      pain_signals: persona_pain_points.map((p) => p.phrase),
      pain_points_detailed: persona_pain_points,
      what_to_build: hypotheses,
      how_to_validate: validation,
      why_now: whyNow,
      risks: risk_factors.map((r) => r.label),
      risk_narrative: briefRow.risk_narrative || null,
      risk_factors,
      stability_label: briefRow.stability_label || null,
      negative_signal_ratio: briefRow.negative_signal_ratio || 0,
    },

    market: {
      competition_narrative: briefRow.competition_narrative || null,
      competition_repos,
      competition_tools,
      competition_confidence: briefRow.competition_confidence || null,
      competition_level: null,     // filled from live competition if needed
      saturation_score: 0,
      wedges: (wedges as { wedge_type: string; trigger_reason: string; confidence: number }[]).map((w) => ({
        type: w.wedge_type,
        reason: w.trigger_reason,
        confidence: w.confidence,
      })),
    },

    evidence: {
      signals,
      source_breakdown: sourceBreakdown,
      demand_evidence: [],
    },

    metrics: {
      momentum: latestPoint?.momentum || 0,
      peak_momentum: (trajectoryRow as Record<string, unknown> | null)?.peak_momentum || 0,
      signal_count: latestPoint?.signal_count || (signals as unknown[]).length,
      total_snapshots: (trajectoryRow as Record<string, unknown> | null)?.total_snapshots || 0,
      qualified_count: (trajectoryRow as Record<string, unknown> | null)?.qualified_count || 0,
      trajectory,
      timing: timing ? {
        label: timing.timing_label,
        confidence: timing.confidence,
        reasons: timing.timing_reasons || [],
        expiry_risk: timing.expiry_risk,
      } : null,
    },

    brief_meta: {
      completeness_score: briefRow.completeness_score || 0,
      is_draft: briefRow.is_draft || false,
      brief_version: briefRow.brief_version || null,
      generated_at: briefRow.generated_at || null,
      source: 'pre_generated',
    },
  }
}

// ============================================================
// Route Handler
// ============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = getServerSupabase()

  const { data: trend } = await supabase
    .from('detected_trends')
    .select('id, theme, status, first_seen')
    .eq('id', id)
    .single()

  if (!trend) {
    return NextResponse.json({ error: 'Trend not found' }, { status: 404 })
  }

  const snapshot = await getLatestSnapshot(supabase)
  if (!snapshot) {
    return NextResponse.json({ error: 'No snapshot available' }, { status: 404 })
  }

  // Fetch trajectory, timing, lifecycle, wedges, signals in parallel — needed by both paths
  const [
    preBriefRes,
    trajectoryRes,
    timingRes,
    wedgesRes,
    signalsRes,
    lifecycleRes,
    opportunityRes,
  ] = await Promise.all([
    supabase.from('opportunity_briefs')
      .select('*')
      .eq('trend_id', id)
      .eq('snapshot_id', snapshot.id)
      .limit(1)
      .single(),
    supabase.from('trend_trajectories')
      .select('trajectory_data, peak_momentum, peak_momentum_at, current_stage, total_snapshots, qualified_count')
      .eq('trend_id', id).single(),
    supabase.from('trend_timing_signals')
      .select('timing_label, confidence, timing_reasons, expiry_risk')
      .eq('trend_id', id).order('computed_at', { ascending: false }).limit(1).single(),
    supabase.from('trend_wedges')
      .select('wedge_type, trigger_reason, confidence')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id),
    supabase.from('trend_signals')
      .select('raw_signals!inner(title, source, url, score, created_at)')
      .eq('trend_id', id).limit(20),
    supabase.from('trend_lifecycle_history')
      .select('lifecycle_stage, stage_confidence, acceleration_comparable')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id).single(),
    supabase.from('trend_opportunities')
      .select('id, qualified, opportunity_score, suggested_actions, rejection_reasons, demand_hits, independent_artifact_count')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id).single(),
  ])

  const trajectoryRow = trajectoryRes.data
  const timing = timingRes.data
  const wedges = wedgesRes.data || []
  const lifecycle = lifecycleRes.data
  const opportunity = opportunityRes.data

  const seen = new Set<string>()
  const signals: { title: string; source: string; url: string | null; score: number; created_at: string }[] = []
  for (const row of (signalsRes.data || []) as unknown as { raw_signals: { title: string; source: string; url?: string; score?: number; created_at: string } }[]) {
    const sig = row.raw_signals
    if (!sig) continue
    const key = sig.url || sig.title
    if (seen.has(key)) continue
    seen.add(key)
    signals.push({ title: sig.title, source: sig.source, url: sig.url || null, score: sig.score || 0, created_at: sig.created_at })
  }

  const sourceBreakdown: Record<string, number> = {}
  for (const sig of signals) {
    sourceBreakdown[sig.source] = (sourceBreakdown[sig.source] || 0) + 1
  }

  // ── Fast path: pre-generated brief exists and is not a draft ──
  const preBrief = preBriefRes.data as Record<string, unknown> | null
  if (preBrief && !preBrief.is_draft) {
    // Use hypothesis title if available for display name
    const { data: hyp } = await supabase
      .from('problem_hypotheses')
      .select('hypothesis_title')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id).limit(1).single()

    const displayName = getHypothesisDisplayTitle(hyp?.hypothesis_title || null, trend.theme, null, id)

    return NextResponse.json(formatPreGeneratedBrief(
      preBrief, trend, snapshot, displayName,
      trajectoryRow as Record<string, unknown> | null,
      timing as Record<string, unknown> | null,
      lifecycle as Record<string, unknown> | null,
      wedges,
      signals,
      sourceBreakdown,
      opportunity as Record<string, unknown> | null,
    ))
  }

  // ── Fallback path: runtime assembly (existing logic) ──
  const [
    hypothesisRes,
    intelligenceRes,
    competitionRes,
  ] = await Promise.all([
    supabase.from('problem_hypotheses')
      .select('hypothesis_title, hypothesis_summary, hypothesis_status, confidence, who_it_affects, pain_signals, demand_evidence')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id).limit(1).single(),
    supabase.from('trend_intelligence')
      .select('summary, build_ideas, existing_solutions, risks')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id).single(),
    supabase.from('trend_competitive_intelligence')
      .select('competition_level, saturation_score, confidence')
      .eq('trend_id', id).order('computed_at', { ascending: false }).limit(1).single(),
  ])

  const hypothesis = hypothesisRes.data
  const intelligence = intelligenceRes.data
  const competition = competitionRes.data

  const trendName = getHypothesisDisplayTitle(
    hypothesis?.hypothesis_title, trend.theme, null, id
  )

  let trajectory: unknown[] = []
  if (trajectoryRow?.trajectory_data) {
    trajectory = typeof trajectoryRow.trajectory_data === 'string'
      ? JSON.parse(trajectoryRow.trajectory_data as string)
      : trajectoryRow.trajectory_data || []
  }

  const buildIdeas = parseJson(intelligence?.build_ideas, []) as { idea: string; effort: string; audience: string }[]
  const existingSolutions = parseJson(intelligence?.existing_solutions, []) as unknown[]
  const risks = (intelligence?.risks || []) as string[]

  const whoWantsThis = parseJson(hypothesis?.who_it_affects, []) as string[]
  const painSignals = parseJson(hypothesis?.pain_signals, []) as string[]
  const demandEvidence = parseJson(hypothesis?.demand_evidence, []) as unknown[]

  const whatsHappening = hypothesis?.hypothesis_summary || intelligence?.summary || null

  const whyNow: string[] = []
  if (timing) {
    const timingLabels: Record<string, string> = {
      early_edge: 'The market window is open — early movers have an advantage right now.',
      too_early: 'Still very early — limited data, but worth watching.',
      crowded: 'The space is getting crowded. Differentiation is key.',
      late_but_monetizable: 'Late to the trend, but monetization paths still exist.',
    }
    if (timingLabels[timing.timing_label as string]) whyNow.push(timingLabels[timing.timing_label as string])
  }
  if ((demandEvidence as unknown[]).length > 0) {
    whyNow.push(`${demandEvidence.length} demand signal${demandEvidence.length > 1 ? 's' : ''} detected — people are actively looking for solutions.`)
  }
  if (signals.length >= 3) {
    const sources = Object.keys(sourceBreakdown)
    whyNow.push(`Evidence from ${sources.length} independent source${sources.length > 1 ? 's' : ''} (${sources.join(', ')}).`)
  }
  if (lifecycle?.lifecycle_stage === 'rising') {
    whyNow.push('Momentum is accelerating — signal volume is increasing.')
  }

  const howToValidate: string[] = []
  const keyword = trendName.split(' ').slice(0, 3).join(' ')
  howToValidate.push(`Search for "${keyword}" on Twitter/Reddit to gauge real-time interest.`)
  if (whoWantsThis.length > 0) {
    howToValidate.push(`Interview 3-5 ${whoWantsThis[0].toLowerCase()} about their current workflow and pain points.`)
  }
  howToValidate.push('Build a landing page describing your solution and measure signup conversion.')
  if (buildIdeas.length > 0) {
    howToValidate.push(`Prototype the simplest version of "${buildIdeas[0]?.idea || 'your solution'}" in a weekend.`)
  }
  howToValidate.push('Post your prototype to relevant communities and track engagement.')

  let suggestedActions: string[] = []
  if (opportunity?.suggested_actions) {
    if (typeof opportunity.suggested_actions === 'string') {
      try { suggestedActions = JSON.parse(opportunity.suggested_actions) } catch { suggestedActions = (opportunity.suggested_actions as string).split('\n').filter(Boolean) }
    } else if (Array.isArray(opportunity.suggested_actions)) {
      suggestedActions = opportunity.suggested_actions as string[]
    }
  }

  const allRisks: string[] = [...risks]
  if (competition && competition.competition_level === 'high') {
    allRisks.push('High competition — many players are already building in this space.')
  }
  if (timing?.expiry_risk === 'high') {
    allRisks.push('The opportunity window may be closing soon.')
  }

  const latestPoint = (trajectory as Record<string, unknown>[])[trajectory.length - 1]

  const brief = {
    trend_id: id,
    trend_name: trendName,
    trend_status: hypothesis?.hypothesis_status || 'uncertain',
    stage: lifecycle?.lifecycle_stage || trajectoryRow?.current_stage || null,
    stage_confidence: lifecycle?.stage_confidence || 0,
    updated_at: snapshot.run_at,
    first_seen: trend.first_seen,
    confidence: hypothesis?.confidence || 0,
    qualified: opportunity?.qualified || false,
    opportunity_score: opportunity?.opportunity_score || 0,
    brief: {
      whats_happening: whatsHappening,
      why_now: whyNow,
      who_wants_this: whoWantsThis,
      what_to_build: buildIdeas.length > 0 ? buildIdeas : suggestedActions.map((a: string) => ({ idea: a, effort: '', audience: '' })),
      how_to_validate: howToValidate,
      risks: allRisks,
      pain_signals: painSignals,
    },
    market: {
      existing_solutions: existingSolutions,
      competition_level: competition?.competition_level || null,
      saturation_score: competition?.saturation_score || 0,
      wedges: (wedges as { wedge_type: string; trigger_reason: string; confidence: number }[]).map((w) => ({
        type: w.wedge_type,
        reason: w.trigger_reason,
        confidence: w.confidence,
      })),
    },
    evidence: {
      signals,
      source_breakdown: sourceBreakdown,
      demand_evidence: demandEvidence,
    },
    metrics: {
      momentum: latestPoint?.momentum || 0,
      peak_momentum: trajectoryRow?.peak_momentum || 0,
      signal_count: latestPoint?.signal_count || signals.length,
      total_snapshots: trajectoryRow?.total_snapshots || 0,
      qualified_count: trajectoryRow?.qualified_count || 0,
      trajectory,
      timing: timing ? {
        label: timing.timing_label,
        confidence: timing.confidence,
        reasons: timing.timing_reasons || [],
        expiry_risk: timing.expiry_risk,
      } : null,
    },
    brief_meta: {
      source: 'assembled',
    },
  }

  return NextResponse.json(brief)
}
