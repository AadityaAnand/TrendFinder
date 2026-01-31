'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Tooltip } from '../components/Tooltip'
import { Badge } from '../components/Badge'
import { MetricPill, EvidenceDots } from '../components/MetricPill'

interface PersonalizedOpportunity {
  id: string
  trend_id: string
  opportunity_score: number
  suggested_actions: string[]
  demand_hits: number
  demand_examples: { title: string; url: string; source: string }[]
  signal_quality_score: number
  independent_artifact_count: number
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
  timing?: {
    label: string
    confidence: number
    original_label?: string
  }
  competition?: {
    level: string
    saturation_score: number
    confidence: number
    modifier: number
  }
  wedges?: { wedge_type: string; description: string }[]
  execution?: {
    verdict: string
    archetype: string
    risk_flags: string[]
    feasibility_score: number
  }
}

interface FeedbackState {
  [opportunityId: string]: 'saved' | 'dismissed' | null
}

const USER_ID_KEY = 'trend_generator_user_id'

const TIMING_CONFIG: Record<string, { text: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted'; description: string }> = {
  too_early: { text: 'Too Early', variant: 'info', description: 'Not enough data to act yet' },
  early_edge: { text: 'Early Edge', variant: 'success', description: 'Good window to enter before the crowd' },
  crowded: { text: 'Crowded', variant: 'warning', description: 'Many players already building here' },
  late_but_monetizable: { text: 'Late but Monetizable', variant: 'warning', description: 'Saturating, but revenue paths remain' },
  timing_uncertain: { text: 'Uncertain', variant: 'muted', description: 'Insufficient data for timing classification' }
}

const COMPETITION_CONFIG: Record<string, { text: string; variant: 'success' | 'warning' | 'danger' | 'muted' }> = {
  low: { text: 'Low Competition', variant: 'success' },
  moderate: { text: 'Moderate', variant: 'warning' },
  high: { text: 'High Competition', variant: 'danger' },
  uncertain: { text: 'Unknown', variant: 'muted' }
}

const VERDICT_CONFIG: Record<string, { text: string; variant: 'success' | 'warning' | 'danger'; description: string }> = {
  strong_fit: { text: 'Strong Fit', variant: 'success', description: 'Your profile aligns well with execution requirements' },
  conditional_fit: { text: 'Conditional', variant: 'warning', description: 'Feasible with caveats — check blocking factors' },
  high_risk: { text: 'High Risk', variant: 'danger', description: 'Significant execution risks identified' },
  execution_mismatch: { text: 'Mismatch', variant: 'danger', description: 'Your profile does not match execution requirements' }
}

function RelevanceBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-400 w-12">{label}</span>
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${value * 100}%` }} />
      </div>
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
  const trend = opportunity.detected_trends
  const timing = opportunity.timing ? TIMING_CONFIG[opportunity.timing.label] : null
  const competition = opportunity.competition ? COMPETITION_CONFIG[opportunity.competition.level] : null
  const verdict = opportunity.execution ? VERDICT_CONFIG[opportunity.execution.verdict] : null

  // Uncertainty factors
  const uncertaintyFactors: string[] = []
  if (opportunity.timing?.label === 'timing_uncertain') uncertaintyFactors.push('Timing data insufficient')
  if (opportunity.competition?.level === 'uncertain') uncertaintyFactors.push('Competition data unknown')
  if (opportunity.independent_artifact_count < 3) uncertaintyFactors.push('Few independent sources')
  if (opportunity.signal_quality_score < 0.5) uncertaintyFactors.push('Signal quality below average')

  return (
    <div className={`border rounded-xl bg-white transition ${
      feedbackState === 'saved'
        ? 'border-emerald-200 shadow-sm shadow-emerald-100'
        : 'border-slate-200 hover:shadow-sm'
    }`}>
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <span className="text-sm font-bold text-slate-500">{index + 1}</span>
          </div>

          <div className="grow min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/trends/${opportunity.trend_id}`}
                  className="text-lg font-semibold text-slate-900 hover:text-emerald-600 transition leading-tight"
                >
                  {trend?.theme || 'Unknown Trend'}
                </Link>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {uncertaintyFactors.length > 0 && (
                  <Tooltip content={
                    <div>
                      <p className="font-medium mb-1">Uncertainty factors</p>
                      <ul className="space-y-0.5">
                        {uncertaintyFactors.map((f, i) => <li key={i} className="text-slate-300">{f}</li>)}
                      </ul>
                    </div>
                  }>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-600 font-medium">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      {uncertaintyFactors.length}
                    </span>
                  </Tooltip>
                )}
                <div className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold tabular-nums">
                  {opportunity.personalized_score.toFixed(2)}
                </div>
                <button
                  onClick={() => onFeedback(opportunity.id, 'saved')}
                  className={`p-1.5 rounded-lg transition ${
                    feedbackState === 'saved'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                  }`}
                  title="Save"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
                <button
                  onClick={() => onFeedback(opportunity.id, 'dismissed')}
                  className={`p-1.5 rounded-lg transition ${
                    feedbackState === 'dismissed'
                      ? 'bg-slate-500 text-white'
                      : 'bg-slate-100 text-slate-400 hover:text-slate-600'
                  }`}
                  title="Not relevant"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Metrics row */}
            <div className="flex items-center gap-4 mt-2.5 flex-wrap">
              <MetricPill label="Relevance" value={
                <span className="text-emerald-600">{Math.round(opportunity.relevance_score * 100)}%</span>
              } />
              <MetricPill label="Demand" value={`${opportunity.demand_hits} signals`} />
              <EvidenceDots sourceCount={opportunity.independent_artifact_count} signalQuality={opportunity.signal_quality_score} />
            </div>

            {/* Intelligence badges */}
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {timing && (
                <Tooltip content={`${timing.description} (${Math.round((opportunity.timing?.confidence || 0) * 100)}% confidence)`}>
                  <Badge variant={timing.variant}>{timing.text}</Badge>
                </Tooltip>
              )}
              {competition && (
                <Badge variant={competition.variant}>{competition.text}</Badge>
              )}
              {verdict && (
                <Tooltip content={
                  <div>
                    <p>{verdict.description}</p>
                    {opportunity.execution?.risk_flags && opportunity.execution.risk_flags.length > 0 && (
                      <p className="text-amber-300 mt-1">Risks: {opportunity.execution.risk_flags.join(', ')}</p>
                    )}
                  </div>
                }>
                  <Badge variant={verdict.variant}>{verdict.text}</Badge>
                </Tooltip>
              )}
            </div>

            {/* Fit reasons */}
            {opportunity.fit_reasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {opportunity.fit_reasons.map((reason, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      reason.toLowerCase().includes('avoid')
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {reason}
                  </span>
                ))}
              </div>
            )}

            {/* Primary action */}
            {opportunity.suggested_actions.length > 0 && (
              <p className="text-sm text-slate-600 mt-3 font-medium">{opportunity.suggested_actions[0]}</p>
            )}

            {/* Wedges */}
            {opportunity.wedges && opportunity.wedges.length > 0 && (
              <div className="mt-3 text-sm bg-sky-50 border border-sky-200 rounded-lg p-3">
                <span className="font-medium text-sky-800 text-xs">Competitive wedge{opportunity.wedges.length > 1 ? 's' : ''}</span>
                <ul className="mt-1 space-y-1">
                  {opportunity.wedges.map((w, i) => (
                    <li key={i} className="text-sky-700 text-xs flex items-start gap-1">
                      <span className="mt-0.5 shrink-0">&#8594;</span>
                      <span>{w.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Progressive disclosure */}
            <details className="mt-3 group">
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 transition select-none flex items-center gap-1">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Relevance breakdown
              </summary>
              <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
                <RelevanceBar label="Role" value={opportunity.relevance_breakdown.role_match} />
                <RelevanceBar label="Domain" value={opportunity.relevance_breakdown.domain_match} />
                <RelevanceBar label="Stack" value={opportunity.relevance_breakdown.stack_match} />
                <RelevanceBar label="Effort" value={opportunity.relevance_breakdown.effort_fit} />
                <RelevanceBar label="Risk" value={opportunity.relevance_breakdown.risk_fit} />
              </div>
              {opportunity.relevance_breakdown.avoid_penalty > 0 && (
                <p className="text-xs text-amber-600 mt-1.5">
                  Contains topics you prefer to avoid (-{Math.round(opportunity.relevance_breakdown.avoid_penalty * 30)}%)
                </p>
              )}
            </details>
          </div>
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
    const uid = localStorage.getItem(USER_ID_KEY)
    if (!uid) {
      window.location.href = '/'
      return
    }
    setUserId(uid)
    loadOpportunities(uid)
  }, [])

  const loadOpportunities = async (uid: string) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/opportunities/personalized?user_id=${uid}&limit=20`)

      if (!res.ok) {
        if (res.status === 404) {
          setError('preferences_missing')
          return
        }
        throw new Error('Failed to load opportunities')
      }

      const data = await res.json()
      setOpportunities(data.opportunities || [])
      setSnapshotId(data.snapshot_id)

      const initialFeedback: FeedbackState = {}
      for (const opp of data.opportunities) {
        if (opp.is_saved) initialFeedback[opp.id] = 'saved'
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

    setFeedbackState(prev => ({ ...prev, [opportunityId]: newState }))

    if (newState === 'dismissed') {
      setOpportunities(prev => prev.filter(o => o.id !== opportunityId))
    }

    try {
      if (newState === null) {
        await fetch(`/api/feedback?user_id=${userId}&opportunity_id=${opportunityId}`, { method: 'DELETE' })
      } else {
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
    } catch {
      setFeedbackState(prev => ({ ...prev, [opportunityId]: currentState }))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (error === 'preferences_missing') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Set up your preferences</h1>
          <p className="text-sm text-slate-500 mb-6">
            Tell us what you care about so we can rank opportunities for you.
          </p>
          <Link
            href="/settings"
            className="inline-flex px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Go to Settings
          </Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={() => userId && loadOpportunities(userId)} className="text-sm text-slate-600 hover:text-slate-900">
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">For You</h1>
            <p className="text-sm text-slate-500 mt-1">Opportunities ranked by your preferences</p>
          </div>
          <Link
            href="/settings"
            className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition"
          >
            Edit preferences
          </Link>
        </div>

        {opportunities.length === 0 ? (
          <div className="border border-slate-200 rounded-xl p-10 text-center">
            <p className="text-sm text-slate-600 mb-2">No personalized opportunities available.</p>
            <p className="text-xs text-slate-400">Try adjusting your preferences or check back later.</p>
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

      {/* Footer */}
      <div className="border-t border-slate-100 bg-slate-50/50">
        <div className="max-w-5xl mx-auto px-6 py-8 text-center">
          <p className="text-xs text-slate-400 mb-3">
            Personalization only changes ranking. All qualified opportunities are visible on the Explore page.
          </p>
          <Link href="/explore" className="text-sm text-slate-600 hover:text-slate-900 font-medium transition">
            View all trends
          </Link>
        </div>
      </div>
    </div>
  )
}
