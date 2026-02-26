const SEVERITY_STYLES: Record<string, string> = {
  high: 'border-l-4 border-red-300 bg-red-50 text-red-800',
  medium: 'border-l-4 border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-l-4 border-slate-200 bg-slate-50 text-slate-700',
}

export function RiskIndicator({
  label,
  severity,
}: {
  label: string
  severity: string
}) {
  const styles = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low
  return (
    <div className={`${styles} rounded-r-lg px-3 py-2 text-sm`}>{label}</div>
  )
}
