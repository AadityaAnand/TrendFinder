const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  devtools: { label: 'Dev Tools', className: 'bg-indigo-50 text-indigo-700' },
  'ai-ml': { label: 'AI/ML', className: 'bg-purple-50 text-purple-700' },
  devops: { label: 'DevOps', className: 'bg-blue-50 text-blue-700' },
  saas: { label: 'SaaS', className: 'bg-emerald-50 text-emerald-700' },
  infra: { label: 'Infrastructure', className: 'bg-cyan-50 text-cyan-700' },
  content: { label: 'Content', className: 'bg-pink-50 text-pink-700' },
  product: { label: 'Product', className: 'bg-violet-50 text-violet-700' },
}

export function CategoryBadge({ category }: { category: string }) {
  const entry = CATEGORY_STYLES[category?.toLowerCase()]
  const label = entry?.label ?? category
  const className = entry?.className ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${className}`}>
      {label}
    </span>
  )
}
