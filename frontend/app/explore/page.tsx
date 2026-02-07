import { getServerSupabase, getLatestSnapshot } from '@/lib/supabase-server'
import Link from 'next/link'
import { Badge } from '../components/Badge'
import { SourceBadge } from '../components/SourceBadge'
import { DataHealth } from '../components/DataHealth'
import { Suspense } from 'react'

const STAGE_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  emerging: { label: 'Emerging', variant: 'info' },
  rising: { label: 'Rising', variant: 'success' },
  peaking: { label: 'Peaking', variant: 'warning' },
  stable: { label: 'Stable', variant: 'muted' },
  declining: { label: 'Declining', variant: 'danger' },
  fading: { label: 'Fading', variant: 'muted' },
}

const DOMAIN_CATEGORIES: { key: string; label: string; keywords: string[] }[] = [
  { key: 'all', label: 'All', keywords: [] },
  { key: 'ai', label: 'AI & ML', keywords: ['ai', 'ml', 'llm', 'gpt', 'machine learning', 'deep learning', 'neural', 'transformer', 'diffusion', 'generative', 'copilot', 'chatbot', 'rag', 'embedding', 'fine-tun', 'agent', 'openai', 'anthropic', 'claude', 'gemini', 'mistral'] },
  { key: 'web', label: 'Web & APIs', keywords: ['web', 'api', 'rest', 'graphql', 'frontend', 'backend', 'react', 'next', 'vue', 'svelte', 'angular', 'node', 'deno', 'bun', 'html', 'css', 'javascript', 'typescript', 'http', 'websocket'] },
  { key: 'devtools', label: 'Dev Tools', keywords: ['cli', 'editor', 'ide', 'git', 'docker', 'kubernetes', 'ci', 'cd', 'devops', 'terraform', 'testing', 'debug', 'lint', 'bundler', 'package', 'sdk', 'developer tool', 'dev tool', 'vscode', 'neovim'] },
  { key: 'infra', label: 'Infrastructure', keywords: ['cloud', 'aws', 'gcp', 'azure', 'serverless', 'edge', 'cdn', 'database', 'postgres', 'redis', 'kafka', 'queue', 'container', 'wasm', 'webassembly', 'deploy', 'hosting', 'infra'] },
  { key: 'security', label: 'Security', keywords: ['security', 'auth', 'oauth', 'encryption', 'vulnerability', 'pentest', 'zero trust', 'privacy', 'compliance'] },
  { key: 'crypto', label: 'Web3 & Crypto', keywords: ['crypto', 'blockchain', 'web3', 'defi', 'nft', 'solana', 'ethereum', 'smart contract', 'dao', 'token'] },
  { key: 'data', label: 'Data & Analytics', keywords: ['data', 'analytics', 'etl', 'pipeline', 'warehouse', 'visualization', 'dashboard', 'metric', 'observability', 'monitoring', 'logging'] },
]

const STAGE_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'Any stage' },
  { key: 'emerging', label: 'Emerging' },
  { key: 'rising', label: 'Rising' },
  { key: 'peaking', label: 'Peaking' },
  { key: 'stable', label: 'Stable' },
  { key: 'declining', label: 'Declining' },
]

function matchesDomain(theme: string, description: string | null, keywords: string[]): boolean {
  if (keywords.length === 0) return true
  const lower = `${theme} ${description || ''}`.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

interface TrendItem {
  trend_id: string
  theme: string
  description: string | null
  stage: string | null
  stage_confidence: number
  momentum_score: number
  signal_count: number
  comparable: boolean
  qualified: boolean
  top_signals: { title: string; source: string }[]
}

async function getTrends(): Promise<{ trends: TrendItem[]; snapshotTime: string | null; snapshotVersion: string | null }> {
  const db = getServerSupabase()
  const snapshot = await getLatestSnapshot(db)

  if (!snapshot) return { trends: [], snapshotTime: null, snapshotVersion: null }

  const { data: snapshotItems } = await db
    .from('trend_snapshot_items')
    .select('trend_id, momentum_score, signal_count')
    .eq('snapshot_id', snapshot.id)

  if (!snapshotItems || snapshotItems.length === 0) {
    return { trends: [], snapshotTime: snapshot.run_at, snapshotVersion: snapshot.scoring_version }
  }

  const trendIds = snapshotItems.map(s => s.trend_id)

  const [trendsRes, lifecycleRes, oppRes, evidenceRes] = await Promise.all([
    db
      .from('detected_trends')
      .select('id, theme, description')
      .in('id', trendIds),
    db
      .from('trend_lifecycle_history')
      .select('trend_id, lifecycle_stage, stage_confidence, current_signals, acceleration_comparable')
      .eq('snapshot_id', snapshot.id)
      .in('trend_id', trendIds),
    db
      .from('trend_opportunities')
      .select('trend_id, qualified')
      .eq('snapshot_id', snapshot.id)
      .in('trend_id', trendIds),
    db
      .from('trend_signals')
      .select('trend_id, raw_signals!inner(title, source, score)')
      .eq('snapshot_id', snapshot.id)
      .in('trend_id', trendIds),
  ])

  const trendMap = new Map((trendsRes.data || []).map(t => [t.id, t]))
  const lifecycleMap = new Map((lifecycleRes.data || []).map(l => [l.trend_id, l]))
  const oppMap = new Map((oppRes.data || []).map(o => [o.trend_id, { qualified: o.qualified }]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidenceRows = (evidenceRes.data || []) as any[]
  const evidenceMap = new Map<string, { title: string; source: string }[]>()
  for (const row of evidenceRows) {
    const sig = row.raw_signals
    if (!sig) continue
    if (!evidenceMap.has(row.trend_id)) evidenceMap.set(row.trend_id, [])
    evidenceMap.get(row.trend_id)!.push({ title: sig.title, source: sig.source })
  }
  for (const [tid, sigs] of evidenceMap) {
    evidenceMap.set(tid, sigs.slice(0, 3))
  }

  const trends: TrendItem[] = snapshotItems
    .map(item => {
      const trend = trendMap.get(item.trend_id)
      if (!trend) return null
      const lifecycle = lifecycleMap.get(item.trend_id)
      const opp = oppMap.get(item.trend_id)

      return {
        trend_id: item.trend_id,
        theme: trend.theme,
        description: trend.description || null,
        stage: lifecycle?.lifecycle_stage || null,
        stage_confidence: lifecycle?.stage_confidence || 0,
        momentum_score: item.momentum_score || 0,
        signal_count: lifecycle?.current_signals || item.signal_count || 0,
        comparable: lifecycle?.acceleration_comparable || false,
        qualified: opp?.qualified || false,
        top_signals: evidenceMap.get(item.trend_id) || [],
      }
    })
    .filter((t): t is TrendItem => t !== null && t.signal_count > 0)

  trends.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1
    return b.momentum_score - a.momentum_score
  })

  return { trends, snapshotTime: snapshot.run_at, snapshotVersion: snapshot.scoring_version }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; stage?: string; q?: string; debug?: string }>
}) {
  const { domain: activeDomain, stage: activeStage, q: searchQuery } = await searchParams
  const selectedDomain = activeDomain || 'all'
  const selectedStage = activeStage || 'all'
  const query = searchQuery?.trim().toLowerCase() || ''
  const { trends, snapshotTime, snapshotVersion } = await getTrends()

  const domainConfig = DOMAIN_CATEGORIES.find(d => d.key === selectedDomain)
  let filteredTrends = domainConfig
    ? trends.filter(t => matchesDomain(t.theme, t.description, domainConfig.keywords))
    : trends

  if (selectedStage !== 'all') {
    filteredTrends = filteredTrends.filter(t => t.stage === selectedStage && t.comparable && t.stage_confidence >= 0.5)
  }

  if (query) {
    filteredTrends = filteredTrends.filter(t => {
      const text = `${t.theme} ${t.description || ''}`.toLowerCase()
      return text.includes(query)
    })
  }

  function buildFilterUrl(params: { domain?: string; stage?: string; q?: string }) {
    const parts: string[] = []
    const d = params.domain ?? selectedDomain
    const s = params.stage ?? selectedStage
    const search = params.q ?? query
    if (d && d !== 'all') parts.push(`domain=${d}`)
    if (s && s !== 'all') parts.push(`stage=${s}`)
    if (search) parts.push(`q=${encodeURIComponent(search)}`)
    return parts.length > 0 ? `/explore?${parts.join('&')}` : '/explore'
  }

  return (
    <div className="min-h-screen bg-white">
      <Suspense fallback={null}>
        <DataHealth />
      </Suspense>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Explore</h1>
          <p className="text-sm text-slate-500 mt-1">
            All tracked trends across the developer ecosystem
          </p>
          {snapshotTime && (
            <p className="text-xs text-slate-400 mt-1">
              Last updated {new Date(snapshotTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {snapshotVersion ? ` · ${snapshotVersion}` : ''}
              {` · ${trends.length} trend${trends.length !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>

        <form action="/explore" method="GET" className="mb-4">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search trends..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
            />
            {selectedDomain !== 'all' && <input type="hidden" name="domain" value={selectedDomain} />}
            {selectedStage !== 'all' && <input type="hidden" name="stage" value={selectedStage} />}
          </div>
        </form>

        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
          {DOMAIN_CATEGORIES.map(cat => {
            const isActive = cat.key === selectedDomain
            const count = cat.key === 'all'
              ? trends.length
              : trends.filter(t => matchesDomain(t.theme, t.description, cat.keywords)).length
            if (count === 0 && cat.key !== 'all') return null
            return (
              <Link
                key={cat.key}
                href={buildFilterUrl({ domain: cat.key })}
                className={`shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-medium transition border ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {cat.label}
                <span className={`ml-1.5 text-xs ${isActive ? 'text-slate-400' : 'text-slate-400'}`}>
                  {count}
                </span>
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-1.5 mb-8 overflow-x-auto pb-1">
          {STAGE_FILTERS.map(sf => {
            const isActive = sf.key === selectedStage
            return (
              <Link
                key={sf.key}
                href={buildFilterUrl({ stage: sf.key })}
                className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium transition border ${
                  isActive
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-500 border-slate-150 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {sf.label}
              </Link>
            )
          })}
        </div>

        {(query || selectedStage !== 'all') && (
          <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
            <span>Showing {filteredTrends.length} result{filteredTrends.length !== 1 ? 's' : ''}</span>
            {query && <span className="bg-slate-100 px-2 py-0.5 rounded">Search: &quot;{query}&quot;</span>}
            {selectedStage !== 'all' && <span className="bg-slate-100 px-2 py-0.5 rounded">Stage: {selectedStage}</span>}
            <Link href={buildFilterUrl({ q: '', stage: 'all', domain: selectedDomain })} className="text-slate-400 hover:text-slate-600 underline">
              Clear filters
            </Link>
          </div>
        )}

        {filteredTrends.length === 0 ? (
          <div className="border border-slate-200 rounded-xl p-10 text-center">
            <p className="text-sm text-slate-600 mb-2">
              {trends.length === 0
                ? 'No trends detected yet.'
                : query
                ? `No trends matching "${query}".`
                : selectedDomain !== 'all'
                ? 'No trends match this category.'
                : 'No trends match these filters.'}
            </p>
            <p className="text-xs text-slate-400">
              {trends.length === 0
                ? 'Trends appear after the daily pipeline runs. Add ?debug=1 to check data health.'
                : 'Try a different search term or clear filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTrends.map((trend) => {
              const stageConfig = trend.stage ? STAGE_CONFIG[trend.stage] : null
              const showStage = stageConfig && trend.comparable && trend.stage_confidence >= 0.5

              return (
                <div key={trend.trend_id} className="border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/trends/${trend.trend_id}`}
                        className="text-base font-semibold text-slate-900 hover:text-emerald-600 transition"
                      >
                        {trend.theme}
                      </Link>
                      {trend.description && (
                        <p className="text-sm text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{trend.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {trend.qualified && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-medium text-emerald-600">Qualified</span>
                        </span>
                      )}
                      {showStage ? (
                        <Badge variant={stageConfig.variant}>{stageConfig.label}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">Gathering data</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-2.5 text-xs text-slate-400">
                    <span>{trend.signal_count} signal{trend.signal_count !== 1 ? 's' : ''}</span>
                    <span>Momentum: {(trend.momentum_score * 100).toFixed(0)}%</span>
                  </div>

                  {trend.top_signals.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {trend.top_signals.map((sig, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <SourceBadge source={sig.source} />
                          <span className="text-sm text-slate-500 truncate">{sig.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
