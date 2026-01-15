import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const SUPPORTED_SCORING_VERSION = 'norm-p90-decay7d-v1'

interface Opportunity {
  id: string
  trend_id: string
  theme: string
  opportunity_score: number
  demand_hits: number
  demand_examples: { title: string; url: string; source: string }[]
  suggested_actions: string[]
  signal_quality_score: number
  independent_artifact_count: number
  stage: string
  stage_confidence: number
  signals: { title: string; url: string; source: string; score: number }[]
}

interface TrendWatching {
  id: string
  theme: string
  momentum_score: number
  signal_count: number
  rejection_reasons: string[]
}

interface PageData {
  opportunities: Opportunity[]
  watching: TrendWatching[]
}

async function getOpportunities(): Promise<PageData> {
  const { data: latestSnapshot } = await supabase
    .from('trend_snapshots')
    .select('id')
    .eq('scoring_version', SUPPORTED_SCORING_VERSION)
    .order('run_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestSnapshot) {
    return { opportunities: [], watching: [] }
  }

  const { data: opportunityData } = await supabase
    .from('trend_opportunities')
    .select('*')
    .eq('snapshot_id', latestSnapshot.id)
    .order('opportunity_score', { ascending: false })

  if (!opportunityData || opportunityData.length === 0) {
    return { opportunities: [], watching: [] }
  }

  const qualified = opportunityData.filter(o => o.qualified === true)
  const notQualified = opportunityData.filter(o => o.qualified === false)

  const trendIds = opportunityData.map(o => o.trend_id)

  const { data: trends } = await supabase
    .from('detected_trends')
    .select('id, theme')
    .in('id', trendIds)

  const themeMap = new Map(trends?.map(t => [t.id, t.theme]) || [])

  const { data: lifecycleData } = await supabase
    .from('trend_lifecycle_history')
    .select('trend_id, lifecycle_stage, stage_confidence')
    .eq('snapshot_id', latestSnapshot.id)
    .in('trend_id', trendIds)

  const lifecycleMap = new Map(
    lifecycleData?.map(l => [l.trend_id, { stage: l.lifecycle_stage, confidence: l.stage_confidence }]) || []
  )

  const { data: trendSignals } = await supabase
    .from('trend_signals')
    .select('trend_id, signal_id')
    .eq('snapshot_id', latestSnapshot.id)
    .in('trend_id', qualified.map(o => o.trend_id))

  const signalIdsByTrend = new Map<string, string[]>()
  for (const ts of trendSignals || []) {
    const existing = signalIdsByTrend.get(ts.trend_id) || []
    existing.push(ts.signal_id)
    signalIdsByTrend.set(ts.trend_id, existing)
  }

  const allSignalIds = [...new Set((trendSignals || []).map(ts => ts.signal_id))]

  const { data: signals } = await supabase
    .from('raw_signals')
    .select('id, title, url, source, score')
    .in('id', allSignalIds)
    .order('score', { ascending: false })

  const signalMap = new Map(signals?.map(s => [s.id, s]) || [])

  const opportunities: Opportunity[] = qualified.slice(0, 3).map(o => {
    const lifecycle = lifecycleMap.get(o.trend_id)
    const trendSignalIds = signalIdsByTrend.get(o.trend_id) || []
    const trendSignalsData = trendSignalIds
      .map(id => signalMap.get(id))
      .filter(Boolean)
      .slice(0, 5) as { id: string; title: string; url: string; source: string; score: number }[]

    return {
      id: o.id,
      trend_id: o.trend_id,
      theme: themeMap.get(o.trend_id) || 'Unknown',
      opportunity_score: o.opportunity_score,
      demand_hits: o.demand_hits,
      demand_examples: o.demand_examples || [],
      suggested_actions: o.suggested_actions || [],
      signal_quality_score: o.signal_quality_score,
      independent_artifact_count: o.independent_artifact_count,
      stage: lifecycle?.stage || 'unknown',
      stage_confidence: lifecycle?.confidence || 0,
      signals: trendSignalsData.map(s => ({
        title: s.title,
        url: s.url,
        source: s.source,
        score: s.score
      }))
    }
  })

  const { data: snapshotItems } = await supabase
    .from('trend_snapshot_items')
    .select('trend_id, momentum_score, signal_count')
    .eq('snapshot_id', latestSnapshot.id)
    .in('trend_id', notQualified.map(o => o.trend_id))

  const snapshotMap = new Map(
    snapshotItems?.map(s => [s.trend_id, { momentum: s.momentum_score, signals: s.signal_count }]) || []
  )

  const watching: TrendWatching[] = notQualified.slice(0, 5).map(o => {
    const snapshot = snapshotMap.get(o.trend_id)
    return {
      id: o.trend_id,
      theme: themeMap.get(o.trend_id) || 'Unknown',
      momentum_score: snapshot?.momentum || 0,
      signal_count: snapshot?.signals || 0,
      rejection_reasons: o.rejection_reasons || []
    }
  })

  return { opportunities, watching }
}

function OpportunityCard({ opportunity, index }: { opportunity: Opportunity; index: number }) {
  const confidencePercent = Math.round(opportunity.stage_confidence * 100)

  return (
    <div className="border border-gray-200 rounded-xl p-8 hover:border-gray-300 transition">
      <div className="flex items-start gap-6">
        <div className="shrink-0 w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
          <span className="text-2xl font-bold text-emerald-600">
            {index + 1}
          </span>
        </div>

        <div className="grow">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">
                {opportunity.theme}
              </h3>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span>Score: {opportunity.opportunity_score.toFixed(2)}</span>
                <span>•</span>
                <span>{opportunity.independent_artifact_count} sources</span>
                <span>•</span>
                <span>{confidencePercent}% confidence</span>
              </div>
            </div>
          </div>

          {opportunity.suggested_actions.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">What to build</h4>
              <ul className="space-y-1">
                {opportunity.suggested_actions.map((action, i) => (
                  <li key={i} className="text-gray-700 flex items-start gap-2">
                    <span className="text-emerald-500 mt-1">→</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {opportunity.signals.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Evidence</h4>
              <ul className="space-y-1 text-sm">
                {opportunity.signals.map((signal, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-gray-400">[{i + 1}]</span>
                    <a
                      href={signal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate max-w-lg"
                    >
                      {signal.title}
                    </a>
                    <span className="text-gray-400 text-xs">({signal.source})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-sm text-gray-500 border-t border-gray-100 pt-4 mt-4">
            <span className="font-medium">What could be wrong:</span>{' '}
            Demand signals based on title heuristics only. Action suggestions are automated.
            Verify with deeper research before building.
          </div>
        </div>
      </div>
    </div>
  )
}

function WatchingCard({ trend }: { trend: TrendWatching }) {
  const reasonLabels: Record<string, string> = {
    'insufficient_independent_evidence': 'Needs more sources',
    'no_demand_signal': 'No demand detected',
    'no_clear_action': 'No clear action',
    'low_confidence': 'Low confidence',
    'acceleration_not_comparable': 'Gathering data',
    'no_lifecycle_data': 'No lifecycle data',
    'proto_cluster': 'Too few signals'
  }

  return (
    <div className="border border-gray-100 rounded-lg p-4 hover:border-gray-200 transition">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-gray-900">{trend.theme}</h4>
          <div className="text-sm text-gray-500">
            Momentum: {trend.momentum_score.toFixed(2)} • {trend.signal_count} signals
          </div>
        </div>
        <div className="flex gap-2">
          {trend.rejection_reasons.slice(0, 2).map((reason, i) => (
            <span
              key={i}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
            >
              {reasonLabels[reason] || reason}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function HomePage() {
  const { opportunities, watching } = await getOpportunities()

  const hasOpportunities = opportunities.length > 0

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h1 className="text-6xl font-bold text-gray-900 mb-6">
            What should you<br />build this week?
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mb-8">
            Opportunity intelligence from Hacker News, Dev.to, and GitHub.
            Only showing opportunities with real demand signals and clear actions.
          </p>
          <div className="flex gap-4">
            <Link
              href="/trends/detected"
              className="px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition"
            >
              View All Trends
            </Link>
            <Link
              href="/trends"
              className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
            >
              Raw Signals
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Top Opportunities
        </h2>
        <p className="text-gray-600 mb-8">
          Trends with verified demand signals and actionable build ideas
        </p>

        {hasOpportunities ? (
          <>
            {opportunities.length < 3 && (
              <p className="text-sm text-amber-600 mb-8">
                Only {opportunities.length} opportunit{opportunities.length !== 1 ? 'ies' : 'y'} met our criteria today
              </p>
            )}
            <div className="space-y-6">
              {opportunities.map((opp, index) => (
                <OpportunityCard key={opp.id} opportunity={opp} index={index} />
              ))}
            </div>
          </>
        ) : (
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-6 text-center">
            <p className="text-amber-800">
              No opportunities met our criteria today.
            </p>
            <p className="text-amber-600 text-sm mt-2">
              Opportunities require: 2+ independent sources, demand signals, and clear actions.
            </p>
          </div>
        )}
      </div>

      {watching.length > 0 && (
        <div className="max-w-6xl mx-auto px-6 pb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Watching
          </h2>
          <p className="text-gray-600 mb-6">
            Trends that didn't qualify as opportunities yet
          </p>
          <div className="space-y-3">
            {watching.map(trend => (
              <WatchingCard key={trend.id} trend={trend} />
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-12 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Want to see all trends?
          </h3>
          <Link
            href="/trends/detected"
            className="inline-block px-8 py-4 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition"
          >
            View All Trends →
          </Link>
        </div>
      </div>
    </div>
  )
}
