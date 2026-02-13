export function ConfidenceBadge({ score }: { score: number }) {
  const config = score >= 0.7
    ? { label: 'High confidence', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    : score >= 0.4
    ? { label: 'Moderate confidence', className: 'text-amber-700 bg-amber-50 border-amber-200' }
    : { label: 'Low confidence', className: 'text-slate-500 bg-slate-50 border-slate-200' }

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  )
}
