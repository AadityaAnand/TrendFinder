import { supabase } from '@/lib/supabase'

export default async function DetectedTrendsPage() {
  // Fetch detected trends from database
  const { data: trends, error } = await supabase
    .from('detected_trends')
    .select('*')
    .order('momentum_score', { ascending: false })

  if (error) {
    return <div>Error loading trends: {error.message}</div>
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">Detected Trends</h1>
      <p className="text-gray-600 mb-8">
        High-quality trends detected from {trends?.length || 0} emerging themes
      </p>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {trends?.map((trend) => (
          <div
            key={trend.id}
            className="border rounded-lg p-6 hover:shadow-lg transition-shadow bg-white"
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-semibold capitalize">
                {trend.theme}
              </h2>
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                {trend.status}
              </span>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Momentum Score:</span>
                <span className="font-semibold text-gray-900">
                  {trend.momentum_score.toFixed(2)}
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
        ))}
      </div>

      {trends?.length === 0 && (
        <p className="text-gray-500 text-center mt-8">
          No trends detected yet. Run the trend detector script!
        </p>
      )}
    </div>
  )
}