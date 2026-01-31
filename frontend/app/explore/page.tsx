import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Badge } from '../components/Badge'

const SUPPORTED_SCORING_VERSION = 'norm-p90-decay7d-v1'
const SUPPORTED_LIFECYCLE_VERSION = 'lifecycle-v1'

const STAGE_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  emerging: { label: 'Emerging', variant: 'info' },
  rising: { label: 'Rising', variant: 'success' },
  peaking: { label: 'Peaking', variant: 'warning' },
  stable: { label: 'Stable', variant: 'muted' },
  declining: { label: 'Declining', variant: 'danger' },
  fading: { label: 'Fading', variant: 'muted' },
}

interface TrendItem {
  trend_id: string
  keyword: string
  stage: string
  stage_confidence: number
  momentum: number
  acceleration: number | null
  signal_count: number
  comparable: boolean
  qualified: boolean
  opportunity_score: number | null
}

async function getTrends(): Promise<{ trends: TrendItem[]; snapshotTime: string | null }> {
  const { data: latestSnapshot } = await supabase
    .from('trend_snapshots')
    .select('id, run_at, scoring_version')
    .eq('scoring_version', SUPPORTED_SCORING_VERSION)
    .order('run_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestSnapshot) return { trends: [], snapshotTime: null }

  // Fetch lifecycle data
  const { data: lifecycleData } = await supabase
    .from('trend_lifecycle_history')
    .select('trend_id, trend_keyword, lifecycle_stage, stage_confidence, current_momentum, acceleration_score, current_signals, acceleration_comparable')
    .eq('snapshot_id', latestSnapshot.id)
    .eq('lifecycle_version', SUPPORTED_LIFECYCLE_VERSION)
    .order('current_momentum', { ascending: false })

  // Fetch opportunity data for qualification status
  const { data: opportunityData } = await supabase
    .from('trend_opportunities')
    .select('trend_id, qualified, opportunity_score')
    .eq('snapshot_id', latestSnapshot.id)

  const oppMap = new Map(opportunityData?.map(o => [o.trend_id, { qualified: o.qualified, score: o.opportunity_score }]) || [])

  const trends: TrendItem[] = (lifecycleData || []).map(item => {
    const opp = oppMap.get(item.trend_id)
    return {
      trend_id: item.trend_id,
      keyword: item.trend_keyword,
      stage: item.lifecycle_stage,
      stage_confidence: item.stage_confidence || 0,
      momentum: item.current_momentum || 0,
      acceleration: item.acceleration_score,
      signal_count: item.current_signals || 0,
      comparable: item.acceleration_comparable,
      qualified: opp?.qualified || false,
      opportunity_score: opp?.score || null,
    }
  })

  return { trends, snapshotTime: latestSnapshot.run_at }
}

function AccelerationDisplay({ score, comparable }: { score: number | null; comparable: boolean }) {
  if (!comparable || score === null) {
    return <span className="text-slate-300 text-xs">--</span>
  }
  const color = score > 0.1 ? 'text-emerald-600' : score < -0.1 ? 'text-red-500' : 'text-slate-500'
  const arrow = score > 0.1 ? '\u2191' : score < -0.1 ? '\u2193' : '\u2192'
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {arrow} {(score * 100).toFixed(0)}%
    </span>
  )
}

export default async function ExplorePage() {
  const { trends, snapshotTime } = await getTrends()
  const qualifiedCount = trends.filter(t => t.qualified).length

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Explore Trends</h1>
          <p className="text-sm text-slate-500 mt-1">
            {trends.length} trends tracked{qualifiedCount > 0 && `, ${qualifiedCount} qualified as opportunities`}
          </p>
          {snapshotTime && (
            <p className="text-xs text-slate-400 mt-1">
              Last updated {new Date(snapshotTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>

        {trends.length === 0 ? (
          <div className="border border-slate-200 rounded-xl p-10 text-center">
            <p className="text-sm text-slate-600 mb-2">No trends detected yet.</p>
            <p className="text-xs text-slate-400">Trends appear after the daily pipeline runs.</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_80px_80px_80px] gap-4 px-5 py-3 bg-slate-50 text-xs font-medium text-slate-400 uppercase tracking-wider">
              <span>Trend</span>
              <span>Stage</span>
              <span className="text-right">Momentum</span>
              <span className="text-right">Accel.</span>
              <span className="text-right">Signals</span>
            </div>

            {trends.map((trend) => {
              const stageConfig = STAGE_CONFIG[trend.stage] || STAGE_CONFIG.stable

              return (
                <Link
                  key={trend.trend_id}
                  href={`/trends/${trend.trend_id}`}
                  className="grid grid-cols-[1fr_100px_80px_80px_80px] gap-4 px-5 py-4 hover:bg-slate-50 transition items-center group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-800 group-hover:text-emerald-600 transition truncate capitalize">
                        {trend.keyword}
                      </span>
                      {trend.qualified && (
                        <Badge variant="success">Qualified</Badge>
                      )}
                    </div>
                    {trend.qualified && trend.opportunity_score != null && (
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        Score: {trend.opportunity_score.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div>
                    {trend.comparable && trend.stage_confidence >= 0.5 ? (
                      <Badge variant={stageConfig.variant}>{stageConfig.label}</Badge>
                    ) : (
                      <span className="text-xs text-slate-400">Gathering data</span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-semibold text-slate-700 tabular-nums">
                      {trend.momentum.toFixed(2)}
                    </span>
                  </div>

                  <div className="text-right">
                    <AccelerationDisplay score={trend.acceleration} comparable={trend.comparable} />
                  </div>

                  <div className="text-right">
                    <span className="text-sm text-slate-600 tabular-nums">{trend.signal_count}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
