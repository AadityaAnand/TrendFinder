import { supabase } from '@/lib/supabase'
import Link from 'next/link'

async function getTrendsWithExplanations() {
  const { data: trends } = await supabase
    .from('detected_trends')
    .select('*')
    .order('momentum_score', { ascending: false })

  if (!trends) return []

  const trendsWithExplanations = await Promise.all(
    trends.map(async (trend) => {
      const { data: explanation } = await supabase
        .from('trend_explanations')
        .select('explanation')
        .eq('trend_id', trend.id)
        .single()

      return {
        ...trend,
        explanation: explanation?.explanation || 'No explanation available yet.'
      }
    })
  )

  return trendsWithExplanations
}

export default async function ExplainedTrendsPage() {
  const trends = await getTrendsWithExplanations()

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <Link 
            href="/"
            className="text-gray-600 hover:text-gray-900 mb-4 inline-block"
          >
            ← Back to Home
          </Link>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            All Emerging Trends
          </h1>
          <p className="text-xl text-gray-600">
            {trends.length} trends detected across Hacker News, Dev.to, and GitHub
          </p>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {trends.map((trend) => (
            <div
              key={trend.id}
              className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-xl font-bold text-gray-900 group-hover:text-gray-700">
                  {trend.theme}
                </h3>
                <span className="px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  {trend.status}
                </span>
              </div>
              <div className="flex gap-6 mb-4 text-sm">
                <div>
                  <span className="text-gray-500">Momentum:</span>
                  <span className="ml-2 font-bold text-gray-900">
                    {trend.momentum_score.toFixed(0)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Signals:</span>
                  <span className="ml-2 font-bold text-gray-900">
                    {trend.signal_count}
                  </span>
                </div>
              </div>
              <p className="text-gray-700 leading-relaxed text-sm">
                {trend.explanation}
              </p>
              <div className="mt-4 text-xs text-gray-400">
                First detected: {new Date(trend.first_seen).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
