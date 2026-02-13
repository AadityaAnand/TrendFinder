import { getServerSupabase, getLatestSnapshot, getHypothesisDisplayTitle, getTrendDisplayName } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SourceBadge } from '../../components/SourceBadge'
import { MetricExplainer } from '../../components/MetricExplainer'

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
      .select('suggested_actions, qualified, opportunity_score')
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
  }
}

const STAGE_PILLS: Record<string, { label: string; color: string }> = {
  emerging: { label: 'Emerging', color: 'bg-blue-50 text-blue-700' },
  rising: { label: 'Rising', color: 'bg-emerald-50 text-emerald-700' },
  peaking: { label: 'Peaking', color: 'bg-amber-50 text-amber-700' },
  stable: { label: 'Stable', color: 'bg-slate-100 text-slate-600' },
  declining: { label: 'Declining', color: 'bg-red-50 text-red-700' },
}

const COMPETITION_BADGES: Record<string, { label: string; color: string }> = {
  low: { label: 'Low competition', color: 'bg-emerald-50 text-emerald-700' },
  moderate: { label: 'Moderate competition', color: 'bg-amber-50 text-amber-700' },
  high: { label: 'High competition', color: 'bg-red-50 text-red-700' },
}

const STAGES_ORDER = ['emerging', 'rising', 'peaking', 'stable', 'declining']

const TABS = [
  { key: 'brief', label: 'Brief' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'market', label: 'Market' },
  { key: 'metrics', label: 'Metrics' },
]

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const current = new Date(start)
  const endDate = new Date(end)
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  return dates
}

function groupSignalsBySource(signals: SignalData[]): { source: string; items: SignalData[] }[] {
  const groups = new Map<string, SignalData[]>()
  for (const sig of signals) {
    const source = sig.source || 'unknown'
    if (!groups.has(source)) groups.set(source, [])
    groups.get(source)!.push(sig)
  }
  return Array.from(groups.entries()).map(([source, items]) => ({ source, items }))
}

function MomentumChart({ trajectory }: { trajectory: TrajectoryPoint[] }) {
  if (trajectory.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
        No trajectory data yet
      </div>
    )
  }

  const timestamps = trajectory.map(p => p.timestamp).filter(Boolean) as string[]
  if (timestamps.length < 2) {
    const point = trajectory[0]
    return (
      <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-sm gap-1">
        <span>Single data point collected</span>
        {point?.momentum !== null && point?.momentum !== undefined && (
          <span className="text-slate-600 font-medium">Momentum: {point.momentum.toFixed(2)}</span>
        )}
        <span className="text-xs">More data points will appear after the next pipeline run.</span>
      </div>
    )
  }

  const startDate = timestamps[0].split('T')[0]
  const endDate = timestamps[timestamps.length - 1].split('T')[0]
  const allDates = getDateRange(startDate, endDate)

  const dataByDate: Record<string, TrajectoryPoint> = {}
  for (const point of trajectory) {
    if (point.timestamp) {
      const date = point.timestamp.split('T')[0]
      dataByDate[date] = point
    }
  }

  const filledData = allDates.map(date => ({
    date,
    point: dataByDate[date] || null,
    hasData: !!dataByDate[date],
  }))

  const gapCount = filledData.filter(d => !d.hasData).length
  const momentums = trajectory.map(p => p.momentum || 0)
  const maxMomentum = Math.max(...momentums, 0.1)
  const minMomentum = Math.min(...momentums, 0)
  const range = maxMomentum - minMomentum || 1

  const width = 100
  const height = 48
  const padding = 2

  const segments: { points: string; isGap: boolean }[] = []
  let currentSegment: string[] = []
  let lastWasGap = true

  filledData.forEach((d, i) => {
    const x = padding + (i / (filledData.length - 1 || 1)) * (width - 2 * padding)
    if (d.hasData && d.point) {
      const y = height - padding - ((d.point.momentum || 0) - minMomentum) / range * (height - 2 * padding)
      if (lastWasGap && currentSegment.length > 0) {
        segments.push({ points: currentSegment.join(' '), isGap: false })
        currentSegment = []
      }
      currentSegment.push(`${x},${y}`)
      lastWasGap = false
    } else {
      if (!lastWasGap && currentSegment.length > 0) {
        segments.push({ points: currentSegment.join(' '), isGap: false })
        currentSegment = []
      }
      lastWasGap = true
    }
  })

  if (currentSegment.length > 0) {
    segments.push({ points: currentSegment.join(' '), isGap: false })
  }

  return (
    <div className="h-48 relative">
      {gapCount > 0 && (
        <div className="absolute top-0 left-0 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
          {gapCount} missing day{gapCount !== 1 ? 's' : ''}
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {segments.map((seg, i) => (
          <polyline key={i} fill="none" stroke="#4F46E5" strokeWidth="0.5" points={seg.points} />
        ))}
        {filledData.map((d, i) => {
          if (!d.hasData || !d.point) return null
          const x = padding + (i / (filledData.length - 1 || 1)) * (width - 2 * padding)
          const y = height - padding - ((d.point.momentum || 0) - minMomentum) / range * (height - 2 * padding)
          return (
            <circle key={i} cx={x} cy={y} r={d.point.qualified ? 1.5 : 0.8} fill={d.point.qualified ? '#4F46E5' : '#94A3B8'} />
          )
        })}
      </svg>
      <div className="absolute top-0 right-0 text-xs text-slate-400">{maxMomentum.toFixed(2)}</div>
      <div className="absolute bottom-0 right-0 text-xs text-slate-400">{minMomentum.toFixed(2)}</div>
    </div>
  )
}

function StageTimeline({ trajectory }: { trajectory: TrajectoryPoint[] }) {
  const stageColors: Record<string, string> = {
    emerging: 'bg-blue-50 text-blue-700',
    rising: 'bg-emerald-50 text-emerald-700',
    peaking: 'bg-amber-50 text-amber-700',
    stable: 'bg-slate-100 text-slate-600',
    declining: 'bg-red-50 text-red-700',
  }

  const stages: { stage: string; count: number }[] = []
  let cs = ''
  for (const point of trajectory) {
    if (point.stage && point.stage !== cs) {
      stages.push({ stage: point.stage, count: 1 })
      cs = point.stage
    } else if (stages.length > 0) {
      stages[stages.length - 1].count++
    }
  }

  if (stages.length === 0) {
    return <div className="text-slate-400 text-sm">No stage data</div>
  }

  const total = trajectory.length

  return (
    <div className="flex h-6 rounded overflow-hidden">
      {stages.map((s, i) => (
        <div
          key={i}
          className={`${stageColors[s.stage] || 'bg-slate-100 text-slate-600'} flex items-center justify-center text-xs font-medium`}
          style={{ width: `${(s.count / total) * 100}%` }}
          title={`${s.stage}: ${s.count} snapshots`}
        >
          {s.count >= 2 && s.stage}
        </div>
      ))}
    </div>
  )
}

function BriefTab({ trend }: { trend: TrendData }) {
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
  const compBadge = trend.competition ? COMPETITION_BADGES[trend.competition.competition_level] : null
  const existingSolutions = trend.intelligence?.existing_solutions || []

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Competition</h2>
        {compBadge ? (
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${compBadge.color}`}>
              {compBadge.label}
            </span>
            {trend.competition && trend.competition.saturation_score > 0 && (
              <span className="text-xs text-slate-500">Saturation: {Math.round(trend.competition.saturation_score * 100)}%</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Competition data not available yet.</p>
        )}
      </div>

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

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Differentiation opportunities</h2>
        {trend.wedges.length > 0 ? (
          <div className="space-y-2">
            {trend.wedges.map((w, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{w.wedge_type}</span>
                  {w.confidence > 0 && (
                    <span className="text-xs text-slate-400">{Math.round(w.confidence * 100)}% confidence</span>
                  )}
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

function MetricsTab({ trend }: { trend: TrendData }) {
  const latestPoint = trend.trajectory[trend.trajectory.length - 1]

  return (
    <div className="space-y-8">
      {latestPoint ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Current Momentum</div>
              <div className="text-xl font-bold text-slate-900">
                {latestPoint.momentum?.toFixed(2) || '\u2014'}
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Peak Momentum</div>
              <div className="text-xl font-bold text-slate-900">
                {trend.peak_momentum?.toFixed(2) || '\u2014'}
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Times Qualified</div>
              <div className="text-xl font-bold text-slate-900">{trend.qualified_count}</div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Current Signals</div>
              <div className="text-xl font-bold text-slate-900">
                {latestPoint.signal_count || '\u2014'}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Momentum Over Time</h3>
            <div className="border border-slate-200 rounded-lg p-4">
              <MomentumChart trajectory={trend.trajectory} />
              {trend.trajectory.length >= 2 && (
                <div className="flex justify-between text-xs text-slate-400 mt-2">
                  <span>
                    {trend.trajectory[0]?.timestamp
                      ? new Date(trend.trajectory[0].timestamp).toLocaleDateString()
                      : '\u2014'}
                  </span>
                  <span>
                    {latestPoint?.timestamp
                      ? new Date(latestPoint.timestamp).toLocaleDateString()
                      : '\u2014'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Lifecycle Stages</h3>
            <div className="border border-slate-200 rounded-lg p-4">
              <StageTimeline trajectory={trend.trajectory} />
              <div className="flex gap-4 mt-3 text-xs">
                {STAGES_ORDER.map(stage => (
                  <span key={stage} className="flex items-center gap-1">
                    <span className={`w-3 h-3 rounded ${STAGE_PILLS[stage]?.color.split(' ')[0] || 'bg-slate-100'}`}></span>
                    <span className="text-slate-500">{STAGE_PILLS[stage]?.label || stage}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Snapshot History</h3>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-slate-500 font-medium text-xs">Date</th>
                    <th className="px-4 py-2.5 text-left text-slate-500 font-medium text-xs">Momentum</th>
                    <th className="px-4 py-2.5 text-left text-slate-500 font-medium text-xs">Signals</th>
                    <th className="px-4 py-2.5 text-left text-slate-500 font-medium text-xs">Stage</th>
                    <th className="px-4 py-2.5 text-left text-slate-500 font-medium text-xs">Qualified</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trend.trajectory].reverse().slice(0, 10).map((point, i) => (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="px-4 py-2.5 text-slate-900 text-xs">
                        {point.timestamp ? new Date(point.timestamp).toLocaleDateString() : '\u2014'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-900 text-xs tabular-nums">
                        {point.momentum?.toFixed(3) || '\u2014'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-900 text-xs">
                        {point.signal_count || '\u2014'}
                      </td>
                      <td className="px-4 py-2.5">
                        {point.stage && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            STAGE_PILLS[point.stage]?.color || 'bg-slate-100 text-slate-600'
                          }`}>
                            {point.stage}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {point.qualified ? (
                          <span className="text-indigo-600 text-xs">Yes</span>
                        ) : (
                          <span className="text-slate-400 text-xs">{'\u2014'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-500">No snapshot data available yet.</p>
          <p className="text-xs text-slate-400 mt-1">Analytics will appear after the pipeline processes this trend.</p>
        </div>
      )}

      <MetricExplainer metrics={[
        'momentum',
        ...(trend.peak_momentum ? ['peak_momentum'] : []),
        'signal_count',
        'stage',
        'qualified',
        ...(trend.timing ? ['timing'] : []),
        ...(trend.competition ? ['competition'] : []),
      ]} />
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

  const stageConfig = trend.current_stage ? STAGE_PILLS[trend.current_stage] : null

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
          {stageConfig && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stageConfig.color}`}>
              {stageConfig.label}
            </span>
          )}
          {trend.hypothesis && trend.hypothesis.confidence > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {Math.round(trend.hypothesis.confidence * 100)}% confidence
            </span>
          )}
          {trend.opportunity?.qualified ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
              Qualified
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
              Not qualified
            </span>
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
        {activeTab === 'metrics' && <MetricsTab trend={trend} />}

        <div className="text-xs text-slate-400 mt-10">
          <details>
            <summary className="cursor-pointer hover:text-slate-500">System info</summary>
            <div className="mt-2 space-y-1">
              <p>Scoring: norm-p90-decay7d-v1</p>
              <p>Lifecycle: lifecycle-v1</p>
              {trend.timing && <p>Timing: timing-v1</p>}
              {trend.competition && <p>Competition: competition-v1</p>}
              <p>{trend.total_snapshots} snapshots tracked</p>
              <p>First seen: {new Date(trend.first_seen).toLocaleDateString()}</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
