import { getServerSupabase, getLatestSnapshot, getTrendDisplayName, getHypothesisDisplayTitle } from '@/lib/supabase-server'
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
    .select('timing_label, confidence')
    .eq('trend_id', id)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single()

  if (timingRow) {
    timing = { timing_label: timingRow.timing_label, confidence: timingRow.confidence }
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
      confidence: compRow.confidence
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

  let opportunity: OpportunityData | null = null
  const snapshot = await getLatestSnapshot(supabase)

  if (snapshot) {
    const { data: oppRow } = await supabase
      .from('trend_opportunities')
      .select('suggested_actions, qualified')
      .eq('trend_id', id)
      .eq('snapshot_id', snapshot.id)
      .single()

    let why_now: string | null = null
    if (oppRow) {
      const { data: explRow } = await supabase
        .from('opportunity_explanations')
        .select('why_now, why_this_trend')
        .eq('snapshot_id', snapshot.id)
        .limit(1)
        .single()
      why_now = explRow?.why_now || null
    }

    if (oppRow) {
      opportunity = {
        action_title: displayName,
        why_now,
        suggested_actions: oppRow.suggested_actions || null,
        qualified: oppRow.qualified || false,
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
      const parseJson = (v: unknown, fallback: unknown[]) => {
        if (!v) return fallback
        if (typeof v === 'string') { try { return JSON.parse(v) } catch { return fallback } }
        return v
      }
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
  }
}

const TIMING_CONFIG: Record<string, { text: string; color: string; description: string }> = {
  too_early: { text: 'Too Early', color: 'bg-blue-900/30 text-blue-400', description: 'Not enough data to act yet' },
  early_edge: { text: 'Early Edge', color: 'bg-emerald-900/30 text-emerald-400', description: 'Good window to enter before the crowd' },
  crowded: { text: 'Crowded', color: 'bg-amber-900/30 text-amber-400', description: 'Many players already building here' },
  late_but_monetizable: { text: 'Late but Monetizable', color: 'bg-yellow-900/30 text-yellow-400', description: 'Saturating, but revenue paths remain' },
  timing_uncertain: { text: 'Uncertain', color: 'bg-[var(--surface)] text-[var(--text-secondary)]', description: 'Insufficient data for timing classification' }
}

const COMPETITION_CONFIG: Record<string, { text: string; color: string; description: string }> = {
  low: { text: 'Low competition', color: 'bg-emerald-900/30 text-emerald-400', description: 'Few established players' },
  moderate: { text: 'Moderate competition', color: 'bg-yellow-900/30 text-yellow-400', description: 'Some competition exists' },
  high: { text: 'High competition', color: 'bg-red-900/30 text-red-400', description: 'Many players building here' },
  uncertain: { text: 'Unknown', color: 'bg-[var(--surface)] text-[var(--text-secondary)]', description: 'Not enough data to assess' }
}

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  emerging: { label: 'Emerging', color: 'bg-blue-900/30 text-blue-400' },
  rising: { label: 'Rising', color: 'bg-green-900/30 text-green-400' },
  peaking: { label: 'Peaking', color: 'bg-yellow-900/30 text-yellow-400' },
  stable: { label: 'Stable', color: 'bg-[var(--surface)] text-[var(--text-secondary)]' },
  declining: { label: 'Declining', color: 'bg-red-900/30 text-red-400' }
}

const STAGES_ORDER = ['emerging', 'rising', 'peaking', 'stable', 'declining']

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

function MomentumChart({ trajectory }: { trajectory: TrajectoryPoint[] }) {
  if (trajectory.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-[var(--text-tertiary)] text-sm">
        No trajectory data yet
      </div>
    )
  }

  const timestamps = trajectory.map(p => p.timestamp).filter(Boolean) as string[]
  if (timestamps.length < 2) {
    const point = trajectory[0]
    return (
      <div className="h-48 flex flex-col items-center justify-center text-[var(--text-tertiary)] text-sm gap-1">
        <span>Single data point collected</span>
        {point?.momentum !== null && point?.momentum !== undefined && (
          <span className="text-[var(--text-secondary)] font-medium">Momentum: {point.momentum.toFixed(2)}</span>
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
    hasData: !!dataByDate[date]
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
        <div className="absolute top-0 left-0 text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded">
          {gapCount} missing day{gapCount !== 1 ? 's' : ''}
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {segments.map((seg, i) => (
          <polyline key={i} fill="none" stroke="#818CF8" strokeWidth="0.5" points={seg.points} />
        ))}
        {filledData.map((d, i) => {
          if (!d.hasData || !d.point) return null
          const x = padding + (i / (filledData.length - 1 || 1)) * (width - 2 * padding)
          const y = height - padding - ((d.point.momentum || 0) - minMomentum) / range * (height - 2 * padding)
          return (
            <circle key={i} cx={x} cy={y} r={d.point.qualified ? 1.5 : 0.8} fill={d.point.qualified ? '#818CF8' : '#5C6478'} />
          )
        })}
      </svg>
      <div className="absolute top-0 right-0 text-xs text-[var(--text-tertiary)]">{maxMomentum.toFixed(2)}</div>
      <div className="absolute bottom-0 right-0 text-xs text-[var(--text-tertiary)]">{minMomentum.toFixed(2)}</div>
    </div>
  )
}

function StageTimeline({ trajectory }: { trajectory: TrajectoryPoint[] }) {
  const stageColors: Record<string, string> = {
    emerging: 'bg-blue-900/30 text-blue-400',
    rising: 'bg-green-900/30 text-green-400',
    peaking: 'bg-yellow-900/30 text-yellow-400',
    stable: 'bg-[var(--surface)] text-[var(--text-secondary)]',
    declining: 'bg-red-900/30 text-red-400'
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
    return <div className="text-[var(--text-tertiary)] text-sm">No stage data</div>
  }

  const total = trajectory.length

  return (
    <div className="flex h-6 rounded overflow-hidden">
      {stages.map((s, i) => (
        <div
          key={i}
          className={`${stageColors[s.stage] || 'bg-[var(--surface)] text-[var(--text-secondary)]'} flex items-center justify-center text-xs font-medium`}
          style={{ width: `${(s.count / total) * 100}%` }}
          title={`${s.stage}: ${s.count} snapshots`}
        >
          {s.count >= 2 && s.stage}
        </div>
      ))}
    </div>
  )
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

export default async function TrendDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const trend = await getTrendData(id)

  if (!trend) {
    notFound()
  }

  const latestPoint = trend.trajectory[trend.trajectory.length - 1]
  const timingConfig = trend.timing ? TIMING_CONFIG[trend.timing.timing_label] : null
  const compConfig = trend.competition ? COMPETITION_CONFIG[trend.competition.competition_level] : null
  const stageConfig = trend.current_stage ? STAGE_CONFIG[trend.current_stage] : null
  const isSingleSnapshot = trend.total_snapshots <= 1

  const narrativeParts: string[] = []
  if (stageConfig && trend.current_stage) {
    narrativeParts.push(`This trend is currently in the ${stageConfig.label.toLowerCase()} phase.`)
  }
  if (timingConfig) {
    narrativeParts.push(timingConfig.description + '.')
  }
  if (compConfig) {
    narrativeParts.push(compConfig.description + '.')
  }
  if (isSingleSnapshot) {
    narrativeParts.push('This trend was just detected — more data will arrive after the next pipeline run.')
  }

  const signalGroups = groupSignalsBySource(trend.signals)

  return (
    <div className="min-h-screen bg-[var(--bg-0)]">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-6 text-sm">
          <Link href="/for-you" className="text-[var(--text-tertiary)] hover:text-[var(--text-accent)] transition">For You</Link>
          <span className="text-[var(--text-tertiary)]">/</span>
          <Link href="/explore" className="text-[var(--text-tertiary)] hover:text-[var(--text-accent)] transition">Explore</Link>
        </div>

        <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight mb-2">
          {trend.theme}
        </h1>

        <div className="flex items-center gap-2 flex-wrap mb-4">
          {trend.hypothesis && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              trend.hypothesis.hypothesis_status === 'valid' ? 'bg-[var(--accent-subtle)] text-[var(--text-accent)]'
              : trend.hypothesis.hypothesis_status === 'topic_only' ? 'bg-[var(--surface)] text-[var(--text-secondary)]'
              : 'bg-amber-900/20 text-amber-400'
            }`}>
              {trend.hypothesis.hypothesis_status === 'valid' ? 'Valid hypothesis'
              : trend.hypothesis.hypothesis_status === 'topic_only' ? 'Topic only'
              : 'Uncertain'}
            </span>
          )}
          {stageConfig && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stageConfig.color}`}>
              {stageConfig.label}
            </span>
          )}
          {timingConfig && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${timingConfig.color}`}>
              {timingConfig.text}
            </span>
          )}
          {compConfig && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${compConfig.color}`}>
              {compConfig.text}
            </span>
          )}
          {isSingleSnapshot && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-900/20 text-amber-400">
              New — 1 snapshot
            </span>
          )}
        </div>

        {narrativeParts.length > 0 && (
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6 max-w-2xl">
            {narrativeParts.join(' ')}
          </p>
        )}

        {trend.hypothesis && trend.hypothesis.hypothesis_status !== 'topic_only' && (
          <div className="mb-10 space-y-5">
            {trend.hypothesis.hypothesis_summary && (
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Problem hypothesis</h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{trend.hypothesis.hypothesis_summary}</p>
              </div>
            )}

            {trend.hypothesis.who_it_affects.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1.5">Who it affects</h2>
                <div className="flex flex-wrap gap-2">
                  {trend.hypothesis.who_it_affects.map((persona, i) => (
                    <span key={i} className="text-xs text-[var(--text-secondary)] bg-[var(--surface)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
                      {persona}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {trend.hypothesis.pain_signals.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1.5">Pain signals</h2>
                <ul className="space-y-1">
                  {trend.hypothesis.pain_signals.map((pain, i) => (
                    <li key={i} className="text-sm text-[var(--text-secondary)] flex gap-2">
                      <span className="text-[var(--accent-muted)] shrink-0">&bull;</span>
                      <span>{pain}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {trend.hypothesis.demand_evidence.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-1.5">Demand evidence</h2>
                <ul className="space-y-1">
                  {trend.hypothesis.demand_evidence.map((d, i) => (
                    <li key={i} className="text-xs text-[var(--text-secondary)]">
                      <span className="text-[var(--text-tertiary)]">[{d.source}]</span>{' '}
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-accent)] transition-colors">
                          {d.title}
                        </a>
                      ) : d.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {trend.hypothesis.confidence > 0 && (
              <p className="text-xs text-[var(--text-tertiary)]">
                Hypothesis confidence: {Math.round(trend.hypothesis.confidence * 100)}%
              </p>
            )}
          </div>
        )}

        {trend.intelligence && (
          <div className="mb-10 space-y-6">
            {trend.intelligence.summary && (
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Summary</h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{trend.intelligence.summary}</p>
              </div>
            )}

            {trend.intelligence.build_ideas.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">What to build</h2>
                <div className="space-y-2">
                  {trend.intelligence.build_ideas.map((idea, i) => (
                    <div key={i} className="border border-[var(--border)] rounded-lg p-3">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{idea.idea}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {idea.effort && (
                          <span className="text-[11px] text-[var(--text-tertiary)] bg-[var(--surface)] px-2 py-0.5 rounded">{idea.effort}</span>
                        )}
                        {idea.audience && (
                          <span className="text-[11px] text-[var(--text-tertiary)]">{idea.audience}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {trend.intelligence.existing_solutions.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Existing solutions</h2>
                <div className="space-y-1.5">
                  {trend.intelligence.existing_solutions.map((sol, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-[var(--text-secondary)]">{sol.name}</span>
                      {sol.gap && <span className="text-[var(--text-tertiary)]"> — {sol.gap}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {trend.intelligence.risks.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Risks</h2>
                <ul className="space-y-1">
                  {trend.intelligence.risks.map((risk, i) => (
                    <li key={i} className="text-sm text-[var(--text-secondary)] flex gap-2">
                      <span className="text-[var(--text-tertiary)] shrink-0">-</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {trend.opportunity && trend.opportunity.qualified && (
          <div className="mb-10 p-5 bg-[var(--accent-subtle)] border border-[var(--border-accent)] rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
              <span className="text-sm font-semibold text-[var(--text-accent)]">Qualified opportunity</span>
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">{trend.opportunity.action_title}</h3>
            {trend.opportunity.why_now && (
              <p className="text-sm text-[var(--text-secondary)] mb-3">{trend.opportunity.why_now}</p>
            )}
            {trend.opportunity.suggested_actions && (
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">What to build</p>
                <ul className="space-y-1">
                  {(Array.isArray(trend.opportunity.suggested_actions)
                    ? trend.opportunity.suggested_actions
                    : typeof trend.opportunity.suggested_actions === 'string'
                    ? (() => { try { return JSON.parse(trend.opportunity.suggested_actions as string) } catch { return (trend.opportunity.suggested_actions as string).split('\n').filter(Boolean) } })()
                    : []
                  ).slice(0, 3).map((action: string, i: number) => (
                    <li key={i} className="text-sm text-[var(--text-secondary)] flex gap-2">
                      <span className="text-[var(--text-tertiary)] shrink-0">-</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {trend.opportunity && !trend.opportunity.qualified && (
          <div className="mb-10 p-5 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-sm font-semibold text-[var(--text-secondary)]">Not qualified yet</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              This trend hasn&apos;t passed all evidence gates yet.
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              To qualify, a trend needs 2+ independent evidence sources, a buildable action, and sufficient lifecycle confidence.
            </p>
          </div>
        )}

        {trend.signals.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Evidence</h2>
            <div className="space-y-5">
              {signalGroups.map((group) => (
                <div key={group.source}>
                  <div className="flex items-center gap-2 mb-2">
                    <SourceBadge source={group.source} />
                    <span className="text-xs text-[var(--text-tertiary)]">{group.items.length} signal{group.items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {group.items.map((sig, i) => (
                      <div key={i} className="py-1">
                        {sig.url ? (
                          <a
                            href={sig.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-accent)] transition"
                          >
                            {sig.title}
                          </a>
                        ) : (
                          <span className="text-sm text-[var(--text-secondary)]">{sig.title}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {trend.signals.length === 0 && (
          <div className="mb-10 border border-[var(--border)] rounded-lg p-6 text-center">
            <p className="text-sm text-[var(--text-secondary)]">No evidence signals collected yet.</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">Signals will appear after the next pipeline run.</p>
          </div>
        )}

        <details className="border border-[var(--border)] rounded-xl mb-8">
          <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
            Detailed analytics
          </summary>
          <div className="px-5 pb-6 pt-2 border-t border-[var(--border)]">
            {latestPoint && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Current Momentum</div>
                  <div className="text-xl font-bold text-[var(--text-primary)]">
                    {latestPoint.momentum?.toFixed(2) || '\u2014'}
                  </div>
                </div>
                <div className="border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Peak Momentum</div>
                  <div className="text-xl font-bold text-[var(--text-primary)]">
                    {trend.peak_momentum?.toFixed(2) || '\u2014'}
                  </div>
                </div>
                <div className="border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Times Qualified</div>
                  <div className="text-xl font-bold text-[var(--text-primary)]">{trend.qualified_count}</div>
                </div>
                <div className="border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">Current Signals</div>
                  <div className="text-xl font-bold text-[var(--text-primary)]">
                    {latestPoint.signal_count || '\u2014'}
                  </div>
                </div>
              </div>
            )}

            {!latestPoint && (
              <div className="mb-8 p-4 bg-[var(--surface)] rounded-lg text-sm text-[var(--text-secondary)] text-center">
                No snapshot data available yet. Analytics will appear after the pipeline processes this trend.
              </div>
            )}

            {latestPoint && (
              <>
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Momentum Over Time</h3>
                  <div className="border border-[var(--border)] rounded-lg p-4">
                    <MomentumChart trajectory={trend.trajectory} />
                    {trend.trajectory.length >= 2 && (
                      <div className="flex justify-between text-xs text-[var(--text-tertiary)] mt-2">
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

                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Lifecycle Stages</h3>
                  <div className="border border-[var(--border)] rounded-lg p-4">
                    <StageTimeline trajectory={trend.trajectory} />
                    <div className="flex gap-4 mt-3 text-xs">
                      {STAGES_ORDER.map(stage => (
                        <span key={stage} className="flex items-center gap-1">
                          <span className={`w-3 h-3 rounded ${STAGE_CONFIG[stage]?.color.split(' ')[0] || 'bg-[var(--surface)]'}`}></span>
                          {STAGE_CONFIG[stage]?.label || stage}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Snapshot History</h3>
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--surface)]">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-[var(--text-secondary)] font-medium text-xs">Date</th>
                          <th className="px-4 py-2.5 text-left text-[var(--text-secondary)] font-medium text-xs">Momentum</th>
                          <th className="px-4 py-2.5 text-left text-[var(--text-secondary)] font-medium text-xs">Signals</th>
                          <th className="px-4 py-2.5 text-left text-[var(--text-secondary)] font-medium text-xs">Stage</th>
                          <th className="px-4 py-2.5 text-left text-[var(--text-secondary)] font-medium text-xs">Qualified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...trend.trajectory].reverse().slice(0, 10).map((point, i) => (
                          <tr key={i} className="border-t border-[var(--border)]">
                            <td className="px-4 py-2.5 text-[var(--text-primary)] text-xs">
                              {point.timestamp ? new Date(point.timestamp).toLocaleDateString() : '\u2014'}
                            </td>
                            <td className="px-4 py-2.5 text-[var(--text-primary)] text-xs tabular-nums">
                              {point.momentum?.toFixed(3) || '\u2014'}
                            </td>
                            <td className="px-4 py-2.5 text-[var(--text-primary)] text-xs">
                              {point.signal_count || '\u2014'}
                            </td>
                            <td className="px-4 py-2.5">
                              {point.stage && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                  STAGE_CONFIG[point.stage]?.color || 'bg-[var(--surface)] text-[var(--text-secondary)]'
                                }`}>
                                  {point.stage}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {point.qualified ? (
                                <span className="text-[var(--text-accent)] text-xs">Yes</span>
                              ) : (
                                <span className="text-[var(--text-tertiary)] text-xs">{'\u2014'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </details>

        <MetricExplainer metrics={[
          'momentum',
          ...(trend.peak_momentum ? ['peak_momentum'] : []),
          'signal_count',
          'stage',
          'qualified',
          ...(trend.timing ? ['timing'] : []),
          ...(trend.competition ? ['competition'] : []),
        ]} />

        <div className="text-xs text-[var(--text-tertiary)] mt-6">
          <details>
            <summary className="cursor-pointer hover:text-[var(--text-secondary)]">System info</summary>
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
