import { getServerSupabase, getLatestSnapshot, getHypothesisDisplayTitle } from '@/lib/supabase-server'
import Link from 'next/link'
import { LiveSignalCounter } from '@/app/components/LiveSignalCounter'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'valid', label: 'Valid' },
  { key: 'uncertain', label: 'Uncertain' },
  { key: 'topic_only', label: 'Topic only' },
]


interface HypothesisItem {
  trend_id: string
  display_title: string
  hypothesis_summary: string | null
  hypothesis_status: string
  confidence: number
  stage: string | null
  stage_confidence: number
  comparable: boolean
  momentum_score: number
  signal_count: number
  qualified: boolean
  source_count: number
}

async function getHypotheses(): Promise<{ items: HypothesisItem[]; snapshotTime: string | null; todaySignals: number }> {
  const db = getServerSupabase()
  const snapshot = await getLatestSnapshot(db)

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { count: todaySignals } = await db
    .from('raw_signals')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString())

  if (!snapshot) return { items: [], snapshotTime: null, todaySignals: todaySignals ?? 0 }

  const { data: snapshotItems } = await db
    .from('trend_snapshot_items')
    .select('trend_id, momentum_score, signal_count, trend_keyword')
    .eq('snapshot_id', snapshot.id)

  if (!snapshotItems || snapshotItems.length === 0) {
    return { items: [], snapshotTime: snapshot.run_at, todaySignals: todaySignals ?? 0 }
  }

  const trendIds = snapshotItems.map(s => s.trend_id)

  const [trendsRes, lifecycleRes, oppRes, hypothesesRes, evidenceRes] = await Promise.all([
    db.from('detected_trends').select('id, theme').in('id', trendIds),
    db.from('trend_lifecycle_history').select('trend_id, lifecycle_stage, stage_confidence, acceleration_comparable').eq('snapshot_id', snapshot.id).in('trend_id', trendIds),
    db.from('trend_opportunities').select('trend_id, qualified').eq('snapshot_id', snapshot.id).in('trend_id', trendIds),
    db.from('problem_hypotheses').select('trend_id, hypothesis_title, hypothesis_summary, hypothesis_status, confidence').eq('snapshot_id', snapshot.id).in('trend_id', trendIds),
    db.from('trend_signals').select('trend_id, raw_signals!inner(source)').eq('snapshot_id', snapshot.id).in('trend_id', trendIds),
  ])

  const trendMap = new Map((trendsRes.data || []).map(t => [t.id, t]))
  const lifecycleMap = new Map((lifecycleRes.data || []).map(l => [l.trend_id, l]))
  const oppMap = new Map((oppRes.data || []).map(o => [o.trend_id, o]))
  const hypothesisMap = new Map((hypothesesRes.data || []).map(h => [h.trend_id, h]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidenceRows = (evidenceRes.data || []) as any[]
  const sourceCountMap = new Map<string, Set<string>>()
  for (const row of evidenceRows) {
    const source = row.raw_signals?.source
    if (!source) continue
    if (!sourceCountMap.has(row.trend_id)) sourceCountMap.set(row.trend_id, new Set())
    sourceCountMap.get(row.trend_id)!.add(source)
  }

  const keywordMap = new Map(snapshotItems.map(s => [s.trend_id, s.trend_keyword]))

  const items: HypothesisItem[] = snapshotItems.map(item => {
    const trend = trendMap.get(item.trend_id)
    const lifecycle = lifecycleMap.get(item.trend_id)
    const opp = oppMap.get(item.trend_id)
    const hypothesis = hypothesisMap.get(item.trend_id)

    const displayTitle = getHypothesisDisplayTitle(
      hypothesis?.hypothesis_title,
      trend?.theme,
      keywordMap.get(item.trend_id),
      item.trend_id
    )

    return {
      trend_id: item.trend_id,
      display_title: displayTitle,
      hypothesis_summary: hypothesis?.hypothesis_summary || null,
      hypothesis_status: hypothesis?.hypothesis_status || 'uncertain',
      confidence: hypothesis?.confidence || 0,
      stage: lifecycle?.lifecycle_stage || null,
      stage_confidence: lifecycle?.stage_confidence || 0,
      comparable: lifecycle?.acceleration_comparable || false,
      momentum_score: item.momentum_score || 0,
      signal_count: item.signal_count || 0,
      qualified: opp?.qualified || false,
      source_count: sourceCountMap.get(item.trend_id)?.size || 0,
    }
  })

  items.sort((a, b) => b.momentum_score - a.momentum_score)

  return { items, snapshotTime: snapshot.run_at, todaySignals: todaySignals ?? 0 }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const params = await searchParams
  const selectedStatus = params.status || 'all'
  const query = params.q?.trim().toLowerCase() || ''
  const { items: allItems, snapshotTime, todaySignals } = await getHypotheses()

  let filtered = selectedStatus === 'all'
    ? allItems
    : allItems.filter(i => i.hypothesis_status === selectedStatus)

  if (query) {
    filtered = filtered.filter(i => i.display_title.toLowerCase().includes(query))
  }

  function buildUrl(p: { status?: string; q?: string }) {
    const parts: string[] = []
    const s = p.status ?? selectedStatus
    const qr = p.q ?? query
    if (s && s !== 'all') parts.push(`status=${s}`)
    if (qr) parts.push(`q=${encodeURIComponent(qr)}`)
    return parts.length > 0 ? `/explore?${parts.join('&')}` : '/explore'
  }

  const validCount = allItems.filter(i => i.hypothesis_status === 'valid').length
  const uncertainCount = allItems.filter(i => i.hypothesis_status === 'uncertain').length
  const topicCount = allItems.filter(i => i.hypothesis_status === 'topic_only').length

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Trend Library</h1>
          <p className="text-sm text-slate-500 mt-1">
            All detected trends, updated daily &middot; {allItems.length} trend{allItems.length !== 1 ? 's' : ''}
          </p>
          {snapshotTime && (
            <p className="text-xs text-slate-400 mt-0.5">
              Last updated {new Date(snapshotTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
          <div className="mt-1">
            <LiveSignalCounter initial={todaySignals} />
          </div>
        </header>

        <form action="/explore" method="GET" className="mb-5">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search trends..."
            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {selectedStatus !== 'all' && <input type="hidden" name="status" value={selectedStatus} />}
        </form>

        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
          {STATUS_FILTERS.map(f => {
            const isActive = f.key === selectedStatus
            const count = f.key === 'all' ? allItems.length
              : f.key === 'valid' ? validCount
              : f.key === 'uncertain' ? uncertainCount
              : topicCount
            return (
              <Link
                key={f.key}
                href={buildUrl({ status: f.key })}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {f.label}
                <span className={`ml-1 text-[10px] ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>{count}</span>
              </Link>
            )
          })}
        </div>

        {(query || selectedStatus !== 'all') && (
          <div className="flex items-center gap-2 mb-6 text-xs text-slate-400">
            <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            <Link href="/explore" className="text-indigo-600 hover:text-indigo-700 underline ml-1">Clear</Link>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="border border-slate-200 rounded-xl p-10 text-center">
            {allItems.length === 0 ? (
              <>
                <p className="text-sm font-medium text-slate-900 mb-2">No signals detected yet</p>
                <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                  Rishi collects signals daily at 6:00 AM UTC. Trends will appear here after the pipeline runs.
                </p>
                <Link href="/method" className="text-xs text-indigo-600 font-medium">How Rishi works</Link>
              </>
            ) : (
              <p className="text-sm text-slate-500">No trends match these filters.</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => {
              const isTopicOnly = item.hypothesis_status === 'topic_only'

              const statusColors: Record<string, string> = {
                valid: 'text-indigo-600 bg-indigo-50',
                uncertain: 'text-amber-600 bg-amber-50',
                topic_only: 'text-slate-400 bg-slate-100',
                rejected: 'text-red-600 bg-red-50',
              }
              const statusLabel: Record<string, string> = {
                valid: 'Valid',
                uncertain: 'Uncertain',
                topic_only: 'Topic only',
                rejected: 'Rejected',
              }

              return (
                <Link
                  key={item.trend_id}
                  href={`/trends/${item.trend_id}`}
                  className={`block bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition group ${isTopicOnly ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">
                      {item.display_title}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColors[item.hypothesis_status] || statusColors.uncertain}`}>
                        {statusLabel[item.hypothesis_status] || 'Unknown'}
                      </span>
                      {item.qualified && (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Ready to build</span>
                      )}
                    </div>
                  </div>

                  {item.hypothesis_summary && !isTopicOnly && (
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-2">{item.hypothesis_summary}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{item.signal_count} signal{item.signal_count !== 1 ? 's' : ''}</span>
                    {item.source_count > 0 && <span>{item.source_count} source{item.source_count !== 1 ? 's' : ''}</span>}
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
