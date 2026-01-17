import { supabase } from '@/lib/supabase'
import Link from 'next/link'

// Current supported versions - filter out old data from different eras
const SUPPORTED_LIFECYCLE_VERSION = 'lifecycle-v1'
const SUPPORTED_SCORING_VERSION = 'norm-p90-decay7d-v1'

// Minimum confidence threshold for showing lifecycle stage
const MIN_CONFIDENCE_THRESHOLD = 0.5

// Lifecycle stage styling and icons
const lifecycleConfig: Record<string, { icon: string; bg: string; text: string; label: string }> = {
  emerging: { icon: '🌱', bg: 'bg-blue-100', text: 'text-blue-800', label: 'Emerging' },
  rising: { icon: '🔥', bg: 'bg-orange-100', text: 'text-orange-800', label: 'Rising' },
  peaking: { icon: '📈', bg: 'bg-green-100', text: 'text-green-800', label: 'Peaking' },
  declining: { icon: '📉', bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Declining' },
  fading: { icon: '🌙', bg: 'bg-gray-100', text: 'text-gray-800', label: 'Fading' },
  stable: { icon: '➡️', bg: 'bg-slate-100', text: 'text-slate-800', label: 'Stable' },
}

function LifecycleBadge({
  stage,
  confidence,
  comparable
}: {
  stage: string;
  confidence: number;
  comparable: boolean
}) {
  const config = lifecycleConfig[stage] || lifecycleConfig.stable
  const isHighConfidence = confidence >= MIN_CONFIDENCE_THRESHOLD

  // Don't show lifecycle stage if not comparable OR low confidence
  if (!comparable) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded" title="Insufficient data for lifecycle">
        ⏳ Gathering data
      </span>
    )
  }

  if (!isHighConfidence) {
    return (
      <span
        className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded"
        title={`Low confidence (${Math.round(confidence * 100)}%)`}
      >
        ⏳ Low confidence
      </span>
    )
  }

  return (
    <span
      className={`px-2 py-1 text-xs font-medium ${config.bg} ${config.text} rounded`}
      title={`${config.label} (${Math.round(confidence * 100)}% confidence)`}
    >
      {config.icon} {config.label}
    </span>
  )
}

function AccelerationIndicator({
  score,
  comparable,
  confidence
}: {
  score: number | null;
  comparable: boolean;
  confidence: number
}) {
  const isHighConfidence = confidence >= MIN_CONFIDENCE_THRESHOLD

  // Only show acceleration when comparable AND high confidence
  if (!comparable || !isHighConfidence || score === null) {
    return <span className="text-gray-400">--</span>
  }

  const color = score > 0.1 ? 'text-green-600' : score < -0.1 ? 'text-red-600' : 'text-gray-600'
  const arrow = score > 0.1 ? '↑' : score < -0.1 ? '↓' : '→'

  return (
    <span className={`font-semibold ${color}`}>
      {arrow} {(score * 100).toFixed(0)}%
    </span>
  )
}

export default async function DetectedTrendsPage() {
  // Get the most recent snapshot with correct scoring version
  const { data: latestSnapshot } = await supabase
    .from('trend_snapshots')
    .select('id, scoring_version')
    .eq('scoring_version', SUPPORTED_SCORING_VERSION)
    .order('run_at', { ascending: false })
    .limit(1)
    .single()

  // Fetch lifecycle history with version filtering
  const { data: lifecycleData, error: lifecycleError } = await supabase
    .from('trend_lifecycle_history')
    .select('*')
    .eq('snapshot_id', latestSnapshot?.id)
    .eq('lifecycle_version', SUPPORTED_LIFECYCLE_VERSION)
    .order('current_momentum', { ascending: false })

  // Fallback to detected_trends if no lifecycle data
  const { data: trends, error: trendsError } = await supabase
    .from('detected_trends')
    .select('*')
    .order('last_updated', { ascending: false })

  const error = lifecycleError || trendsError

  if (error) {
    return <div className="container mx-auto p-8">Error loading trends: {error.message}</div>
  }

  // Use lifecycle data if available, otherwise fall back to basic trends
  const hasLifecycleData = lifecycleData && lifecycleData.length > 0

  // Count high confidence trends
  const highConfidenceCount = hasLifecycleData
    ? lifecycleData.filter(item =>
        item.acceleration_comparable &&
        (item.stage_confidence || 0) >= MIN_CONFIDENCE_THRESHOLD
      ).length
    : 0

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">Detected Trends</h1>
      <p className="text-gray-600 mb-2">
        {hasLifecycleData
          ? `${lifecycleData.length} trends tracked (${highConfidenceCount} high confidence)`
          : `${trends?.length || 0} detected trends`
        }
      </p>
      {hasLifecycleData && (
        <p className="text-xs text-gray-400 mb-8">
          Snapshot {latestSnapshot?.id?.slice(0, 8)}... • Version: {SUPPORTED_LIFECYCLE_VERSION}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {hasLifecycleData ? (
          // Render with lifecycle data
          lifecycleData.map((item) => {
            const isHighConfidence = item.acceleration_comparable &&
              (item.stage_confidence || 0) >= MIN_CONFIDENCE_THRESHOLD

            return (
              <Link
                key={item.id}
                href={`/trends/${item.trend_id}`}
                className="border rounded-lg p-6 hover:shadow-lg transition-shadow bg-white block"
              >
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-xl font-semibold capitalize">
                    {item.trend_keyword}
                  </h2>
                  <LifecycleBadge
                    stage={item.lifecycle_stage}
                    confidence={item.stage_confidence || 0}
                    comparable={item.acceleration_comparable}
                  />
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Momentum:</span>
                    <span className="font-semibold text-gray-900">
                      {item.current_momentum?.toFixed(2) || '--'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Acceleration:</span>
                    <AccelerationIndicator
                      score={item.acceleration_score}
                      comparable={item.acceleration_comparable}
                      confidence={item.stage_confidence || 0}
                    />
                  </div>

                  <div className="flex justify-between">
                    <span>Signals:</span>
                    <span className="font-semibold text-gray-900">
                      {item.current_signals}
                      {/* Only show signal change when comparable AND high confidence */}
                      {item.signal_change !== null && isHighConfidence && (
                        <span className={item.signal_change > 0 ? 'text-green-600 ml-1' : item.signal_change < 0 ? 'text-red-600 ml-1' : 'text-gray-400 ml-1'}>
                          ({item.signal_change > 0 ? '+' : ''}{item.signal_change})
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Days Tracked:</span>
                    <span className="text-xs text-gray-500">
                      {item.days_seen || 1} day{(item.days_seen || 1) !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Confidence:</span>
                    <span className={`text-xs ${isHighConfidence ? 'text-green-600' : 'text-gray-500'}`}>
                      {Math.round((item.stage_confidence || 0) * 100)}%
                      {!isHighConfidence && ' (low)'}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })
        ) : (
          // Fallback to basic trend rendering
          trends?.map((trend) => (
            <div
              key={trend.id}
              className="border rounded-lg p-6 hover:shadow-lg transition-shadow bg-white"
            >
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-semibold capitalize">
                  {trend.theme}
                </h2>
                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                  ⏳ No lifecycle data
                </span>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Momentum Score:</span>
                  <span className="font-semibold text-gray-900">
                    {trend.momentum_score?.toFixed(2) || '--'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Signal Count:</span>
                  <span className="font-semibold text-gray-900">
                    {trend.signal_count}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>First Seen:</span>
                  <span className="text-xs">
                    {new Date(trend.first_seen).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {(hasLifecycleData ? lifecycleData.length === 0 : trends?.length === 0) && (
        <p className="text-gray-500 text-center mt-8">
          No trends detected yet. Run the trend detector script!
        </p>
      )}
    </div>
  )
}
