import { supabase } from '@/lib/supabase'
import Link from 'next/link'

// Current supported versions - filter out old data from different eras
const SUPPORTED_LIFECYCLE_VERSION = 'lifecycle-v1'
const SUPPORTED_SCORING_VERSION = 'norm-p90-decay7d-v1'

// Minimum confidence threshold for "Top Trends" eligibility
const MIN_CONFIDENCE_THRESHOLD = 0.5

// Lifecycle stage styling
const lifecycleConfig: Record<string, { icon: string; bg: string; text: string; border: string; label: string }> = {
  emerging: { icon: '🌱', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Emerging' },
  rising: { icon: '🔥', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', label: 'Rising' },
  peaking: { icon: '📈', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'Peaking' },
  declining: { icon: '📉', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', label: 'Declining' },
  fading: { icon: '🌙', bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', label: 'Fading' },
  stable: { icon: '➡️', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', label: 'Stable' },
}

interface TrendWithLifecycle {
  id: string
  theme: string
  momentum_score: number
  signal_count: number
  signal_change: number | null
  lifecycle_stage: string
  acceleration_comparable: boolean
  acceleration_score: number | null
  stage_confidence: number
  days_seen: number | null
  explanation: string
  isHighConfidence: boolean
}

interface TrendingResult {
  eligible: TrendWithLifecycle[]
  watching: TrendWithLifecycle[]
}

async function getTrendingWithLifecycle(): Promise<TrendingResult> {
  // Get the most recent snapshot with correct scoring version
  const { data: latestSnapshot } = await supabase
    .from('trend_snapshots')
    .select('id, scoring_version')
    .eq('scoring_version', SUPPORTED_SCORING_VERSION)
    .order('run_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestSnapshot) {
    // Fallback to old method if no matching snapshots
    const { data: trends } = await supabase
      .from('detected_trends')
      .select('*')
      .order('last_updated', { ascending: false })
      .limit(3)

    const fallbackTrends = trends?.map(t => ({
      id: t.id,
      theme: t.theme,
      momentum_score: t.momentum_score || 0,
      signal_count: t.signal_count || 0,
      signal_change: null,
      lifecycle_stage: 'stable',
      acceleration_comparable: false,
      acceleration_score: null,
      stage_confidence: 0.5,
      days_seen: null,
      explanation: 'No explanation available yet.',
      isHighConfidence: false
    })) || []
    // All fallback trends go to "watching" since they have no lifecycle data
    return { eligible: [], watching: fallbackTrends.slice(0, 5) }
  }

  // Get lifecycle data for latest snapshot with version filtering
  // Fetch more so we can split by eligibility
  const { data: lifecycleData } = await supabase
    .from('trend_lifecycle_history')
    .select('*')
    .eq('snapshot_id', latestSnapshot.id)
    .eq('lifecycle_version', SUPPORTED_LIFECYCLE_VERSION)
    .order('current_momentum', { ascending: false })
    .limit(10)

  if (!lifecycleData || lifecycleData.length === 0) {
    // Fallback if no lifecycle data
    const { data: trends } = await supabase
      .from('detected_trends')
      .select('*')
      .order('last_updated', { ascending: false })
      .limit(5)

    const fallbackTrends = trends?.map(t => ({
      id: t.id,
      theme: t.theme,
      momentum_score: t.momentum_score || 0,
      signal_count: t.signal_count || 0,
      signal_change: null,
      lifecycle_stage: 'stable',
      acceleration_comparable: false,
      acceleration_score: null,
      stage_confidence: 0.5,
      days_seen: null,
      explanation: 'No explanation available yet.',
      isHighConfidence: false
    })) || []
    return { eligible: [], watching: fallbackTrends }
  }

  // Split into eligible (trustworthy) and watching (high momentum but not yet comparable)
  const eligibleItems = lifecycleData.filter(item =>
    item.acceleration_comparable === true &&
    (item.stage_confidence || 0) >= MIN_CONFIDENCE_THRESHOLD
  )

  const watchingItems = lifecycleData.filter(item =>
    !item.acceleration_comparable ||
    (item.stage_confidence || 0) < MIN_CONFIDENCE_THRESHOLD
  )

  // Only show up to 3 eligible, up to 5 watching
  const selectedEligible = eligibleItems.slice(0, 3)
  const selectedWatching = watchingItems.slice(0, 5)

  // Get all trend_ids for batch explanation query (fixes N+1)
  const allItems = [...selectedEligible, ...selectedWatching]
  const trendIds = allItems
    .map(item => item.trend_id)
    .filter((id): id is string => id !== null)

  // Single query for all explanations
  const { data: explanations } = await supabase
    .from('trend_explanations')
    .select('trend_id, explanation')
    .in('trend_id', trendIds)

  // Create lookup map
  const explanationMap = new Map(
    explanations?.map(e => [e.trend_id, e.explanation]) || []
  )

  // Helper to transform lifecycle item to TrendWithLifecycle
  const transformItem = (item: typeof lifecycleData[0]): TrendWithLifecycle => {
    const isHighConfidence = item.acceleration_comparable === true &&
      (item.stage_confidence || 0) >= MIN_CONFIDENCE_THRESHOLD

    return {
      id: item.trend_id,
      theme: item.trend_keyword,
      momentum_score: item.current_momentum,
      signal_count: item.current_signals,
      signal_change: item.signal_change,
      lifecycle_stage: item.lifecycle_stage,
      acceleration_comparable: item.acceleration_comparable,
      acceleration_score: item.acceleration_score,
      stage_confidence: item.stage_confidence,
      days_seen: item.days_seen,
      explanation: explanationMap.get(item.trend_id) || 'No explanation available yet.',
      isHighConfidence
    }
  }

  return {
    eligible: selectedEligible.map(transformItem),
    watching: selectedWatching.map(transformItem)
  }
}

// Reusable trend card component
function TrendCard({ trend, index, showRank = true }: { trend: TrendWithLifecycle; index: number; showRank?: boolean }) {
  const lifecycle = lifecycleConfig[trend.lifecycle_stage] || lifecycleConfig.stable
  const showLifecycleStage = trend.acceleration_comparable && trend.isHighConfidence

  return (
    <div className="border border-gray-200 rounded-xl p-8 hover:border-gray-300 transition group">
      <div className="flex items-start gap-6">
        {/* Rank Badge */}
        {showRank && (
          <div className="shrink-0 w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
            <span className="text-2xl font-bold text-gray-400">
              {index + 1}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="grow">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-bold text-gray-900 group-hover:text-gray-700 transition">
                {trend.theme}
              </h3>
              {/* Lifecycle Badge - only show stage when trustworthy */}
              {showLifecycleStage ? (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${lifecycle.bg} ${lifecycle.text} border ${lifecycle.border}`}
                  title={`${lifecycle.label} (${Math.round((trend.stage_confidence || 0) * 100)}% confidence)`}
                >
                  {lifecycle.icon} {lifecycle.label}
                </span>
              ) : (
                <span
                  className="px-3 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200"
                  title={trend.acceleration_comparable
                    ? `Low confidence (${Math.round((trend.stage_confidence || 0) * 100)}%)`
                    : 'Gathering more data for lifecycle tracking'
                  }
                >
                  ⏳ {trend.acceleration_comparable ? 'Low confidence' : 'Gathering data'}
                </span>
              )}
            </div>
            <div className="flex gap-4 text-sm">
              <div className="text-right">
                <div className="text-gray-500">Momentum</div>
                <div className="font-bold text-gray-900">
                  {trend.momentum_score?.toFixed(2) || '--'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-gray-500">Signals</div>
                <div className="font-bold text-gray-900">
                  {trend.signal_count}
                  {/* Only show signal change when comparable */}
                  {trend.signal_change !== null && trend.acceleration_comparable && (
                    <span className={`ml-1 text-xs ${
                      trend.signal_change > 0 ? 'text-green-600' :
                      trend.signal_change < 0 ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      ({trend.signal_change > 0 ? '+' : ''}{trend.signal_change})
                    </span>
                  )}
                </div>
              </div>
              {/* Only show acceleration when high confidence */}
              {trend.acceleration_score !== null && showLifecycleStage && (
                <div className="text-right">
                  <div className="text-gray-500">Accel</div>
                  <div className={`font-bold ${
                    trend.acceleration_score > 0.1 ? 'text-green-600' :
                    trend.acceleration_score < -0.1 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {trend.acceleration_score > 0 ? '↑' : trend.acceleration_score < 0 ? '↓' : '→'}
                    {Math.abs(trend.acceleration_score * 100).toFixed(0)}%
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-gray-700 leading-relaxed">
            {trend.explanation}
          </p>

          <div className="mt-4 flex gap-2 items-center">
            {showLifecycleStage ? (
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${lifecycle.bg} ${lifecycle.text} border ${lifecycle.border}`}>
                {lifecycle.icon} {lifecycle.label}
              </span>
            ) : (
              <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
                ⏳ {trend.acceleration_comparable ? 'Low confidence' : 'Gathering data'}
              </span>
            )}
            {trend.days_seen && trend.days_seen > 0 && (
              <span className="text-xs text-gray-400">
                Tracked for {trend.days_seen} day{trend.days_seen !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function HomePage() {
  const { eligible, watching } = await getTrendingWithLifecycle()

  const hasEligibleTrends = eligible.length > 0

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h1 className="text-6xl font-bold text-gray-900 mb-6">
            What's emerging<br />in tech right now?
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mb-8">
            Real-time trend intelligence powered by signals from Hacker News, Dev.to, and GitHub.
            Analyzed by AI to show you what actually matters.
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

      {/* Top Emerging Trends - Only show if we have eligible (trustworthy) trends */}
      {hasEligibleTrends && (
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Top Emerging Trends
          </h2>
          <p className="text-gray-600 mb-8">
            The most significant movements in the developer ecosystem
          </p>
          {eligible.length < 3 && (
            <p className="text-sm text-amber-600 mb-8">
              Only {eligible.length} trend{eligible.length !== 1 ? 's' : ''} met eligibility today (comparable + high confidence)
            </p>
          )}

          <div className="space-y-6">
            {eligible.map((trend, index) => (
              <TrendCard key={trend.id} trend={trend} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Watching Section - High momentum but insufficient history */}
      {watching.length > 0 && (
        <div className={`max-w-6xl mx-auto px-6 ${hasEligibleTrends ? 'pb-16' : 'py-16'}`}>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {hasEligibleTrends ? 'Watching' : 'Gathering Data'}
          </h2>
          <p className="text-gray-600 mb-8">
            {hasEligibleTrends
              ? 'High momentum trends with insufficient history for confident lifecycle analysis'
              : 'These trends need more data points before we can confidently analyze their lifecycle'
            }
          </p>
          {!hasEligibleTrends && (
            <p className="text-sm text-amber-600 mb-8">
              No trends met eligibility today (requires comparable history + high confidence)
            </p>
          )}

          <div className="space-y-4">
            {watching.map((trend, index) => (
              <TrendCard key={trend.id} trend={trend} index={index} showRank={false} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {eligible.length === 0 && watching.length === 0 && (
        <div className="max-w-6xl mx-auto px-6 py-16">
          <p className="text-gray-500 text-center py-12">
            No trends detected yet. Run the trend detector to see emerging trends!
          </p>
        </div>
      )}

      {/* Footer CTA */}
      <div className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-12 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Ready to explore more?
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
