export function ConfidenceBadge({ score }: { score: number }) {
  const config = score >= 0.7
    ? { label: 'High confidence', className: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40' }
    : score >= 0.4
    ? { label: 'Moderate confidence', className: 'text-amber-400 bg-amber-900/20 border-amber-800/40' }
    : { label: 'Low confidence', className: 'text-[var(--text-tertiary)] bg-[var(--surface)] border-[var(--border)]' }

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  )
}
