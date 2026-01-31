import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Badge } from '../components/Badge'

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

// Domain categories with keyword patterns for matching trends
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
  stage: string | null
  stage_confidence: number
  momentum: number
  peak_momentum: number | null
  acceleration: number | null
  signal_count: number
  comparable: boolean
  qualified: boolean
  opportunity_score: number | null
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
    .select('id, theme')
    .order('last_updated', { ascending: false })

  if (!allTrends || allTrends.length === 0) return { trends: [], snapshotTime: latestSnapshot.run_at }

  const trendIds = allTrends.map(t => t.id)

  // Fetch lifecycle, opportunities, snapshot items, and trajectories in parallel
  const [lifecycleRes, oppRes, snapshotRes, trajectoryRes, evidenceRes] = await Promise.all([
    supabase
      .from('trend_lifecycle_history')
      .select('trend_id, lifecycle_stage, stage_confidence, current_momentum, acceleration_score, current_signals, acceleration_comparable')
      .eq('snapshot_id', latestSnapshot.id)
      .eq('lifecycle_version', SUPPORTED_LIFECYCLE_VERSION)
      .in('trend_id', trendIds),
    supabase
      .from('trend_opportunities')
      .select('trend_id, qualified, opportunity_score')
      .eq('snapshot_id', latestSnapshot.id)
      .in('trend_id', trendIds),
    supabase
      .from('trend_snapshot_items')
      .select('trend_id, momentum_score, signal_count')
      .eq('snapshot_id', latestSnapshot.id)
      .in('trend_id', trendIds),
    supabase
      .from('trend_trajectories')
      .select('trend_id, peak_momentum')
      .in('trend_id', trendIds),
    supabase
      .from('trend_signals')
      .select('trend_id, raw_signals!inner(title, source, score)')
      .eq('snapshot_id', latestSnapshot.id)
      .in('trend_id', trendIds),
  ])

  const lifecycleMap = new Map(lifecycleRes.data?.map(l => [l.trend_id, l]) || [])
  const oppMap = new Map(oppRes.data?.map(o => [o.trend_id, { qualified: o.qualified, score: o.opportunity_score }]) || [])
  const snapshotMap = new Map(snapshotRes.data?.map(s => [s.trend_id, s]) || [])
  const trajectoryMap = new Map(trajectoryRes.data?.map(t => [t.trend_id, t]) || [])

  // Build top signals per trend (top 3 by score)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evidenceRows = (evidenceRes.data || []) as any[]
  const evidenceMap = new Map<string, { title: string; source: string }[]>()
  for (const row of evidenceRows) {
    const sig = row.raw_signals
    if (!sig) continue
    if (!evidenceMap.has(row.trend_id)) evidenceMap.set(row.trend_id, [])
    evidenceMap.get(row.trend_id)!.push({ title: sig.title, source: sig.source })
  }
  // Sort by score (already in raw_signals) and keep top 3 per trend
  for (const [tid, sigs] of evidenceMap) {
    evidenceMap.set(tid, sigs.slice(0, 3))
  }

  const trends: TrendItem[] = allTrends.map(t => {
    const lifecycle = lifecycleMap.get(t.id)
    const opp = oppMap.get(t.id)
    const snapshot = snapshotMap.get(t.id)
    const trajectory = trajectoryMap.get(t.id)

    return {
      trend_id: t.id,
      theme: t.theme,
      stage: lifecycle?.lifecycle_stage || null,
      stage_confidence: lifecycle?.stage_confidence || 0,
      momentum: lifecycle?.current_momentum || snapshot?.momentum_score || 0,
      peak_momentum: trajectory?.peak_momentum ?? null,
      acceleration: lifecycle?.acceleration_score ?? null,
      signal_count: lifecycle?.current_signals || snapshot?.signal_count || 0,
      comparable: lifecycle?.acceleration_comparable || false,
      qualified: opp?.qualified || false,
      opportunity_score: opp?.score || null,
      top_signals: evidenceMap.get(t.id) || [],
    }
  })

  trends.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1
    return b.momentum - a.momentum
  })

  return { trends, snapshotTime: latestSnapshot.run_at }
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

  const qualifiedCount = filteredTrends.filter(t => t.qualified).length

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Explore Trends</h1>
          <p className="text-sm text-slate-500 mt-1">
            {filteredTrends.length} trend{filteredTrends.length !== 1 ? 's' : ''}{selectedDomain !== 'all' ? ` in ${domainConfig?.label}` : ''}{qualifiedCount > 0 && ` \u00b7 ${qualifiedCount} qualified`}
          </p>
          {snapshotTime && (
            <p className="text-xs text-slate-400 mt-1">
              Last updated {new Date(snapshotTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Domain filter tabs */}
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1">
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

        {/* Info link */}
        <div className="flex justify-end mb-4">
          <Link href="/learn" className="text-xs text-slate-400 hover:text-slate-600 transition">
            What do these metrics mean?
          </Link>
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
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Trend</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Stage</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Current</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Peak</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Signals</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Qualified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrends.map((trend) => {
                  const stageConfig = trend.stage ? STAGE_CONFIG[trend.stage] : null
                  const peakRatio = trend.peak_momentum && trend.peak_momentum > 0
                    ? trend.momentum / trend.peak_momentum
                    : null

                  return (
                    <tr key={trend.trend_id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/trends/${trend.trend_id}`}
                          className="font-medium text-slate-900 hover:text-emerald-600 transition"
                        >
                          {trend.theme}
                        </Link>
                        {trend.top_signals.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {trend.top_signals.map((sig, i) => (
                              <p key={i} className="text-xs text-slate-400 truncate max-w-md">
                                <span className="text-slate-300">{sig.source === 'hackernews' ? 'HN' : sig.source === 'github' ? 'GH' : sig.source === 'devto' ? 'Dev' : sig.source}</span>
                                {' '}{sig.title}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {stageConfig && trend.comparable && trend.stage_confidence >= 0.5 ? (
                          <Badge variant={stageConfig.variant}>{stageConfig.label}</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Gathering data</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-semibold text-slate-700 tabular-nums">
                          {trend.momentum.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {trend.peak_momentum != null ? (
                          <div>
                            <span className="font-semibold text-slate-700 tabular-nums">
                              {trend.peak_momentum.toFixed(2)}
                            </span>
                            {peakRatio !== null && peakRatio < 1 && (
                              <span className="ml-1 text-xs text-slate-400 tabular-nums">
                                ({Math.round(peakRatio * 100)}%)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-slate-600 tabular-nums">{trend.signal_count}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {trend.qualified ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            {trend.opportunity_score != null && (
                              <span className="text-xs font-medium text-emerald-600 tabular-nums">
                                {trend.opportunity_score.toFixed(2)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">--</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
