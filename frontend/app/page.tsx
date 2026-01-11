import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Trend {
  id: number
  theme: string
  momentum_score: number
  signal_count: number
  first_seen: string
  status: string
}

interface Explanation {
  explanation: string
}

async function getTrendingWithExplanations() {
  const { data: trends } = await supabase
    .from('detected_trends')
    .select('*')
    .order('momentum_score', { ascending: false })
    .limit(3)

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

export default async function HomePage() {
  const trends = await getTrendingWithExplanations()

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
              href="/trends/explained"
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

      {/* Top Trends */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Top Emerging Trends
        </h2>
        <p className="text-gray-600 mb-12">
          The most significant movements in the developer ecosystem this week
        </p>

        <div className="space-y-6">
          {trends.map((trend, index) => (
            <div 
              key={trend.id}
              className="border border-gray-200 rounded-xl p-8 hover:border-gray-300 transition group"
            >
              <div className="flex items-start gap-6">
                {/* Rank Badge */}
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-gray-400">
                    {index + 1}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-grow">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-2xl font-bold text-gray-900 group-hover:text-gray-700 transition">
                      {trend.theme}
                    </h3>
                    <div className="flex gap-4 text-sm">
                      <div className="text-right">
                        <div className="text-gray-500">Momentum</div>
                        <div className="font-bold text-gray-900">
                          {trend.momentum_score.toFixed(0)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-500">Signals</div>
                        <div className="font-bold text-gray-900">
                          {trend.signal_count}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-gray-700 leading-relaxed">
                    {trend.explanation}
                  </p>

                  <div className="mt-4 inline-block px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                    {trend.status}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-12 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Ready to explore more?
          </h3>
          <Link 
            href="/trends/explained"
            className="inline-block px-8 py-4 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition"
          >
            View All Trends →
          </Link>
        </div>
      </div>
    </div>
  )
}
