const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  hackernews: { label: 'HN', className: 'bg-orange-900/25 text-orange-400' },
  github: { label: 'GH', className: 'bg-[var(--surface)] text-[var(--text-secondary)]' },
  devto: { label: 'Dev', className: 'bg-blue-900/25 text-blue-400' },
  reddit: { label: 'Reddit', className: 'bg-red-900/25 text-red-400' },
}

export function SourceBadge({ source }: { source: string }) {
  const config = SOURCE_CONFIG[source] || { label: source, className: 'bg-[var(--surface)] text-[var(--text-tertiary)]' }
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  )
}
