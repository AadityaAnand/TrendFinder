import { getServerSupabase, getLatestSnapshot, getHypothesisDisplayTitle, getTrendDisplayName } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SourceBadge } from '../../components/SourceBadge'
import { SignalQuote } from '../../components/SignalQuote'
import { RiskIndicator } from '../../components/RiskIndicator'
import { ChatPanel } from '../../components/ChatPanel'
import { BriefFeedback } from '../../components/BriefFeedback'

interface TrajectoryPoint {
  snapshot_id: string
  timestamp: string
  momentum: number | null
  signal_count: number | null
  stage: string | null
  stage_confidence: number | null
  acceleration: number | null
  acceleration_comparable: boolean
  qualified: boolean
  opportunity_score: number | null
}

interface TimingData {
  timing_label: string
  confidence: number
  timing_reasons: string[] | null
  expiry_risk: string | null
}

interface CompetitionData {
  competition_level: string
  saturation_score: number
  confidence: number
}

interface SignalData {
  title: string
  source: string
  url: string | null
}

interface OpportunityData {
  id: string | null
  action_title: string
  why_now: string | null
  suggested_actions: string | string[] | null
  qualified: boolean
  opportunity_score: number | null
}

interface IntelligenceData {
  summary: string | null
  build_ideas: { idea: string; effort: string; audience: string }[]
  existing_solutions: { name: string; gap: string }[]
  risks: string[]
}

interface HypothesisData {
  hypothesis_title: string
  hypothesis_summary: string | null
  hypothesis_status: string
  confidence: number
  who_it_affects: string[]
  pain_signals: string[]
  demand_evidence: { title: string; source: string; url: string }[]
}

interface WedgeData {
  wedge_type: string
  trigger_reason: string
  confidence: number
}

interface OpportunityExplanationData {
  why_this_trend: string | null
  why_now: string | null
  whats_the_risk: string | null
}

interface PredictionData {
  growth_probability: number
  predicted_direction: string  // 'accelerating' | 'steady' | 'declining' | 'breakout'
  confidence_level: string     // 'high' | 'medium' | 'low'
  prediction_reasons: { reason: string; weight: number }[]
}

interface PreBriefData {
  synthesis: string | null
  synthesis_citations: { title: string; url: string; source: string }[] | null
  persona_roles: string[] | null
  persona_pain_points: { phrase: string; quote: string; source: string }[] | null
  hypotheses: { idea: string; effort: string; audience: string }[] | null
  competition_narrative: string | null
  competition_repos: { name: string }[] | null
  competition_tools: { name: string }[] | null
  validation_experiments: { title: string; description: string; success_criteria: string; effort: string }[] | null
  risk_narrative: string | null
  risk_factors: { label: string; severity: string }[] | null
  is_draft: boolean
  why_now_prediction: string | null
  growth_indicator: string | null
  pain_phrases: { phrase: string; type: string; frequency: number }[] | null
}

interface TrendData {
  id: string
  theme: string
  status: string
  first_seen: string
  trajectory: TrajectoryPoint[]
  peak_momentum: number | null
  peak_momentum_at: string | null
  current_stage: string | null
  qualified_count: number
  total_snapshots: number
  timing: TimingData | null
  competition: CompetitionData | null
  signals: SignalData[]
  opportunity: OpportunityData | null
  intelligence: IntelligenceData | null
  hypothesis: HypothesisData | null
  wedges: WedgeData[]
  opportunity_explanation: OpportunityExplanationData | null
  updated_at: string | null
  preBrief: PreBriefData | null
  prediction: PredictionData | null
}

async function getTrendData(id: string): Promise<TrendData | null> {
  const supabase = getServerSupabase()

  const { data: trend } = await supabase
    .from('detected_trends')
    .select('id, theme, status, first_seen')
    .eq('id', id)
    .single()

  if (!trend) return null

  const displayName = getTrendDisplayName(trend.theme, null, id)

  const snapshot = await getLatestSnapshot(supabase)

  const { data: trajectoryRow } = await supabase
    .from('trend_trajectories')
    .select('*')
    .eq('trend_id', id)
    .single()

  let trajectory: TrajectoryPoint[] = []
  let peak_momentum = null
  let peak_momentum_at = null
  let current_stage = null
  let qualified_count = 0
  let total_snapshots = 0

  if (trajectoryRow) {
    trajectory = typeof trajectoryRow.trajectory_data === 'string'
      ? JSON.parse(trajectoryRow.trajectory_data)
      : trajectoryRow.trajectory_data || []
    peak_momentum = trajectoryRow.peak_momentum
    peak_momentum_at = trajectoryRow.peak_momentum_at
    current_stage = trajectoryRow.current_stage
    qualified_count = trajectoryRow.qualified_count || 0
    total_snapshots = trajectoryRow.total_snapshots || 0
  }

  let timing: TimingData | null = null
  const { data: timingRow } = await supabase
    .from('trend_timing_signals')
    .select('timing_label, confidence, timing_reasons, expiry_risk')
    .eq('trend_id', id)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single()

  if (timingRow) {
    timing = {
      timing_label: timingRow.timing_label,
      confidence: timingRow.confidence,
      timing_reasons: timingRow.timing_reasons || null,
      expiry_risk: timingRow.expiry_risk || null,
    }
  }

  let competition: CompetitionData | null = null
  const { data: compRow } = await supabase
    .from('trend_competitive_intelligence')
    .select('competition_level, saturation_score, confidence')
    .eq('trend_id', id)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single()

  if (compRow) {
    competition = {
      competition_level: compRow.competition_level,
      saturation_score: compRow.saturation_score,
      confidence: compRow.confidence,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: signalRows } = await supabase
    .from('trend_signals')
    .select('raw_signals!inner(title, source, url, score)')
    .eq('trend_id', id)
    .limit(15) as { data: any[] | null }

  const seen = new Set<string>()
  const signals: SignalData[] = []
  for (const row of (signalRows || [])) {
    const sig = row.raw_signals
    if (!sig) continue
    const key = sig.url || sig.title
    if (seen.has(key)) continue
    seen.add(key)
    signals.push({ title: sig.title, source: sig.source, url: sig.url || null })
  }

  const parseJson = (v: unknown, fallback: unknown[]) => {
    if (!v) return fallback
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return fallback } }
    return v
  }

  let opportunity: OpportunityData | null = null
  let opportunity_explanation: OpportunityExplanationData | null = null

  if (snapshot) {
    const { data: oppRow } = await supabase
      .from('trend_opportunities')
      .select('id, suggested_actions, qualified, opportunity_score')
      .eq('trend_id', id)
      .eq('snapshot_id', snapshot.id)
      .single()

    if (oppRow) {
      const { data: explRow } = await supabase
        .from('opportunity_explanations')
        .select('why_now, why_this_trend, whats_the_risk')
        .eq('snapshot_id', snapshot.id)
        .limit(1)
        .single()

      opportunity_explanation = explRow ? {
        why_this_trend: explRow.why_this_trend || null,
        why_now: explRow.why_now || null,
        whats_the_risk: explRow.whats_the_risk || null,
      } : null

      opportunity = {
        id: oppRow.id || null,
        action_title: displayName,
        why_now: opportunity_explanation?.why_now || null,
        suggested_actions: oppRow.suggested_actions || null,
        qualified: oppRow.qualified || false,
        opportunity_score: oppRow.opportunity_score || null,
      }
    }
  }

  let intelligence: IntelligenceData | null = null
  if (snapshot) {
    const { data: intelRow } = await supabase
      .from('trend_intelligence')
      .select('summary, build_ideas, existing_solutions, risks')
      .eq('trend_id', id)
      .eq('snapshot_id', snapshot.id)
      .single()

    if (intelRow) {
      let buildIdeas = intelRow.build_ideas
      if (typeof buildIdeas === 'string') {
        try { buildIdeas = JSON.parse(buildIdeas) } catch { buildIdeas = [] }
      }
      let existingSolutions = intelRow.existing_solutions
      if (typeof existingSolutions === 'string') {
        try { existingSolutions = JSON.parse(existingSolutions) } catch { existingSolutions = [] }
      }
      intelligence = {
        summary: intelRow.summary || null,
        build_ideas: buildIdeas || [],
        existing_solutions: existingSolutions || [],
        risks: intelRow.risks || [],
      }
    }
  }

  let hypothesis: HypothesisData | null = null
  if (snapshot) {
    const { data: hRow } = await supabase
      .from('problem_hypotheses')
      .select('hypothesis_title, hypothesis_summary, hypothesis_status, confidence, who_it_affects, pain_signals, demand_evidence')
      .eq('trend_id', id)
      .eq('snapshot_id', snapshot.id)
      .limit(1)
      .single()

    if (hRow) {
      hypothesis = {
        hypothesis_title: hRow.hypothesis_title || '',
        hypothesis_summary: hRow.hypothesis_summary || null,
        hypothesis_status: hRow.hypothesis_status || 'uncertain',
        confidence: hRow.confidence || 0,
        who_it_affects: parseJson(hRow.who_it_affects, []) as string[],
        pain_signals: parseJson(hRow.pain_signals, []) as string[],
        demand_evidence: parseJson(hRow.demand_evidence, []) as { title: string; source: string; url: string }[],
      }
    }
  }

  let wedges: WedgeData[] = []
  if (snapshot) {
    const { data: wedgeRows } = await supabase
      .from('trend_wedges')
      .select('wedge_type, trigger_reason, confidence')
      .eq('trend_id', id)
      .eq('snapshot_id', snapshot.id)

    wedges = (wedgeRows || []).map(w => ({
      wedge_type: w.wedge_type,
      trigger_reason: w.trigger_reason,
      confidence: w.confidence,
    }))
  }

  // Phase 9d: Fetch prediction data
  let prediction: PredictionData | null = null
  if (snapshot) {
    const { data: predRow } = await supabase
      .from('trend_predictions')
      .select('growth_probability, predicted_direction, confidence_level, prediction_reasons')
      .eq('trend_id', id)
      .eq('snapshot_id', snapshot.id)
      .single()

    if (predRow) {
      prediction = {
        growth_probability: predRow.growth_probability || 0,
        predicted_direction: predRow.predicted_direction || 'steady',
        confidence_level: predRow.confidence_level || 'low',
        prediction_reasons: parseJson(predRow.prediction_reasons, []) as PredictionData['prediction_reasons'],
      }
    }
  }

  // Fetch pre-generated brief (Phase 3 + 9d)
  let preBrief: PreBriefData | null = null
  if (snapshot) {
    const { data: briefRow } = await supabase
      .from('opportunity_briefs')
      .select('synthesis, synthesis_citations, persona_roles, persona_pain_points, hypotheses, competition_narrative, competition_repos, competition_tools, validation_experiments, risk_narrative, risk_factors, is_draft, why_now_prediction, growth_indicator, pain_phrases')
      .eq('trend_id', id)
      .eq('snapshot_id', snapshot.id)
      .single()

    if (briefRow && !briefRow.is_draft) {
      const parseJ = (v: unknown, fallback: unknown) => {
        if (!v) return fallback
        if (typeof v === 'string') { try { return JSON.parse(v) } catch { return fallback } }
        return v
      }
      preBrief = {
        synthesis: briefRow.synthesis || null,
        synthesis_citations: parseJ(briefRow.synthesis_citations, null) as PreBriefData['synthesis_citations'],
        persona_roles: briefRow.persona_roles || null,
        persona_pain_points: parseJ(briefRow.persona_pain_points, null) as PreBriefData['persona_pain_points'],
        hypotheses: parseJ(briefRow.hypotheses, null) as PreBriefData['hypotheses'],
        competition_narrative: briefRow.competition_narrative || null,
        competition_repos: parseJ(briefRow.competition_repos, null) as PreBriefData['competition_repos'],
        competition_tools: parseJ(briefRow.competition_tools, null) as PreBriefData['competition_tools'],
        validation_experiments: parseJ(briefRow.validation_experiments, null) as PreBriefData['validation_experiments'],
        risk_narrative: briefRow.risk_narrative || null,
        risk_factors: parseJ(briefRow.risk_factors, null) as PreBriefData['risk_factors'],
        is_draft: briefRow.is_draft,
        why_now_prediction: briefRow.why_now_prediction || null,
        growth_indicator: briefRow.growth_indicator || null,
        pain_phrases: parseJ(briefRow.pain_phrases, null) as PreBriefData['pain_phrases'],
      }
    }
  }

  const finalTitle = getHypothesisDisplayTitle(hypothesis?.hypothesis_title, displayName, null, id)

  return {
    id: trend.id,
    theme: finalTitle,
    status: trend.status,
    first_seen: trend.first_seen,
    trajectory,
    peak_momentum,
    peak_momentum_at,
    current_stage,
    qualified_count,
    total_snapshots,
    timing,
    competition,
    signals: signals.slice(0, 10),
    opportunity,
    intelligence,
    hypothesis,
    wedges,
    opportunity_explanation,
    updated_at: snapshot?.run_at || null,
    preBrief,
    prediction,
  }
}

const COMPETITION_BADGES: Record<string, { label: string; color: string }> = {
  low: { label: 'Low competition', color: 'bg-emerald-50 text-emerald-700' },
  moderate: { label: 'Moderate competition', color: 'bg-amber-50 text-amber-700' },
  high: { label: 'High competition', color: 'bg-red-50 text-red-700' },
}

const TABS = [
  { key: 'brief', label: 'Brief' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'market', label: 'Market' },
]

function groupSignalsBySource(signals: SignalData[]): { source: string; items: SignalData[] }[] {
  const groups = new Map<string, SignalData[]>()
  for (const sig of signals) {
    const source = sig.source || 'unknown'
    if (!groups.has(source)) groups.set(source, [])
    groups.get(source)!.push(sig)
  }
  return Array.from(groups.entries()).map(([source, items]) => ({ source, items }))
}

function BriefTab({ trend }: { trend: TrendData }) {
  const pb = trend.preBrief

  // ── Phase 3 fast path ──────────────────────────────────────────────
  if (pb) {
    const painPoints = pb.persona_pain_points || []
    const hypotheses = pb.hypotheses || []
    const validationExps = pb.validation_experiments || []
    const riskFactors = pb.risk_factors || []

    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-2">What&apos;s happening</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {pb.synthesis || 'Not enough data yet. Check back after more pipeline runs.'}
          </p>
          {pb.synthesis_citations && pb.synthesis_citations.length > 0 && (
            <p className="text-xs text-slate-400 mt-2">
              Sources:{' '}
              {pb.synthesis_citations.map((c, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition">
                      {c.title} ({c.source})
                    </a>
                  ) : (
                    `${c.title} (${c.source})`
                  )}
                </span>
              ))}
            </p>
          )}
        </div>

        {pb.why_now_prediction && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Why now</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{pb.why_now_prediction}</p>
          </div>
        )}

        {(pb.persona_roles?.length || painPoints.length > 0) && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Who wants this</h2>
            {pb.persona_roles && pb.persona_roles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {pb.persona_roles.map((role, i) => (
                  <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium">{role}</span>
                ))}
              </div>
            )}
            {painPoints.length > 0 && (
              <div className="space-y-3">
                {painPoints.map((p, i) => (
                  <SignalQuote key={i} phrase={p.phrase} quote={p.quote} source={p.source} />
                ))}
              </div>
            )}
          </div>
        )}

        {hypotheses.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">What to build</h2>
            <div className="space-y-2">
              {hypotheses.map((h, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-slate-900">{h.idea}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {h.effort && <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{h.effort}</span>}
                    {h.audience && <span className="text-[11px] text-slate-500">{h.audience}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {validationExps.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">How to validate</h2>
            <div className="space-y-2">
              {validationExps.map((v, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-slate-900">{v.title}</p>
                  {v.description && <p className="text-sm text-slate-600 mt-0.5">{v.description}</p>}
                  {v.success_criteria && <p className="text-xs text-slate-400 mt-1">{v.success_criteria}</p>}
                  {v.effort && <span className="inline-block mt-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{v.effort}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Risks &amp; unknowns</h2>
          {pb.risk_narrative && (
            <p className="text-sm text-slate-600 leading-relaxed mb-3">{pb.risk_narrative}</p>
          )}
          {riskFactors.length > 0 ? (
            <div className="space-y-2">
              {riskFactors.map((r, i) => (
                <RiskIndicator key={i} label={r.label} severity={r.severity} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No significant risks identified yet.</p>
          )}
        </div>
        <BriefFeedback opportunityId={trend.opportunity?.id ?? null} />
      </div>
    )
  }

  // ── Fallback: assembled brief ──────────────────────────────────────
  const timingLabels: Record<string, string> = {
    early_edge: 'The market window is open — early movers have an advantage right now.',
    too_early: 'Still very early — limited data, but worth watching.',
    crowded: 'The space is getting crowded. Differentiation is key.',
    late_but_monetizable: 'Late to the trend, but monetization paths still exist.',
  }

  const sourceBreakdown: Record<string, number> = {}
  for (const sig of trend.signals) {
    sourceBreakdown[sig.source] = (sourceBreakdown[sig.source] || 0) + 1
  }

  const whyNow: string[] = []
  if (trend.timing && timingLabels[trend.timing.timing_label]) {
    whyNow.push(timingLabels[trend.timing.timing_label])
  }
  const demandEvidence = trend.hypothesis?.demand_evidence || []
  if (demandEvidence.length > 0) {
    whyNow.push(`${demandEvidence.length} demand signal${demandEvidence.length > 1 ? 's' : ''} detected — people are actively looking for solutions.`)
  }
  if (trend.signals.length >= 3) {
    const sources = Object.keys(sourceBreakdown)
    whyNow.push(`Evidence from ${sources.length} independent source${sources.length > 1 ? 's' : ''} (${sources.join(', ')}).`)
  }
  if (trend.current_stage === 'rising') {
    whyNow.push('Momentum is accelerating — signal volume is increasing.')
  }

  const whoWantsThis = trend.hypothesis?.who_it_affects || []
  const painSignals = trend.hypothesis?.pain_signals || []
  const buildIdeas = trend.intelligence?.build_ideas || []

  let suggestedActions: string[] = []
  if (trend.opportunity?.suggested_actions) {
    if (typeof trend.opportunity.suggested_actions === 'string') {
      try { suggestedActions = JSON.parse(trend.opportunity.suggested_actions) } catch { suggestedActions = (trend.opportunity.suggested_actions as string).split('\n').filter(Boolean) }
    } else if (Array.isArray(trend.opportunity.suggested_actions)) {
      suggestedActions = trend.opportunity.suggested_actions
    }
  }

  const howToValidate: string[] = []
  const keyword = trend.theme.split(' ').slice(0, 3).join(' ')
  howToValidate.push(`Search for "${keyword}" on Twitter/Reddit to gauge real-time interest.`)
  if (whoWantsThis.length > 0) {
    howToValidate.push(`Interview 3-5 ${whoWantsThis[0].toLowerCase()} about their current workflow and pain points.`)
  }
  howToValidate.push('Build a landing page describing your solution and measure signup conversion.')
  if (buildIdeas.length > 0) {
    howToValidate.push(`Prototype the simplest version of "${buildIdeas[0]?.idea || 'your solution'}" in a weekend.`)
  }
  howToValidate.push('Post your prototype to relevant communities and track engagement.')

  const allRisks: string[] = [...(trend.intelligence?.risks || [])]
  if (trend.competition && trend.competition.competition_level === 'high') {
    allRisks.push('High competition — many players are already building in this space.')
  }
  if (trend.timing?.expiry_risk === 'high') {
    allRisks.push('The opportunity window may be closing soon.')
  }
  if (trend.opportunity_explanation?.whats_the_risk) {
    allRisks.push(trend.opportunity_explanation.whats_the_risk)
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">What&apos;s happening</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {trend.hypothesis?.hypothesis_summary || trend.intelligence?.summary || 'Not enough data yet. Check back after more pipeline runs.'}
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">Why now</h2>
        {whyNow.length > 0 ? (
          <ul className="space-y-1.5">
            {whyNow.map((item, i) => (
              <li key={i} className="text-sm text-slate-600 flex gap-2">
                <span className="text-slate-400 shrink-0">&bull;</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Waiting for more evidence.</p>
        )}
      </div>

      {whoWantsThis.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Who wants this</h2>
          <div className="flex flex-wrap gap-2">
            {whoWantsThis.map((persona, i) => (
              <span key={i} className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs">
                {persona}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">What to build</h2>
        {buildIdeas.length > 0 ? (
          <div className="space-y-2">
            {buildIdeas.map((idea, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-medium text-slate-900">{idea.idea}</p>
                <div className="flex items-center gap-3 mt-1">
                  {idea.effort && (
                    <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{idea.effort}</span>
                  )}
                  {idea.audience && (
                    <span className="text-[11px] text-slate-500">{idea.audience}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : suggestedActions.length > 0 ? (
          <ul className="space-y-1.5">
            {suggestedActions.slice(0, 5).map((action, i) => (
              <li key={i} className="text-sm text-slate-600 flex gap-2">
                <span className="text-slate-400 shrink-0">&bull;</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Build ideas will appear once more evidence is collected.</p>
        )}
      </div>

      {painSignals.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Pain signals</h2>
          <ul className="space-y-1.5">
            {painSignals.map((pain, i) => (
              <li key={i} className="text-sm text-slate-600 flex gap-2">
                <span className="text-slate-400 shrink-0">&bull;</span>
                <span>{pain}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">How to validate</h2>
        <ol className="space-y-1.5">
          {howToValidate.map((step, i) => (
            <li key={i} className="text-sm text-slate-600 flex gap-2">
              <span className="text-slate-400 shrink-0 tabular-nums w-5">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-2">Risks &amp; unknowns</h2>
        {allRisks.length > 0 ? (
          <ul className="space-y-1.5">
            {allRisks.map((risk, i) => (
              <li key={i} className="text-sm text-slate-600 flex gap-2">
                <span className="text-slate-400 shrink-0">&bull;</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No significant risks identified yet.</p>
        )}
      </div>
      <BriefFeedback opportunityId={trend.opportunity?.id ?? null} />
    </div>
  )
}

function EvidenceTab({ trend }: { trend: TrendData }) {
  const signalGroups = groupSignalsBySource(trend.signals)
  const demandEvidence = trend.hypothesis?.demand_evidence || []

  if (trend.signals.length === 0 && demandEvidence.length === 0) {
    return (
      <div className="border border-slate-200 rounded-lg p-8 text-center">
        <p className="text-sm text-slate-500">No evidence signals collected yet.</p>
        <p className="text-xs text-slate-400 mt-1">Signals will appear after the next pipeline run.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {signalGroups.length > 0 && (
        <div className="space-y-5">
          {signalGroups.map((group) => (
            <div key={group.source}>
              <div className="flex items-center gap-2 mb-2">
                <SourceBadge source={group.source} />
                <span className="text-xs text-slate-400">{group.items.length} signal{group.items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-1.5 pl-1">
                {group.items.map((sig, i) => (
                  <div key={i} className="py-1">
                    {sig.url ? (
                      <a
                        href={sig.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-slate-700 hover:text-indigo-600 transition"
                      >
                        {sig.title}
                      </a>
                    ) : (
                      <span className="text-sm text-slate-700">{sig.title}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {demandEvidence.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">Demand signals detected</h2>
          <ul className="space-y-1.5">
            {demandEvidence.map((d, i) => (
              <li key={i} className="text-sm text-slate-600 flex gap-2">
                <span className="text-slate-400 shrink-0">&bull;</span>
                <span>
                  <span className="text-slate-400 text-xs">[{d.source}]</span>{' '}
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition">
                      {d.title}
                    </a>
                  ) : d.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function MarketTab({ trend }: { trend: TrendData }) {
  const pb = trend.preBrief
  const compBadge = trend.competition ? COMPETITION_BADGES[trend.competition.competition_level] : null
  const existingSolutions = trend.intelligence?.existing_solutions || []

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Competition</h2>
        {pb?.competition_narrative ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 leading-relaxed">{pb.competition_narrative}</p>
            {pb.competition_repos && pb.competition_repos.length > 0 && (
              <p className="text-xs text-slate-500">
                Open source: {pb.competition_repos.map(r => r.name).join(', ')}
              </p>
            )}
            {pb.competition_tools && pb.competition_tools.length > 0 && (
              <p className="text-xs text-slate-500">
                Related tools: {pb.competition_tools.map(t => t.name).join(', ')}
              </p>
            )}
          </div>
        ) : compBadge ? (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${compBadge.color}`}>
            {compBadge.label}
          </span>
        ) : (
          <p className="text-sm text-slate-400">Competition data not available yet.</p>
        )}
      </div>

      {!pb && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">Who&apos;s already building</h2>
          {existingSolutions.length > 0 ? (
            <div className="space-y-2">
              {existingSolutions.map((sol, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-slate-900">{sol.name}</p>
                  {sol.gap && <p className="text-xs text-slate-500 mt-0.5">{sol.gap}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Not enough data to identify competitors yet.</p>
          )}
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Differentiation opportunities</h2>
        {trend.wedges.length > 0 ? (
          <div className="space-y-2">
            {trend.wedges.map((w, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{w.wedge_type}</span>
                </div>
                <p className="text-sm text-slate-600">{w.trigger_reason}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Market wedge analysis requires more data.</p>
        )}
      </div>
    </div>
  )
}


export default async function TrendDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const activeTab = tab || 'brief'

  const trend = await getTrendData(id)

  if (!trend) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-6">
          <Link href="/explore" className="text-sm text-slate-500 hover:text-indigo-600 transition">
            &larr; Back to Trends
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-3">
          {trend.theme}
        </h1>

        <div className="flex items-center gap-2 flex-wrap mb-2">
          {trend.opportunity?.qualified ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
              Ready to build
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
              Forming
            </span>
          )}
          {trend.prediction && (
            <>
              {trend.prediction.predicted_direction === 'breakout' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
                  Breakout signal
                </span>
              )}
              {trend.prediction.predicted_direction === 'accelerating' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                  Accelerating
                </span>
              )}
              {trend.prediction.predicted_direction === 'declining' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">
                  Declining
                </span>
              )}
              {trend.prediction.growth_probability > 0.5 && (
                <span className="text-xs text-slate-400">
                  {Math.round(trend.prediction.growth_probability * 100)}% growth probability
                </span>
              )}
            </>
          )}
        </div>

        {trend.updated_at && (
          <p className="text-xs text-slate-400 mb-6">
            Updated: {new Date(trend.updated_at).toLocaleDateString()}
          </p>
        )}

        <div className="border-b border-slate-200 mb-8">
          <nav className="flex gap-6">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/trends/${id}?tab=${t.key}`}
                className={`pb-3 text-sm font-medium transition ${
                  activeTab === t.key
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>

        {activeTab === 'brief' && <BriefTab trend={trend} />}
        {activeTab === 'evidence' && <EvidenceTab trend={trend} />}
        {activeTab === 'market' && <MarketTab trend={trend} />}

        <div className="text-xs text-slate-400 mt-10">
          <details>
            <summary className="cursor-pointer hover:text-slate-500">System info</summary>
            <div className="mt-2 space-y-1">
              <p>First seen: {new Date(trend.first_seen).toLocaleDateString()}</p>
              <p>{trend.total_snapshots} snapshots tracked</p>
              {trend.preBrief && <p>Brief: pre-generated</p>}
            </div>
          </details>
        </div>
      </div>
      <ChatPanel trendId={id} trendName={trend.theme} />
    </div>
  )
}
