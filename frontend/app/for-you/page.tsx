'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface PersonalizedOpportunity {
  id: string
  trend_id: string
  opportunity_score: number
  suggested_actions: string[]
  demand_hits: number
  demand_examples: { title: string; url: string; source: string }[]
  relevance_score: number
  personalized_score: number
  relevance_breakdown: {
    role_match: number
    domain_match: number
    stack_match: number
    effort_fit: number
    risk_fit: number
    avoid_penalty: number
  }
  fit_reasons: string[]
  is_saved: boolean
  detected_trends: {
    id: string
    theme: string
    description: string
  } | null
}

interface FeedbackState {
  [opportunityId: string]: 'saved' | 'dismissed' | null
}

// Demo user ID for now - in production this would come from auth
const DEMO_USER_ID_KEY = 'trend_generator_user_id'

function FitReasonBadge({ reason }: { reason: string }) {
  const isNegative = reason.toLowerCase().includes('avoid')

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
        isNegative
          ? 'bg-amber-100 text-amber-800'
          : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {reason}
    </span>
  )
}

function RelevanceBreakdown({ breakdown }: { breakdown: PersonalizedOpportunity['relevance_breakdown'] }) {
  const items = [
    { key: 'role_match', label: 'Role', value: breakdown.role_match },
    { key: 'domain_match', label: 'Domain', value: breakdown.domain_match },
    { key: 'stack_match', label: 'Stack', value: breakdown.stack_match },
    { key: 'effort_fit', label: 'Effort', value: breakdown.effort_fit },
    { key: 'risk_fit', label: 'Risk', value: breakdown.risk_fit }
  ]

  return (
    <div className="flex gap-3 text-xs text-gray-500">
      {items.map(item => (
        <div key={item.key} className="flex items-center gap-1">
          <span>{item.label}:</span>
          <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${item.value * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function OpportunityCard({
  opportunity,
  index,
  onFeedback,
  feedbackState
}: {
  opportunity: PersonalizedOpportunity
  index: number
  onFeedback: (oppId: string, type: 'saved' | 'dismissed') => void
  feedbackState: 'saved' | 'dismissed' | null
}) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const trend = opportunity.detected_trends
  const primaryAction = opportunity.suggested_actions?.[0] || 'Explore this opportunity'

  return (
    <div className={`border rounded-xl p-6 transition ${
      feedbackState === 'saved'
        ? 'border-emerald-300 bg-emerald-50/30'
        : 'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
          <span className="text-lg font-bold text-emerald-600">{index + 1}</span>
        </div>

        <div className="grow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <Link
                href={`/trends/${opportunity.trend_id}`}
                className="text-xl font-bold text-gray-900 hover:text-emerald-600 transition"
              >
                {trend?.theme || 'Unknown Trend'}
              </Link>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">
                  {opportunity.demand_hits} demand signals
                </span>
                <span>
                  Score: {opportunity.personalized_score.toFixed(2)}
                </span>
                <span className="text-emerald-600">
                  ({Math.round(opportunity.relevance_score * 100)}% relevant)
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onFeedback(opportunity.id, 'saved')}
                className={`p-2 rounded-lg transition ${
                  feedbackState === 'saved'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-emerald-100 hover:text-emerald-600'
                }`}
                title="Save for later"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
              <button
                onClick={() => onFeedback(opportunity.id, 'dismissed')}
                className={`p-2 rounded-lg transition ${
                  feedbackState === 'dismissed'
                    ? 'bg-gray-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Not relevant"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <h3 className="font-semibold text-gray-800 mb-2">{primaryAction}</h3>
          {trend?.description && (
            <p className="text-gray-600 text-sm mb-3">{trend.description}</p>
          )}

          {opportunity.fit_reasons.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {opportunity.fit_reasons.map((reason, i) => (
                <FitReasonBadge key={i} reason={reason} />
              ))}
            </div>
          )}

          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {showBreakdown ? 'Hide details' : 'Show relevance breakdown'}
          </button>

          {showBreakdown && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <RelevanceBreakdown breakdown={opportunity.relevance_breakdown} />
              {opportunity.relevance_breakdown.avoid_penalty > 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  Contains topics you prefer to avoid (-{Math.round(opportunity.relevance_breakdown.avoid_penalty * 30)}%)
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ForYouPage() {
  const [opportunities, setOpportunities] = useState<PersonalizedOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [feedbackState, setFeedbackState] = useState<FeedbackState>({})
  const [snapshotId, setSnapshotId] = useState<string | null>(null)

  useEffect(() => {
    initUser()
  }, [])

  const initUser = async () => {
    // Check for existing user
    const storedId = localStorage.getItem(DEMO_USER_ID_KEY)

    if (storedId) {
      setUserId(storedId)
      loadOpportunities(storedId)
    } else {
      // Try to create/get profile
      try {
        const res = await fetch(`/api/profile?external_id=demo-user-001`)

        if (res.status === 404) {
          const createRes = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ external_id: 'demo-user-001', display_name: 'Demo User' })
          })
          const newProfile = await createRes.json()
          localStorage.setItem(DEMO_USER_ID_KEY, newProfile.id)
          setUserId(newProfile.id)
          loadOpportunities(newProfile.id)
        } else {
          const profile = await res.json()
          localStorage.setItem(DEMO_USER_ID_KEY, profile.id)
          setUserId(profile.id)
          loadOpportunities(profile.id)
        }
      } catch (err) {
        setError('Failed to initialize user profile')
        setLoading(false)
      }
    }
  }

  const loadOpportunities = async (uid: string) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/opportunities/personalized?user_id=${uid}&limit=20`)

      if (!res.ok) {
        if (res.status === 404) {
          // No preferences yet, redirect to settings
          setError('Please set up your preferences first')
          return
        }
        throw new Error('Failed to load opportunities')
      }

      const data = await res.json()
      setOpportunities(data.opportunities || [])
      setSnapshotId(data.snapshot_id)

      // Init feedback state from saved items
      const initialFeedback: FeedbackState = {}
      for (const opp of data.opportunities) {
        if (opp.is_saved) {
          initialFeedback[opp.id] = 'saved'
        }
      }
      setFeedbackState(initialFeedback)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleFeedback = async (opportunityId: string, type: 'saved' | 'dismissed') => {
    if (!userId || !snapshotId) return

    const currentState = feedbackState[opportunityId]
    const newState = currentState === type ? null : type

    // Optimistic update
    setFeedbackState(prev => ({
      ...prev,
      [opportunityId]: newState
    }))

    // If dismissing, remove from list
    if (newState === 'dismissed') {
      setOpportunities(prev => prev.filter(o => o.id !== opportunityId))
    }

    try {
      if (newState === null) {
        // Remove feedback
        await fetch(`/api/feedback?user_id=${userId}&opportunity_id=${opportunityId}`, {
          method: 'DELETE'
        })
      } else {
        // Add/update feedback
        await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            opportunity_id: opportunityId,
            snapshot_id: snapshotId,
            feedback_type: newState
          })
        })
      }
    } catch (err) {
      // Revert on error
      setFeedbackState(prev => ({
        ...prev,
        [opportunityId]: currentState
      }))
      console.error('Failed to save feedback:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500">Loading personalized opportunities...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Set Up Your Preferences</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link
              href="/settings"
              className="inline-block px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition"
            >
              Go to Settings →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">For You</h1>
              <p className="text-gray-600 mt-1">
                Opportunities ranked by your preferences
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/"
                className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
              >
                View All
              </Link>
              <Link
                href="/settings"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                Edit Preferences
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {opportunities.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No personalized opportunities available.</p>
            <p className="text-sm text-gray-500">
              Try adjusting your preferences or check back later for new opportunities.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {opportunities.map((opp, index) => (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                index={index}
                onFeedback={handleFeedback}
                feedbackState={feedbackState[opp.id] || null}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-8 text-center">
          <p className="text-sm text-gray-500 mb-4">
            Personalization only changes ranking. All qualified opportunities are still available on the main page.
          </p>
          <Link
            href="/"
            className="text-gray-700 hover:text-gray-900 font-medium"
          >
            View All Opportunities →
          </Link>
        </div>
      </div>
    </div>
  )
}
