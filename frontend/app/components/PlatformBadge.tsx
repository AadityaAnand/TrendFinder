const PLATFORM_CONFIG: Record<string, { label: string; className: string }> = {
  youtube_creator: { label: 'YouTube', className: 'bg-red-50 text-red-700' },
  spotify: { label: 'Spotify', className: 'bg-green-50 text-green-700' },
  medium: { label: 'Medium', className: 'bg-slate-100 text-slate-700' },
  twitch: { label: 'Twitch', className: 'bg-purple-50 text-purple-700' },
  tiktok: { label: 'TikTok', className: 'bg-pink-50 text-pink-700' },
  instagram: { label: 'Instagram', className: 'bg-orange-50 text-orange-700' },
  linkedin: { label: 'LinkedIn', className: 'bg-blue-50 text-blue-700' },
  podcast: { label: 'Podcast', className: 'bg-violet-50 text-violet-700' },
  newsletter: { label: 'Newsletter', className: 'bg-amber-50 text-amber-700' },
}

export function PlatformBadge({ source }: { source: string }) {
  const config = PLATFORM_CONFIG[source] || { label: source, className: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  )
}
