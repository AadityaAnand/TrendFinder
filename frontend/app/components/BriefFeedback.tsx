'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'

interface BriefFeedbackProps {
  opportunityId: string | null
}

export function BriefFeedback({ opportunityId }: BriefFeedbackProps) {
  const { profileId } = useAuth()
  const [voted, setVoted] = useState<'helpful' | 'not_helpful' | null>(null)

  if (!opportunityId || !profileId) return null

  async function handleVote(helpful: boolean) {
    if (voted) return
    const feedbackType = helpful ? 'brief_helpful' : 'brief_not_helpful'
    setVoted(helpful ? 'helpful' : 'not_helpful')
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profileId,
          opportunity_id: opportunityId,
          feedback_type: feedbackType,
        }),
      })
    } catch {
      // fire-and-forget, don't revert local state
    }
  }

  return (
    <div className="pt-6 border-t border-slate-100 flex items-center gap-3">
      <span className="text-xs text-slate-400">Was this brief helpful?</span>
      <button
        onClick={() => handleVote(true)}
        disabled={!!voted}
        className={`text-lg transition-opacity ${voted === 'helpful' ? 'opacity-100' : voted ? 'opacity-30' : 'hover:opacity-70'}`}
        title="Yes, helpful"
        aria-label="Mark brief as helpful"
      >
        👍
      </button>
      <button
        onClick={() => handleVote(false)}
        disabled={!!voted}
        className={`text-lg transition-opacity ${voted === 'not_helpful' ? 'opacity-100' : voted ? 'opacity-30' : 'hover:opacity-70'}`}
        title="Not helpful"
        aria-label="Mark brief as not helpful"
      >
        👎
      </button>
      {voted && (
        <span className="text-xs text-slate-400">Thanks for your feedback!</span>
      )}
    </div>
  )
}
