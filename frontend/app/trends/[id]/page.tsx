import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { notFound } from 'next/navigation'

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
}

async function getTrendData(id: string): Promise<TrendData | null> {
  const { data: trend } = await supabase
    .from('detected_trends')
    .select('id, theme, status, first_seen')
    .eq('id', id)
    .single()

  if (!trend) return null

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

  // Fetch timing signal (latest)
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

  // Fetch competition data (latest)
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

  return {
    ...trend,
    trajectory,
    peak_momentum,
    peak_momentum_at,
    current_stage,
    qualified_count,
    total_snapshots,
    timing,
    competition
  }
}

// --- UI Helper Components ---

const TIMING_CONFIG: Record<string, { text: string; color: string; description: string }> = {
  too_early: { text: 'Too Early', color: 'bg-blue-100 text-blue-700', description: 'Not enough data to act yet' },
  early_edge: { text: 'Early Edge', color: 'bg-emerald-100 text-emerald-700', description: 'Good window to enter before the crowd' },
  crowded: { text: 'Crowded', color: 'bg-amber-100 text-amber-700', description: 'Many players already building here' },
  late_but_monetizable: { text: 'Late but Monetizable', color: 'bg-yellow-100 text-yellow-700', description: 'Saturating, but revenue paths remain' },
  timing_uncertain: { text: 'Uncertain', color: 'bg-gray-100 text-gray-600', description: 'Insufficient data for timing classification' }
}

const COMPETITION_CONFIG: Record<string, { text: string; color: string }> = {
  low: { text: 'Low', color: 'bg-emerald-100 text-emerald-700' },
  moderate: { text: 'Moderate', color: 'bg-yellow-100 text-yellow-700' },
  high: { text: 'High', color: 'bg-red-100 text-red-700' },
  uncertain: { text: 'Unknown', color: 'bg-gray-100 text-gray-600' }
}

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  emerging: { label: 'Emerging', color: 'bg-blue-500' },
  rising: { label: 'Rising', color: 'bg-green-500' },
  peaking: { label: 'Peaking', color: 'bg-yellow-500' },
  stable: { label: 'Stable', color: 'bg-gray-400' },
  declining: { label: 'Declining', color: 'bg-red-500' }
}

const STAGES_ORDER = ['emerging', 'rising', 'peaking', 'stable', 'declining']

function LifecycleTimeline({ currentStage }: { currentStage: string }) {
  const currentIdx = STAGES_ORDER.indexOf(currentStage)
  return (
    <div className="flex items-center gap-1.5">
      {STAGES_ORDER.map((stage, i) => {
        const config = STAGE_CONFIG[stage]
        const isCurrent = stage === currentStage
        const isPast = currentIdx >= 0 && i < currentIdx
        return (
          <div key={stage} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  isCurrent ? `${config.color} w-12` :
                  isPast ? `${config.color} opacity-40 w-6` :
                  'bg-gray-200 w-6'
                }`}
              />
              <span className={`text-xs mt-1 ${isCurrent ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                {config.label}
              </span>
            </div>
            {i < STAGES_ORDER.length - 1 && (
              <div className={`w-3 h-px ${isPast || isCurrent ? 'bg-gray-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function DeltaBadge({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  const isPositive = value > 0
  const isZero = value === 0
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-gray-500">{label}:</span>
      <span className={isZero ? 'text-gray-400' : isPositive ? 'text-emerald-600' : 'text-red-600'}>
        {isPositive ? '+' : ''}{value.toFixed(3)}{suffix || ''}
      </span>
    </div>
  )
}

// --- Chart Components ---

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
      <div className="h-48 flex items-center justify-center text-gray-400">
        No trajectory data yet
      </div>
    )
  }

  const timestamps = trajectory.map(p => p.timestamp).filter(Boolean) as string[]
  if (timestamps.length < 2) {
    const momentums = trajectory.map(p => p.momentum || 0)
    const maxMomentum = Math.max(...momentums, 0.1)
    return (
      <div className="h-48 flex items-center justify-center text-gray-400">
        Single data point: {maxMomentum.toFixed(2)} momentum
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
        <div className="absolute top-0 left-0 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
          {gapCount} missing day{gapCount !== 1 ? 's' : ''}
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {segments.map((seg, i) => (
          <polyline
            key={i}
            fill="none"
            stroke="#10b981"
            strokeWidth="0.5"
            points={seg.points}
          />
        ))}
        {filledData.map((d, i) => {
          if (!d.hasData || !d.point) return null
          const x = padding + (i / (filledData.length - 1 || 1)) * (width - 2 * padding)
          const y = height - padding - ((d.point.momentum || 0) - minMomentum) / range * (height - 2 * padding)
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={d.point.qualified ? 1.5 : 0.8}
              fill={d.point.qualified ? '#10b981' : '#9ca3af'}
            />
          )
        })}
        {filledData.map((d, i) => {
          if (d.hasData) return null
          const x = padding + (i / (filledData.length - 1 || 1)) * (width - 2 * padding)
          return (
            <line
              key={`gap-${i}`}
              x1={x}
              y1={padding}
              x2={x}
              y2={height - padding}
              stroke="#fcd34d"
              strokeWidth="0.3"
              strokeDasharray="1,1"
              opacity={0.5}
            />
          )
        })}
      </svg>
      <div className="absolute top-0 right-0 text-xs text-gray-400">
        {maxMomentum.toFixed(2)}
      </div>
      <div className="absolute bottom-0 right-0 text-xs text-gray-400">
        {minMomentum.toFixed(2)}
      </div>
    </div>
  )
}

function StageTimeline({ trajectory }: { trajectory: TrajectoryPoint[] }) {
  const stageColors: Record<string, string> = {
    emerging: 'bg-blue-100 text-blue-700',
    rising: 'bg-green-100 text-green-700',
    peaking: 'bg-yellow-100 text-yellow-700',
    stable: 'bg-gray-100 text-gray-700',
    declining: 'bg-red-100 text-red-700'
  }

  const stages: { stage: string; count: number }[] = []
  let currentStage = ''

  for (const point of trajectory) {
    if (point.stage && point.stage !== currentStage) {
      stages.push({ stage: point.stage, count: 1 })
      currentStage = point.stage
    } else if (stages.length > 0) {
      stages[stages.length - 1].count++
    }
  }

  if (stages.length === 0) {
    return <div className="text-gray-400 text-sm">No stage data</div>
  }

  const total = trajectory.length

  return (
    <div className="flex h-6 rounded overflow-hidden">
      {stages.map((s, i) => (
        <div
          key={i}
          className={`${stageColors[s.stage] || 'bg-gray-100 text-gray-700'} flex items-center justify-center text-xs font-medium`}
          style={{ width: `${(s.count / total) * 100}%` }}
          title={`${s.stage}: ${s.count} snapshots`}
        >
          {s.count >= 2 && s.stage}
        </div>
      ))}
    </div>
  )
}

// --- What Changed Since Yesterday (NICE-TO-HAVE 9) ---

function WhatChanged({ trajectory }: { trajectory: TrajectoryPoint[] }) {
  if (trajectory.length < 2) return null

  const latest = trajectory[trajectory.length - 1]
  const previous = trajectory[trajectory.length - 2]

  const momentumDelta = (latest.momentum || 0) - (previous.momentum || 0)
  const signalDelta = (latest.signal_count || 0) - (previous.signal_count || 0)
  const stageChanged = latest.stage !== previous.stage
  const qualificationChanged = latest.qualified !== previous.qualified
  const confidenceDelta = (latest.stage_confidence || 0) - (previous.stage_confidence || 0)

  const hasChanges = momentumDelta !== 0 || signalDelta !== 0 || stageChanged || qualificationChanged

  if (!hasChanges) return null

  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-8">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">What changed since last snapshot</h3>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <DeltaBadge value={momentumDelta} label="Momentum" />
        {signalDelta !== 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-gray-500">Signals:</span>
            <span className={signalDelta > 0 ? 'text-emerald-600' : 'text-red-600'}>
              {signalDelta > 0 ? '+' : ''}{signalDelta}
            </span>
          </div>
        )}
        {confidenceDelta !== 0 && (
          <DeltaBadge value={confidenceDelta} label="Confidence" />
        )}
        {stageChanged && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-gray-500">Stage:</span>
            <span className="text-gray-400">{previous.stage}</span>
            <span className="text-gray-400">→</span>
            <span className="text-gray-900 font-medium">{latest.stage}</span>
          </div>
        )}
        {qualificationChanged && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-gray-500">Qualified:</span>
            <span className={latest.qualified ? 'text-emerald-600 font-medium' : 'text-red-600'}>
              {latest.qualified ? 'Yes (new)' : 'No longer'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Main Page ---

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

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <Link
            href="/explore"
            className="text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← Back to Explore
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            {trend.theme}
          </h1>

          {/* Lifecycle timeline (SHOULD-DO 5) */}
          {trend.current_stage && (
            <div className="mb-4">
              <LifecycleTimeline currentStage={trend.current_stage} />
            </div>
          )}

          {/* Intelligence badges */}
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <span className="text-gray-500">{trend.total_snapshots} snapshots tracked</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">First seen: {new Date(trend.first_seen).toLocaleDateString()}</span>

            {timingConfig && (
              <>
                <span className="text-gray-300">|</span>
                <span className="relative group">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${timingConfig.color} cursor-help`}>
                    Timing: {timingConfig.text}
                  </span>
                  <span className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none w-48 z-10">
                    {timingConfig.description} ({Math.round((trend.timing?.confidence || 0) * 100)}% confidence)
                  </span>
                </span>
              </>
            )}

            {compConfig && (
              <>
                <span className="text-gray-300">|</span>
                <span className="relative group">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${compConfig.color} cursor-help`}>
                    Competition: {compConfig.text}
                  </span>
                  {trend.competition && (
                    <span className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none w-48 z-10">
                      Saturation: {Math.round(trend.competition.saturation_score * 100)}%
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* What changed since yesterday (NICE-TO-HAVE 9) */}
        <WhatChanged trajectory={trend.trajectory} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Current Momentum</div>
            <div className="text-2xl font-bold text-gray-900">
              {latestPoint?.momentum?.toFixed(2) || '—'}
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Peak Momentum</div>
            <div className="text-2xl font-bold text-gray-900">
              {trend.peak_momentum?.toFixed(2) || '—'}
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Times Qualified</div>
            <div className="text-2xl font-bold text-gray-900">
              {trend.qualified_count}
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-1">Current Signals</div>
            <div className="text-2xl font-bold text-gray-900">
              {latestPoint?.signal_count || '—'}
            </div>
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Momentum Over Time</h2>
          <div className="border border-gray-200 rounded-lg p-6">
            <MomentumChart trajectory={trend.trajectory} />
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>
                {trend.trajectory[0]?.timestamp
                  ? new Date(trend.trajectory[0].timestamp).toLocaleDateString()
                  : '—'}
              </span>
              <span>
                {latestPoint?.timestamp
                  ? new Date(latestPoint.timestamp).toLocaleDateString()
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Lifecycle Stages</h2>
          <div className="border border-gray-200 rounded-lg p-6">
            <StageTimeline trajectory={trend.trajectory} />
            <div className="flex gap-4 mt-4 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-100"></span> Emerging
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-100"></span> Rising
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-yellow-100"></span> Peaking
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-100"></span> Stable
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-100"></span> Declining
              </span>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Snapshot History</h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-600 font-medium">Date</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-medium">Momentum</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-medium">Signals</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-medium">Stage</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-medium">Qualified</th>
                </tr>
              </thead>
              <tbody>
                {[...trend.trajectory].reverse().slice(0, 10).map((point, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-900">
                      {point.timestamp ? new Date(point.timestamp).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {point.momentum?.toFixed(3) || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {point.signal_count || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {point.stage && (
                        <span className={`px-2 py-1 rounded text-xs ${
                          point.stage === 'rising' ? 'bg-green-100 text-green-700' :
                          point.stage === 'emerging' ? 'bg-blue-100 text-blue-700' :
                          point.stage === 'peaking' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {point.stage}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {point.qualified ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Model versioning (NICE-TO-HAVE 11) */}
        <div className="mt-12 pt-6 border-t border-gray-100 text-xs text-gray-400">
          <details>
            <summary className="cursor-pointer hover:text-gray-600">System info</summary>
            <div className="mt-2 space-y-1">
              <p>Scoring: norm-p90-decay7d-v1</p>
              <p>Lifecycle: lifecycle-v1</p>
              {trend.timing && <p>Timing: timing-v1</p>}
              {trend.competition && <p>Competition: competition-v1</p>}
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
