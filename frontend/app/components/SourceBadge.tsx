const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  hackernews: { label: 'HN', className: 'bg-orange-50 text-orange-700' },
  github: { label: 'GH', className: 'bg-slate-100 text-slate-700' },
  devto: { label: 'Dev', className: 'bg-blue-50 text-blue-700' },
  reddit: { label: 'Reddit', className: 'bg-red-50 text-red-700' },
}

export function SourceBadge({ source }: { source: string }) {
  const config = SOURCE_CONFIG[source] || { label: source, className: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  )
}
