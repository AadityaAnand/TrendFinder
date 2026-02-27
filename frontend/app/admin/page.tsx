import Link from 'next/link'
import { getServerSupabase } from '@/lib/supabase-server'

export default async function AdminPage() {
  const db = getServerSupabase()

  const [metricsRes, adjustmentsRes, unresolvedRes] = await Promise.all([
    db.from('calibration_metrics')
      .select('prediction_type, brier_score, expected_calibration_error, total_resolved, computed_at')
      .order('computed_at', { ascending: false })
      .limit(40),
    db.from('confidence_adjustments')
      .select('prediction_type, adjustment_multiplier, based_on_samples, observed_accuracy')
      .eq('active', true)
      .order('prediction_type'),
    db.from('confidence_predictions')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null),
  ])

  const metrics = metricsRes.data ?? []
  const adjustments = adjustmentsRes.data ?? []
  const unresolvedCount = unresolvedRes.count ?? 0

  // Deduplicate to latest per prediction type
  const latestByType = Object.values(
    metrics.reduce((acc: Record<string, typeof metrics[0]>, m) => {
      if (!acc[m.prediction_type]) acc[m.prediction_type] = m
      return acc
    }, {})
  )

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold text-slate-900">Calibration Dashboard</h1>
        <Link href="/admin/pipeline" className="text-sm text-indigo-600 hover:underline">Pipeline status →</Link>
      </div>
      <p className="text-sm text-slate-500 mb-10">Confidence prediction accuracy metrics</p>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <StatCard label="Unresolved Predictions" value={String(unresolvedCount)} />
        <StatCard label="Prediction Types Tracked" value={String(latestByType.length)} />
        <StatCard label="Active Adjustments" value={String(adjustments.length)} />
      </div>

      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Latest Calibration Metrics</h2>
      <div className="border border-slate-200 rounded-xl overflow-hidden mb-10">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Type</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Brier ↓</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">ECE ↓</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Samples</th>
            </tr>
          </thead>
          <tbody>
            {latestByType.map(m => (
              <tr key={m.prediction_type} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{m.prediction_type}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{m.brier_score?.toFixed(4) ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{m.expected_calibration_error?.toFixed(4) ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{m.total_resolved ?? '—'}</td>
              </tr>
            ))}
            {latestByType.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-xs">
                  No metrics yet — run <span className="font-mono">python confidence_calibration.py</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Active Calibration Adjustments</h2>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Type</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Multiplier</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Observed Accuracy</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Based On</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map((a, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{a.prediction_type}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{a.adjustment_multiplier?.toFixed(3) ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">
                  {a.observed_accuracy != null ? `${(a.observed_accuracy * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-700">{a.based_on_samples ?? '—'}</td>
              </tr>
            ))}
            {adjustments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-xs">
                  No adjustments yet — need 20+ resolved predictions per type
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}
