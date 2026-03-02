import Link from 'next/link'
import { PlatformBadge } from './PlatformBadge'

interface CreatorHypothesis {
  title: string | null
  summary: string | null
  status: string
  platform_focus: string[]
  monetization_angle: string | null
  pain_points?: { pain: string; evidence: string }[]
}

interface CreatorOpportunityCardProps {
  id: string
  trend_id: string
  display_name: string
  qualified: boolean
  hypothesis: CreatorHypothesis | null
  engagement_velocity?: number
  feedbackState?: 'saved' | 'dismissed' | null
  isExpanded: boolean
  onToggleExpand: () => void
  onSave: () => void
  onDismiss: () => void
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  video_series: 'Video Series',
  newsletter: 'Newsletter',
  podcast: 'Podcast',
  challenge: 'Challenge',
  course: 'Course',
  vlog: 'Vlog',
}

export function CreatorOpportunityCard({
  id,
  trend_id,
  display_name,
  qualified,
  hypothesis,
  engagement_velocity,
  feedbackState,
  isExpanded,
  onToggleExpand,
  onSave,
  onDismiss,
}: CreatorOpportunityCardProps) {
  const title = hypothesis?.title && hypothesis.title.length > 10 ? hypothesis.title : display_name
  const summary = hypothesis?.summary || null
  const platforms = hypothesis?.platform_focus || []
  const monetization = hypothesis?.monetization_angle || null
  const isFastMoving = typeof engagement_velocity === 'number' && engagement_velocity > 0.2

  return (
    <article className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-3 mb-2">
        <Link
          href={`/trends/${trend_id}`}
          className="text-base font-semibold text-slate-900 hover:text-indigo-600 transition-colors leading-snug"
        >
          {title}
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          {isFastMoving && (
            <span className="text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full" title="Growing fast">
              Trending
            </span>
          )}
          {qualified ? (
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              Ready to create
            </span>
          ) : (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Forming</span>
          )}
        </div>
      </div>

      {platforms.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {platforms.map(p => (
            <PlatformBadge key={p} source={p} />
          ))}
        </div>
      )}

      {summary && (
        <p className="text-sm text-slate-600 leading-relaxed mb-3">{summary}</p>
      )}

      {monetization && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Monetization angle</p>
          <p className="text-sm text-slate-600">{monetization}</p>
        </div>
      )}

      <button
        onClick={onToggleExpand}
        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors mb-1"
      >
        {isExpanded ? 'Less' : 'Details'}
      </button>

      {isExpanded && hypothesis?.pain_points && hypothesis.pain_points.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Audience pain</p>
            <ul className="space-y-1">
              {hypothesis.pain_points.slice(0, 3).map((p, i) => (
                <li key={i} className="text-xs text-slate-600">
                  <span className="text-indigo-400">&bull;</span>{' '}
                  <span className="italic">&ldquo;{p.evidence}&rdquo;</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <Link
          href={`/trends/${trend_id}`}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          Open Brief &rarr;
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              feedbackState === 'saved'
                ? 'text-emerald-700 bg-emerald-50'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {feedbackState === 'saved' ? 'Saved' : 'Save'}
          </button>
          <button
            onClick={onDismiss}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </article>
  )
}

// Re-export for convenience
export { CONTENT_TYPE_LABELS }
