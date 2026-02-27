import Link from 'next/link'
import { getServerSupabase } from '@/lib/supabase-server'

function statusDot(status: string) {
  const color =
    status === 'healthy' ? '#10B981' :
    status === 'degraded' ? '#F59E0B' :
    status === 'failed' ? '#EF4444' : '#9CA3AF'
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 6, flexShrink: 0,
    }} />
  )
}

function formatRelative(ts: string | null): string {
  if (!ts) return 'Never'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '—'
  const diff = Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  return `${Math.floor(diff / 60)}m ${diff % 60}s`
}

export default async function PipelineDashboard() {
  const db = getServerSupabase()

  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [runsRes, scraperHealthRes, signalsRes] = await Promise.all([
    db.from('pipeline_runs')
      .select('id, run_at, success, stages_completed, error')
      .order('run_at', { ascending: false })
      .limit(8),
    db.from('scraper_health')
      .select('source, status, last_run, last_success, consecutive_failures, total_signals_24h, last_signal_count, last_error')
      .order('source'),
    db.from('raw_signals')
      .select('source, created_at')
      .gte('created_at', cutoff24h)
      .limit(5000),
  ])

  const runs = runsRes.data ?? []
  const scrapers = scraperHealthRes.data ?? []
  const signals = signalsRes.data ?? []

  // Compute signal counts by source from raw_signals
  const signalsBySource: Record<string, number> = {}
  for (const s of signals) {
    signalsBySource[s.source] = (signalsBySource[s.source] ?? 0) + 1
  }

  // Approximate duration: use next run's run_at as the end time
  const runsWithDuration = runs.map((run, i) => {
    const nextRun = runs[i - 1]
    const approxEnd = nextRun ? nextRun.run_at : null
    return { ...run, approxEnd }
  })

  const allSources = [
    'hackernews', 'github', 'devto', 'reddit', 'producthunt', 'indiehackers', 'substack'
  ]

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold text-slate-900">Pipeline Status</h1>
        <Link href="/admin" className="text-sm text-indigo-600 hover:underline">← Calibration</Link>
      </div>
      <p className="text-sm text-slate-500 mb-10">Detection runs, scraper health, and signal volume</p>

      {/* Section A: Recent pipeline runs */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Recent detection runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-400">No pipeline runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 pr-4 font-medium">Run at</th>
                  <th className="pb-2 pr-4 font-medium">Duration</th>
                  <th className="pb-2 pr-4 font-medium">Stages</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {runsWithDuration.map(run => (
                  <tr key={run.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-700 whitespace-nowrap">
                      {new Date(run.run_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                        timeZoneName: 'short',
                      })}
                    </td>
                    <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">
                      {formatDuration(run.run_at, run.approxEnd)}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      {Array.isArray(run.stages_completed)
                        ? run.stages_completed.join(', ')
                        : '—'}
                    </td>
                    <td className="py-2">
                      {run.success ? (
                        <span className="text-emerald-600 font-medium">✓ Success</span>
                      ) : (
                        <span className="text-red-500 font-medium" title={run.error ?? ''}>
                          ✗ Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section B: Scraper health */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Scraper health</h2>
        {scrapers.length === 0 ? (
          <p className="text-sm text-slate-400">
            No scraper health data yet. Health records appear after the next scraper run.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 pr-4 font-medium">Source</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Last run</th>
                  <th className="pb-2 pr-4 font-medium">Last success</th>
                  <th className="pb-2 pr-4 font-medium">Failures</th>
                  <th className="pb-2 font-medium">Signals (24h)</th>
                </tr>
              </thead>
              <tbody>
                {scrapers.map(s => (
                  <tr key={s.source} className="border-b border-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-800">{s.source}</td>
                    <td className="py-2 pr-4">
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        {statusDot(s.status)}
                        <span className={
                          s.status === 'healthy' ? 'text-emerald-700' :
                          s.status === 'degraded' ? 'text-amber-600' :
                          'text-red-600'
                        }>
                          {s.status}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{formatRelative(s.last_run)}</td>
                    <td className="py-2 pr-4 text-slate-500">{formatRelative(s.last_success)}</td>
                    <td className="py-2 pr-4 text-slate-500">
                      {s.consecutive_failures > 0 ? (
                        <span className="text-red-500">{s.consecutive_failures}</span>
                      ) : '0'}
                    </td>
                    <td className="py-2 text-slate-700">{s.total_signals_24h ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section C: Signal volume */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-4">Signal volume (last 24h)</h2>
        <div className="flex flex-wrap gap-3">
          {allSources.map(source => {
            const count = signalsBySource[source] ?? 0
            return (
              <div
                key={source}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: 10,
                  padding: '10px 16px',
                  minWidth: 110,
                  background: count > 0 ? '#F8F9FB' : '#ffffff',
                }}
              >
                <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  {source}
                </p>
                <p style={{ fontSize: 22, fontWeight: 700, color: count > 0 ? '#111827' : '#D1D5DB' }}>
                  {count}
                </p>
              </div>
            )
          })}
          <div
            style={{
              border: '1px solid #4F46E5',
              borderRadius: 10,
              padding: '10px 16px',
              minWidth: 110,
              background: '#EEF2FF',
            }}
          >
            <p style={{ fontSize: 11, color: '#6366F1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Total
            </p>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#4F46E5' }}>
              {signals.length}
            </p>
          </div>
        </div>
      </section>

    </div>
  )
}
