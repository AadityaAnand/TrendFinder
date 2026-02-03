'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Badge } from '../components/Badge'
import { ConfidenceBadge } from '../components/ConfidenceBadge'

const TIMING_CONFIG: Record<string, { text: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted'; description: string }> = {
  too_early: { text: 'Too Early', variant: 'info', description: 'Not enough data to act yet' },
  early_edge: { text: 'Early Edge', variant: 'success', description: 'Good window to enter before the crowd' },
  crowded: { text: 'Crowded', variant: 'warning', description: 'Many players already building here' },
  late_but_monetizable: { text: 'Late but Monetizable', variant: 'warning', description: 'Saturating, but revenue paths remain' },
  timing_uncertain: { text: 'Uncertain', variant: 'muted', description: 'Insufficient data for timing' },
}

const COMPETITION_CONFIG: Record<string, { text: string; variant: 'success' | 'warning' | 'danger' | 'muted' }> = {
  low: { text: 'Low competition', variant: 'success' },
  moderate: { text: 'Moderate competition', variant: 'warning' },
  high: { text: 'High competition', variant: 'danger' },
  uncertain: { text: 'Competition unknown', variant: 'muted' },
}

const STAGE_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  emerging: { label: 'Emerging', variant: 'info' },
  rising: { label: 'Rising', variant: 'success' },
  peaking: { label: 'Peaking', variant: 'warning' },
  stable: { label: 'Stable', variant: 'muted' },
  declining: { label: 'Declining', variant: 'danger' },
  fading: { label: 'Fading', variant: 'muted' },
}

interface Opportunity {
  id: string
  trend_id: string
  action_title: string
  action_type: string
  why_now: string
  suggested_actions: string | string[]
  qualified: boolean
  personalized_score: number
  global_score: number
  fit_reasons: string[]
  detected_trends: {
    id: string
    theme: string
    description: string | null
  }
  timing?: {
    label: string
    confidence: number
    reasons: string[]
  }
  competition?: {
    level: string
    saturation_score: number
    confidence: number
  }
  execution?: {
    verdict: string
    reasons: string[]
    risk_flags: string[]
  }
  confidence_predictions?: Record<string, { confidence: number }>
}

interface WatchingTrend {
  trend_id: string
  theme: string
  description: string | null
  stage: string | null
  stage_confidence: number
  comparable: boolean
  signal_count: number
  reasons: string[]
}

export default function ForYouPage() {
  const router = useRouter()
  const { profileId, hasPrefs, ready, isLoggedIn } = useAuth()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [watching, setWatching] = useState<WatchingTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [hasQualified, setHasQualified] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (!isLoggedIn) {
      router.replace('/')
      return
    }
    if (!hasPrefs) {
      router.replace('/settings')
      return
    }
    if (profileId) {
      loadData(profileId)
    }
  }, [ready, isLoggedIn, hasPrefs, profileId, router])

  const loadData = async (pid: string) => {
    try {
      setLoading(true)

      // First try qualified opportunities
      const [oppRes, watchRes] = await Promise.all([
        fetch(`/api/opportunities/personalized?user_id=${pid}&limit=20`),
        fetch('/api/trends/watching'),
      ])

      let opps: Opportunity[] = []
      if (oppRes.ok) {
        const data = await oppRes.json()
        opps = data.opportunities || []
      }

      if (opps.length > 0) {
        setHasQualified(true)
        setOpportunities(opps)
      } else {
        // Fallback: fetch all opportunities including unqualified
        setHasQualified(false)
        const fallbackRes = await fetch(`/api/opportunities/personalized?user_id=${pid}&limit=10&include_unqualified=true`)
        if (fallbackRes.ok) {
          const data = await fallbackRes.json()
          setOpportunities(data.opportunities || [])
        }
      }

      if (watchRes.ok) {
        const data = await watchRes.json()
        setWatching(data.watching || [])
      }
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    )
  }

  const getConfidenceScore = (opp: Opportunity): number | null => {
    if (!opp.confidence_predictions) return null
    const values = Object.values(opp.confidence_predictions)
    if (values.length === 0) return null
    return values[0].confidence
  }

  const parseActions = (actions: string | string[]): string[] => {
    if (Array.isArray(actions)) return actions
    if (typeof actions === 'string') {
      try {
        const parsed = JSON.parse(actions)
        if (Array.isArray(parsed)) return parsed
      } catch {
        return actions.split('\n').filter(Boolean)
      }
    }
    return []
  }

  const noDataAtAll = opportunities.length === 0 && watching.length === 0

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">For You</h1>
          <p className="text-sm text-slate-500 mt-1">Opportunities matched to your profile</p>
        </div>

        {noDataAtAll ? (
          <div className="border border-slate-200 rounded-xl p-10 text-center mb-12">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">No data yet</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-2">
              The pipeline hasn&apos;t run yet or hasn&apos;t collected enough signals to generate opportunities.
              Trends appear after the daily pipeline scrapes HN, GitHub, Dev.to, and Reddit.
            </p>
            <p className="text-sm text-slate-400 mb-6">
              Check back after the next pipeline run.
            </p>
            <Link
              href="/explore"
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Browse all trends
            </Link>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="border border-slate-200 rounded-xl p-10 text-center mb-12">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">No qualified opportunities right now</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-2">
              No trends have passed all 6 evidence gates yet, or the ones
              that have don&apos;t match your preferences.
            </p>
            <p className="text-sm text-slate-400 mb-6">
              The pipeline runs daily and collects more evidence over time. Check back tomorrow.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/explore"
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Browse all trends
              </Link>
              <Link
                href="/settings"
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Update preferences
              </Link>
            </div>
          </div>
        ) : (
          <>
            {!hasQualified && (
              <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                No fully qualified opportunities yet. Showing the top emerging opportunities that are still collecting evidence.
              </div>
            )}
            <div className="space-y-5 mb-12">
              {opportunities.map((opp) => {
                const actions = parseActions(opp.suggested_actions)
                const timingConfig = opp.timing ? TIMING_CONFIG[opp.timing.label] : null
                const compConfig = opp.competition ? COMPETITION_CONFIG[opp.competition.level] : null
                const confidence = getConfidenceScore(opp)

                return (
                  <div key={opp.id} className="border border-slate-200 rounded-xl p-6 hover:border-slate-300 transition">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <Link
                          href={`/trends/${opp.trend_id}`}
                          className="text-lg font-semibold text-slate-900 hover:text-emerald-600 transition"
                        >
                          {opp.action_title}
                        </Link>
                        {opp.detected_trends?.theme && (
                          <p className="text-xs text-slate-400 mt-0.5">{opp.detected_trends.theme}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!opp.qualified && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Collecting evidence</span>
                        )}
                        {opp.qualified && opp.personalized_score > 0 && (
                          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                            {Math.round(opp.personalized_score * 100)}% match
                          </span>
                        )}
                        {confidence !== null && <ConfidenceBadge score={confidence} />}
                      </div>
                    </div>

                    {actions.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">What to build</p>
                        <ul className="space-y-1">
                          {actions.slice(0, 3).map((action, i) => (
                            <li key={i} className="text-sm text-slate-700 flex gap-2">
                              <span className="text-slate-300 shrink-0">-</span>
                              <span>{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {opp.why_now && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Why now</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{opp.why_now}</p>
                      </div>
                    )}

                    {opp.execution?.risk_flags && opp.execution.risk_flags.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Risks</p>
                        <ul className="space-y-0.5">
                          {opp.execution.risk_flags.slice(0, 3).map((risk, i) => (
                            <li key={i} className="text-sm text-slate-500">{risk}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap mt-4">
                      {timingConfig && (
                        <Badge variant={timingConfig.variant}>{timingConfig.text}</Badge>
                      )}
                      {compConfig && (
                        <Badge variant={compConfig.variant}>{compConfig.text}</Badge>
                      )}
                      {opp.fit_reasons.filter(r => !r.includes('avoid')).map((reason, i) => (
                        <span key={i} className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {watching.length > 0 && (
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-slate-900">Watching</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Interesting trends that aren&apos;t eligible yet
              </p>
            </div>

            <div className="space-y-3">
              {watching.map((trend) => {
                const stageConfig = trend.stage ? STAGE_CONFIG[trend.stage] : null
                const showStage = stageConfig && trend.comparable && trend.stage_confidence >= 0.5

                return (
                  <div key={trend.trend_id} className="border border-slate-100 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/trends/${trend.trend_id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-emerald-600 transition"
                        >
                          {trend.theme}
                        </Link>
                        {trend.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{trend.description}</p>
                        )}
                      </div>
                      {showStage && (
                        <Badge variant={stageConfig.variant}>{stageConfig.label}</Badge>
                      )}
                    </div>
                    <div className="mt-2">
                      {trend.reasons.map((reason, i) => (
                        <p key={i} className="text-xs text-slate-400">{reason}</p>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
