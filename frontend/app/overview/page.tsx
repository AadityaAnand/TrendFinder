import { getServerSupabase, getLatestSnapshot } from '@/lib/supabase-server'
import Link from 'next/link'

async function getDashboardData() {
  const db = getServerSupabase()
  const snapshot = await getLatestSnapshot(db)

  if (!snapshot) {
    return { snapshot: null, trendCount: 0, qualifiedCount: 0, watchingCount: 0, topTrends: [] }
  }

  const [itemsRes, oppsRes] = await Promise.all([
    db
      .from('trend_snapshot_items')
      .select('trend_id, momentum_score, signal_count, trend_keyword')
      .eq('snapshot_id', snapshot.id),
    db
      .from('trend_opportunities')
      .select('trend_id, qualified')
      .eq('snapshot_id', snapshot.id),
  ])

  const items = itemsRes.data || []
  const opps = oppsRes.data || []
  const qualifiedIds = new Set(opps.filter(o => o.qualified).map(o => o.trend_id))
  const watchingCount = opps.filter(o => !o.qualified).length

  const trendIds = items.map(i => i.trend_id)
  let trendNames: { id: string; theme: string }[] = []
  if (trendIds.length > 0) {
    const { data } = await db
      .from('detected_trends')
      .select('id, theme')
      .in('id', trendIds)
    trendNames = data || []
  }
  const nameMap = new Map(trendNames.map(t => [t.id, t.theme]))

  const topTrends = items
    .sort((a, b) => (b.momentum_score || 0) - (a.momentum_score || 0))
    .slice(0, 5)
    .map(item => ({
      id: item.trend_id,
      name: nameMap.get(item.trend_id) || item.trend_keyword || 'Emerging trend',
      momentum: item.momentum_score || 0,
      signals: item.signal_count || 0,
      qualified: qualifiedIds.has(item.trend_id),
    }))

  return {
    snapshot: { id: snapshot.id, run_at: snapshot.run_at },
    trendCount: items.length,
    qualifiedCount: qualifiedIds.size,
    watchingCount,
    topTrends,
  }
}

export default async function OverviewPage() {
  const { snapshot, trendCount, qualifiedCount, watchingCount, topTrends } = await getDashboardData()

  const freshness = snapshot
    ? getRelativeTime(snapshot.run_at)
    : null

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Welcome to <span className="rishi-gradient-text">Rishi</span>
          </h1>
          <p className="text-base text-slate-500 mt-2 max-w-2xl leading-relaxed">
            Your evidence-based foresight engine. Rishi watches developer signals across
            Hacker News, GitHub, Dev.to, and Reddit &mdash; then surfaces what&apos;s actionable.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-slate-900">{trendCount}</div>
            <div className="text-xs text-slate-500 mt-0.5">Trends tracked</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-indigo-600">{qualifiedCount}</div>
            <div className="text-xs text-slate-500 mt-0.5">Qualified opportunities</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-slate-900">{watchingCount}</div>
            <div className="text-xs text-slate-500 mt-0.5">Watching</div>
          </div>
        </div>

        {freshness && (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-slate-600">Pipeline last ran {freshness}</span>
            </div>
            <span className="text-xs text-slate-400">
              {new Date(snapshot!.run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        )}

        {!snapshot && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center mb-8">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-amber-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">Pipeline hasn&apos;t run yet</p>
            <p className="text-xs text-slate-500">
              Rishi collects signals daily at 6:00 AM UTC. Check back after the first run to see trends.
            </p>
          </div>
        )}

        <div className="mb-10">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Get started</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link href="/settings" className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-slate-900">Set preferences</span>
              </div>
              <p className="text-xs text-slate-500">Tell Rishi your role, domains, and tech stack to personalize results.</p>
            </Link>
            <Link href="/for-you" className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-slate-900">See For You</span>
              </div>
              <p className="text-xs text-slate-500">View personalized opportunities matched to your profile and interests.</p>
            </Link>
            <Link href="/explore" className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-slate-900">Explore trends</span>
              </div>
              <p className="text-xs text-slate-500">Browse the full landscape of detected trends across the developer ecosystem.</p>
            </Link>
          </div>
        </div>

        {topTrends.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Top trends right now</h2>
            <div className="space-y-2">
              {topTrends.map((trend) => (
                <Link
                  key={trend.id}
                  href={`/trends/${trend.id}`}
                  className="bg-white border border-slate-200 rounded-xl flex items-center justify-between px-4 py-3 hover:border-slate-300 hover:shadow-sm transition group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                      {trend.name}
                    </span>
                    {trend.qualified && (
                      <span className="shrink-0 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                        Qualified
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs text-slate-400">
                    <span>{trend.signals} signals</span>
                    <span className="tabular-nums">{(trend.momentum * 100).toFixed(0)}% momentum</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600">Want to understand how Rishi works?</p>
            <p className="text-xs text-slate-500 mt-0.5">Learn about signals, evidence gates, and how opportunities are qualified.</p>
          </div>
          <Link href="/method" className="rishi-btn-secondary text-xs! px-3! py-1.5!">
            Read the method
          </Link>
        </div>
      </div>
    </div>
  )
}

function getRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
