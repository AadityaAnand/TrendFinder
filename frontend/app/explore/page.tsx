import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Badge } from '../components/Badge'
import { SourceBadge } from '../components/SourceBadge'

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

function matchesDomain(theme: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true
  const lower = theme.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

interface TrendItem {
  trend_id: string
  theme: string
  description: string | null
  stage: string | null
  stage_confidence: number
  signal_count: number
  comparable: boolean
  qualified: boolean
  top_signals: { title: string; source: string }[]
}

async function getTrends(): Promise<{ trends: TrendItem[]; snapshotTime: string | null }> {
  const { data: latestSnapshot } = await supabase
    .from('trend_snapshots')
    .select('id, run_at')
    .eq('scoring_version', SUPPORTED_SCORING_VERSION)
    .order('run_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestSnapshot) return { trends: [], snapshotTime: null }

  const { data: allTrends } = await supabase
    .from('detected_trends')
    .select('id, theme, description')
    .order('last_updated', { ascending: false })

  if (!allTrends || allTrends.length === 0) return { trends: [], snapshotTime: latestSnapshot.run_at }

  const trendIds = allTrends.map(t => t.id)

  const [lifecycleRes, oppRes, snapshotRes, evidenceRes] = await Promise.all([
    supabase
      .from('trend_lifecycle_history')
      .select('trend_id, lifecycle_stage, stage_confidence, current_signals, acceleration_comparable')
      .eq('snapshot_id', latestSnapshot.id)
      .eq('lifecycle_version', SUPPORTED_LIFECYCLE_VERSION)
      .in('trend_id', trendIds),
    supabase
      .from('trend_opportunities')
      .select('trend_id, qualified')
      .eq('snapshot_id', latestSnapshot.id)
      .in('trend_id', trendIds),
    supabase
      .from('trend_snapshot_items')
      .select('trend_id, signal_count')
      .eq('snapshot_id', latestSnapshot.id)
      .in('trend_id', trendIds),
    supabase
      .from('trend_signals')
      .select('trend_id, raw_signals!inner(title, source, score)')
      .eq('snapshot_id', latestSnapshot.id)
      .in('trend_id', trendIds),
  ])

  const lifecycleMap = new Map(lifecycleRes.data?.map(l => [l.trend_id, l]) || [])
  const oppMap = new Map(oppRes.data?.map(o => [o.trend_id, { qualified: o.qualified }]) || [])
  const snapshotMap = new Map(snapshotRes.data?.map(s => [s.trend_id, s]) || [])

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

  const trends: TrendItem[] = allTrends.map(t => {
    const lifecycle = lifecycleMap.get(t.id)
    const opp = oppMap.get(t.id)
    const snapshot = snapshotMap.get(t.id)

    return {
      trend_id: t.id,
      theme: t.theme,
      description: t.description || null,
      stage: lifecycle?.lifecycle_stage || null,
      stage_confidence: lifecycle?.stage_confidence || 0,
      signal_count: lifecycle?.current_signals || snapshot?.signal_count || 0,
      comparable: lifecycle?.acceleration_comparable || false,
      qualified: opp?.qualified || false,
      top_signals: evidenceMap.get(t.id) || [],
    }
  })

  const filtered = trends.filter(t => t.signal_count > 0)

  filtered.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1
    return b.signal_count - a.signal_count
  })

  return { trends: filtered, snapshotTime: latestSnapshot.run_at }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>
}) {
  const { domain: activeDomain } = await searchParams
  const selectedDomain = activeDomain || 'all'
  const { trends, snapshotTime } = await getTrends()

  const domainConfig = DOMAIN_CATEGORIES.find(d => d.key === selectedDomain)
  const filteredTrends = domainConfig
    ? trends.filter(t => matchesDomain(t.theme, domainConfig.keywords))
    : trends

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Market Radar</h1>
          <p className="text-sm text-slate-500 mt-1">
            All tracked trends across the developer ecosystem
          </p>
          {snapshotTime && (
            <p className="text-xs text-slate-400 mt-1">
              Last updated {new Date(snapshotTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 mb-8 overflow-x-auto pb-1">
          {DOMAIN_CATEGORIES.map(cat => {
            const isActive = cat.key === selectedDomain
            const count = cat.key === 'all'
              ? trends.length
              : trends.filter(t => matchesDomain(t.theme, cat.keywords)).length
            if (count === 0 && cat.key !== 'all') return null
            return (
              <Link
                key={cat.key}
                href={cat.key === 'all' ? '/explore' : `/explore?domain=${cat.key}`}
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

        {filteredTrends.length === 0 ? (
          <div className="border border-slate-200 rounded-xl p-10 text-center">
            <p className="text-sm text-slate-600 mb-2">
              {selectedDomain !== 'all' ? 'No trends match this category.' : 'No trends detected yet.'}
            </p>
            <p className="text-xs text-slate-400">
              {selectedDomain !== 'all'
                ? 'Try a different category or view all trends.'
                : 'Trends appear after the daily pipeline runs.'}
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
                    <div>
                      <Link
                        href={`/trends/${trend.trend_id}`}
                        className="text-base font-semibold text-slate-900 hover:text-emerald-600 transition"
                      >
                        {trend.theme}
                      </Link>
                      {trend.description && (
                        <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{trend.description}</p>
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
                        <span className="text-xs text-slate-400">Collecting data</span>
                      )}
                    </div>
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
