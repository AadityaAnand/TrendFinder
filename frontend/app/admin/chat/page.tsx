import { getServerSupabase } from '@/lib/supabase-server'

interface AdminMetrics {
  overview: {
    total_sessions: number
    total_messages: number
    thumbs_up: number
    thumbs_down: number
    satisfaction_rate_pct: number | null
  }
  query_type_distribution: Record<string, number>
  failure_modes: { type: string; count: number }[]
  confidence_distribution: { high: number; medium: number; low: number }
  variant_comparison: { variant: string; message_count: number; avg_confidence: number | null }[]
  recent_low_rated: {
    feedback_id: string
    feedback_text: string | null
    created_at: string
    message_content: string
    query_type: string | null
    confidence_score: number | null
    session_id: string | null
  }[]
}

const QUERY_TYPE_LABELS: Record<string, string> = {
  evidence: 'Evidence',
  idea: 'Idea (LLM)',
  temporal_guard: 'Temporal guard',
  opinion_guard: 'Opinion guard',
  feasibility_guard: 'Feasibility guard',
  evidence_fallback: 'Evidence fallback',
  error_fallback: 'Error fallback',
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default async function ChatAdminPage({
  searchParams,
}: {
  searchParams: { key?: string }
}) {
  const adminKey = process.env.CHAT_ADMIN_KEY
  if (!adminKey || searchParams.key !== adminKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700">Access denied</p>
          <p className="text-sm text-slate-400 mt-1">Invalid or missing admin key</p>
        </div>
      </div>
    )
  }

  const db = getServerSupabase()

  // Fetch all data in parallel
  const [
    sessionsResult,
    messagesResult,
    feedbackResult,
    queryTypeResult,
    variantResult,
    lowRatedResult,
    confidenceResult,
  ] = await Promise.all([
    db.from('opportunity_chat_sessions').select('id', { count: 'exact', head: true }),
    db.from('opportunity_chat_messages').select('id', { count: 'exact', head: true }),
    db.from('chat_message_feedback').select('feedback_type'),
    db.from('opportunity_chat_messages').select('query_type').eq('role', 'assistant').not('query_type', 'is', null),
    db.from('opportunity_chat_messages').select('confidence_score, metadata').eq('role', 'assistant').not('metadata', 'is', null),
    db
      .from('chat_message_feedback')
      .select('id, feedback_type, feedback_text, created_at, message_id, opportunity_chat_messages!inner(content, query_type, confidence_score, session_id)')
      .eq('feedback_type', 'thumbs_down')
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('opportunity_chat_messages').select('confidence_score').eq('role', 'assistant').not('confidence_score', 'is', null),
  ])

  const totalSessions = sessionsResult.count || 0
  const totalMessages = messagesResult.count || 0
  const feedbackRows = feedbackResult.data || []
  const thumbsUp = feedbackRows.filter(f => f.feedback_type === 'thumbs_up').length
  const thumbsDown = feedbackRows.filter(f => f.feedback_type === 'thumbs_down').length
  const satisfactionRate = (thumbsUp + thumbsDown) > 0
    ? Math.round((thumbsUp / (thumbsUp + thumbsDown)) * 100)
    : null

  // Query type distribution
  const queryTypeCounts: Record<string, number> = {}
  for (const row of (queryTypeResult.data || [])) {
    const qt = row.query_type || 'unknown'
    queryTypeCounts[qt] = (queryTypeCounts[qt] || 0) + 1
  }

  // Failure modes
  const guardTypes = ['temporal_guard', 'opinion_guard', 'feasibility_guard', 'error_fallback', 'evidence_fallback']
  const failureModes = guardTypes
    .map(type => ({ type, count: queryTypeCounts[type] || 0 }))
    .filter(f => f.count > 0)
    .sort((a, b) => b.count - a.count)

  // A/B variant stats
  const variantStats: Record<string, { count: number; totalConfidence: number }> = {}
  for (const row of (variantResult.data || [])) {
    const meta = row.metadata as Record<string, unknown> | null
    const variant = (meta?.variant as string) || 'unknown'
    if (!variantStats[variant]) variantStats[variant] = { count: 0, totalConfidence: 0 }
    variantStats[variant].count++
    if (typeof row.confidence_score === 'number') {
      variantStats[variant].totalConfidence += row.confidence_score
    }
  }
  const variantComparison = Object.entries(variantStats).map(([variant, stats]) => ({
    variant,
    count: stats.count,
    avgConfidence: stats.count > 0 ? (stats.totalConfidence / stats.count).toFixed(2) : '—',
  }))

  // Confidence distribution
  const confRows = confidenceResult.data || []
  const confHigh = confRows.filter(r => (r.confidence_score || 0) >= 0.8).length
  const confMed = confRows.filter(r => (r.confidence_score || 0) >= 0.5 && (r.confidence_score || 0) < 0.8).length
  const confLow = confRows.filter(r => (r.confidence_score || 0) < 0.5).length

  // Recent low-rated
  type LowRatedMsg = { content: string; query_type: string | null; confidence_score: number | null; session_id: string }
  const lowRated = (lowRatedResult.data || []).map(row => {
    const msgs = row.opportunity_chat_messages as unknown as LowRatedMsg | LowRatedMsg[] | null
    const msg = Array.isArray(msgs) ? msgs[0] : msgs
    return {
      id: row.id,
      feedback_text: row.feedback_text,
      created_at: row.created_at,
      content: msg?.content?.slice(0, 250) || '',
      query_type: msg?.query_type,
      confidence_score: msg?.confidence_score,
    }
  })

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Chat Metrics</h1>
          <p className="text-sm text-slate-400 mt-1">Opportunity chat AI monitoring dashboard</p>
        </div>

        {/* Section 1: Overview */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Sessions" value={totalSessions} />
            <MetricCard label="Messages" value={totalMessages} />
            <MetricCard label="Thumbs Up" value={thumbsUp} />
            <MetricCard
              label="Satisfaction"
              value={satisfactionRate !== null ? `${satisfactionRate}%` : '—'}
              sub={`${thumbsUp} up / ${thumbsDown} down`}
            />
          </div>
        </section>

        {/* Section 2: Query type distribution */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Query Type Distribution</h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Type</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Count</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Share</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(queryTypeCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const total = Object.values(queryTypeCounts).reduce((a, b) => a + b, 0)
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0
                    return (
                      <tr key={type} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2.5 text-slate-700">{QUERY_TYPE_LABELS[type] || type}</td>
                        <td className="px-4 py-2.5 text-right text-slate-900 font-medium">{count}</td>
                        <td className="px-4 py-2.5 text-right text-slate-400">{pct}%</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3: Confidence calibration + Failure modes (side by side) */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Confidence Distribution</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
              {[
                { label: 'High (≥0.8)', count: confHigh, color: 'bg-emerald-400' },
                { label: 'Medium (0.5–0.8)', count: confMed, color: 'bg-yellow-400' },
                { label: 'Low (<0.5)', count: confLow, color: 'bg-orange-400' },
              ].map(({ label, count, color }) => {
                const total = confHigh + confMed + confLow
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <span>{label}</span>
                      <span className="font-medium">{count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Failure Modes</h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {failureModes.length === 0 ? (
                <p className="px-4 py-4 text-sm text-slate-400">No failures recorded yet</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {failureModes.map(({ type, count }) => (
                      <tr key={type} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2.5 text-slate-700">{QUERY_TYPE_LABELS[type] || type}</td>
                        <td className="px-4 py-2.5 text-right text-slate-900 font-medium">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        {/* Section 4: A/B variant comparison */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">A/B Variant Comparison</h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Variant</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Messages</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Avg Confidence</th>
                </tr>
              </thead>
              <tbody>
                {variantComparison.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-sm text-slate-400">No data yet</td>
                  </tr>
                ) : (
                  variantComparison.map(({ variant, count, avgConfidence }) => (
                    <tr key={variant} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 text-slate-700 font-mono text-xs">{variant}</td>
                      <td className="px-4 py-2.5 text-right text-slate-900 font-medium">{count}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{avgConfidence}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 5: Recent low-rated responses */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent Thumbs-Down Responses</h2>
          {lowRated.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm text-slate-400">No negative feedback yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lowRated.map(item => (
                <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {item.query_type && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">
                        {item.query_type}
                      </span>
                    )}
                    {typeof item.confidence_score === 'number' && (
                      <span className="text-[10px] text-slate-400">
                        conf: {item.confidence_score.toFixed(2)}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-300 ml-auto">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mb-1.5">{item.content}…</p>
                  {item.feedback_text && (
                    <p className="text-xs text-red-500 italic">&ldquo;{item.feedback_text}&rdquo;</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
