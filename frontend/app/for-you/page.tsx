'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Badge } from '../components/Badge'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { SourceBadge } from '../components/SourceBadge'

const TIMING_CONFIG: Record<string, { text: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  too_early: { text: 'Too Early', variant: 'info' },
  early_edge: { text: 'Early Edge', variant: 'success' },
  crowded: { text: 'Crowded', variant: 'warning' },
  late_but_monetizable: { text: 'Late but Monetizable', variant: 'warning' },
  timing_uncertain: { text: 'Uncertain', variant: 'muted' },
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

interface BuildIdea {
  idea: string
  effort: string
  audience: string
}

interface ExistingSolution {
  name: string
  gap: string
}

interface Intelligence {
  summary: string
  build_ideas: BuildIdea[]
  existing_solutions: ExistingSolution[]
  risks: string[]
}

interface Opportunity {
  id: string
  trend_id: string
  display_name: string
  action_title: string
  action_type: string
  why_now: string | null
  why_this_trend: string | null
  suggested_actions: string | string[]
  qualified: boolean
  personalized_score: number
  global_score: number
  fit_reasons: string[]
  detected_trends: {
    id: string
    theme: string
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
  display_name: string
  theme: string
  stage: string | null
  stage_confidence: number
  comparable: boolean
  signal_count: number
  momentum_score?: number
  reasons: string[]
  top_signals?: { title: string; source: string; url: string | null }[]
}

function ForYouContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { profileId, hasPrefs, ready, isLoggedIn } = useAuth()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [watching, setWatching] = useState<WatchingTrend[]>([])
  const [intelligence, setIntelligence] = useState<Record<string, Intelligence>>({})
  const [loading, setLoading] = useState(true)
  const [hasQualified, setHasQualified] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [showWhyMap, setShowWhyMap] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!ready) return
    if (!isLoggedIn) {
      router.replace('/sign-in')
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
      setLoadError(null)

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

      // Fetch intelligence for each opportunity's trend
      const trendIds = [...new Set(opps.map(o => o.trend_id))]
      const intelMap: Record<string, Intelligence> = {}
      await Promise.all(
        trendIds.map(async (tid) => {
          try {
            const res = await fetch(`/api/trends/${tid}/intelligence`)
            if (res.ok) {
              const data = await res.json()
              if (data.intelligence) {
                intelMap[tid] = data.intelligence
              }
            }
          } catch { /* intelligence fetch is best-effort */ }
        })
      )
      setIntelligence(intelMap)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load data')
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

  const getTitle = (opp: Opportunity): string => {
    return opp.display_name || opp.action_title || opp.detected_trends?.theme || 'Untitled'
  }

  const toggleExpanded = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleWhy = (id: string) => {
    setShowWhyMap(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const noDataAtAll = opportunities.length === 0 && watching.length === 0
  const debug = searchParams.get('debug') === '1'
  void debug

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">For You</h1>
          <p className="text-sm text-slate-500 mt-1">Opportunities matched to your profile</p>
        </div>

        {loadError && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {loadError}
          </div>
        )}

        {noDataAtAll ? (
          <div className="border border-slate-200 rounded-xl p-10 text-center mb-12">
            <h2 className="text-base font-semibold text-slate-900 mb-2">No data yet</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              The pipeline hasn&apos;t collected enough signals to generate opportunities yet. Check back after the next pipeline run.
            </p>
            <Link
              href="/explore"
              className="inline-flex px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition"
            >
              Browse all trends
            </Link>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="border border-slate-200 rounded-xl p-8 text-center mb-8">
            <h2 className="text-base font-semibold text-slate-900 mb-2">No qualified opportunities right now</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
              No trends have passed all evidence gates yet, or the ones that have don&apos;t match your preferences.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/explore"
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition"
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
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                {hasQualified ? 'Top opportunities for you' : 'Emerging opportunities'}
              </h2>
              {!hasQualified && (
                <p className="text-xs text-amber-600 mt-1">
                  No fully qualified opportunities yet. Showing top emerging ones still collecting evidence.
                </p>
              )}
            </div>
            <div className="space-y-4 mb-10">
              {opportunities.map((opp) => {
                const actions = parseActions(opp.suggested_actions)
                const timingConfig = opp.timing ? TIMING_CONFIG[opp.timing.label] : null
                const compConfig = opp.competition ? COMPETITION_CONFIG[opp.competition.level] : null
                const confidence = getConfidenceScore(opp)
                const title = getTitle(opp)
                const intel = intelligence[opp.trend_id]
                const isExpanded = expandedCards.has(opp.id)
                const showWhy = showWhyMap.has(opp.id)

                return (
                  <div key={opp.id} className="border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <Link
                          href={`/trends/${opp.trend_id}`}
                          className="text-base font-semibold text-slate-900 hover:text-emerald-600 transition"
                        >
                          {title}
                        </Link>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!opp.qualified && (
                          <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Collecting evidence</span>
                        )}
                        {opp.qualified && opp.personalized_score > 0 && (
                          <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {Math.round(opp.personalized_score * 100)}% match
                          </span>
                        )}
                        {confidence !== null && <ConfidenceBadge score={confidence} />}
                      </div>
                    </div>

                    {intel?.summary ? (
                      <p className="text-sm text-slate-600 leading-relaxed mb-3">{intel.summary}</p>
                    ) : opp.why_now ? (
                      <p className="text-sm text-slate-600 leading-relaxed mb-3">{opp.why_now}</p>
                    ) : null}

                    {intel?.build_ideas && intel.build_ideas.length > 0 ? (
                      <div className="mb-3">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">What to build</p>
                        <ul className="space-y-1">
                          {intel.build_ideas.slice(0, 3).map((idea, i) => (
                            <li key={i} className="text-sm text-slate-700 flex gap-2">
                              <span className="text-slate-300 shrink-0">-</span>
                              <span>
                                {idea.idea}
                                {idea.effort && (
                                  <span className="ml-1.5 text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                                    {idea.effort}
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : actions.length > 0 ? (
                      <div className="mb-3">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">What to build</p>
                        <ul className="space-y-0.5">
                          {actions.slice(0, 3).map((action, i) => (
                            <li key={i} className="text-sm text-slate-700 flex gap-2">
                              <span className="text-slate-300 shrink-0">-</span>
                              <span>{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {intel && (intel.existing_solutions?.length > 0 || intel.risks?.length > 0 || (opp.execution?.risk_flags?.length ?? 0) > 0) && (
                      <button
                        onClick={() => toggleExpanded(opp.id)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 transition mb-2"
                      >
                        {isExpanded ? 'Show less' : 'Show competitors & risks'}
                      </button>
                    )}

                    {isExpanded && (
                      <div className="space-y-3 mb-3">
                        {intel?.existing_solutions && intel.existing_solutions.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Existing solutions</p>
                            <ul className="space-y-1">
                              {intel.existing_solutions.map((sol, i) => (
                                <li key={i} className="text-xs text-slate-600">
                                  <span className="font-medium text-slate-700">{sol.name}</span>
                                  {sol.gap && <span className="text-slate-400"> — {sol.gap}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {(intel?.risks?.length ?? 0) > 0 || (opp.execution?.risk_flags?.length ?? 0) > 0 ? (
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Risks</p>
                            <ul className="space-y-0.5">
                              {(intel?.risks || []).map((risk, i) => (
                                <li key={`r-${i}`} className="text-xs text-slate-500">{risk}</li>
                              ))}
                              {(opp.execution?.risk_flags || []).slice(0, 2).map((risk, i) => (
                                <li key={`e-${i}`} className="text-xs text-slate-500">{risk}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap mt-3">
                      {timingConfig && (
                        <Badge variant={timingConfig.variant}>{timingConfig.text}</Badge>
                      )}
                      {compConfig && (
                        <Badge variant={compConfig.variant}>{compConfig.text}</Badge>
                      )}
                      {(opp.fit_reasons || []).filter(r => !r.includes('avoid')).slice(0, 3).map((reason, i) => (
                        <span key={i} className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                          {reason}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                      <Link
                        href={`/trends/${opp.trend_id}`}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition"
                      >
                        View trend
                      </Link>
                      <button
                        onClick={() => toggleWhy(opp.id)}
                        className="text-xs text-slate-400 hover:text-slate-600 transition"
                      >
                        {showWhy ? 'Hide' : 'Why am I seeing this?'}
                      </button>
                    </div>

                    {showWhy && (
                      <div className="mt-3 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 space-y-1">
                        <p className="font-medium text-slate-600 mb-1">Why this opportunity matches you:</p>
                        {(opp.fit_reasons || []).map((reason, i) => (
                          <p key={i}>- {reason}</p>
                        ))}
                        {opp.qualified && (
                          <p>- Passed all evidence gates (2+ sources, demand signals, buildable action)</p>
                        )}
                        {opp.personalized_score > 0 && (
                          <p>- Personalized score: {Math.round(opp.personalized_score * 100)}% (60% quality + 40% relevance to your profile)</p>
                        )}
                        {opp.why_this_trend && (
                          <p className="mt-1 text-slate-400 italic">{opp.why_this_trend}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {watching.length > 0 && (
          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Watching</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Interesting trends that aren&apos;t eligible yet
              </p>
            </div>

            <div className="space-y-2">
              {watching.map((trend) => {
                const stageConfig = trend.stage ? STAGE_CONFIG[trend.stage] : null
                const showStage = stageConfig && trend.comparable && trend.stage_confidence >= 0.5
                const name = trend.display_name || trend.theme

                return (
                  <Link
                    key={trend.trend_id}
                    href={`/trends/${trend.trend_id}`}
                    className="block border border-slate-100 rounded-lg p-3.5 hover:border-slate-200 hover:bg-slate-50/50 transition group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 group-hover:text-emerald-600 transition">
                          {name}
                        </h3>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                          <span>{trend.signal_count} signal{trend.signal_count !== 1 ? 's' : ''}</span>
                          {trend.momentum_score && trend.momentum_score > 0 && (
                            <span>Momentum {(trend.momentum_score * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {showStage && (
                          <Badge variant={stageConfig.variant}>{stageConfig.label}</Badge>
                        )}
                      </div>
                    </div>
                    {trend.reasons.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        {trend.reasons.map((reason, i) => (
                          <span key={i} className="text-[11px] text-slate-400">{reason}</span>
                        ))}
                      </div>
                    )}
                    {trend.top_signals && trend.top_signals.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {trend.top_signals.slice(0, 3).map((sig, i) => (
                          <div key={i} className="flex items-center gap-1 min-w-0">
                            <SourceBadge source={sig.source} />
                            <span className="text-[11px] text-slate-500 truncate max-w-[180px]">{sig.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ForYouPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    }>
      <ForYouContent />
    </Suspense>
  )
}
