'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { CreatorOpportunityCard } from '@/app/components/CreatorOpportunityCard'

interface HypothesisData {
  title: string
  summary: string
  status: string
  confidence: number
  pain_signals: string[] | string
  who_it_affects: string[] | string
  demand_evidence: { title: string; source: string; url: string }[] | string
  hypothesis_type?: string
  platform_focus?: string[]
  monetization_angle?: string | null
  pain_points?: { pain: string; evidence: string }[]
}

interface Opportunity {
  id: string
  trend_id: string
  display_name: string
  action_title: string
  why_now: string | null
  why_this_trend: string | null
  whats_the_risk: string | null
  suggested_actions: string | string[]
  qualified: boolean
  personalized_score: number
  global_score: number
  fit_reasons: string[]
  detected_trends: { id: string; theme: string }
  timing?: { label: string; confidence: number }
  competition?: { level: string }
  hypothesis?: HypothesisData
  rejection_reasons?: string[]
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
}

function parseJsonField<T>(field: T | string | null | undefined, fallback: T): T {
  if (!field) return fallback
  if (typeof field === 'string') {
    try { return JSON.parse(field) as T } catch { return fallback }
  }
  return field
}

function ForYouContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { profileId, hasPrefs, ready, isLoggedIn } = useAuth()
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [watching, setWatching] = useState<WatchingTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [hasQualified, setHasQualified] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [snapshotId, setSnapshotId] = useState<string | null>(null)
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'saved' | 'dismissed'>>({})
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [audienceFilter, setAudienceFilter] = useState<'all' | 'developer' | 'creator'>('all')
  const [whyShownId, setWhyShownId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!isLoggedIn) { router.replace('/sign-in'); return }
    if (!hasPrefs) { router.replace('/settings'); return }
    if (profileId) loadData(profileId)
  }, [ready, isLoggedIn, hasPrefs, profileId, router])

  const loadData = async (pid: string) => {
    try {
      setLoading(true)
      const [oppRes, watchRes] = await Promise.all([
        fetch(`/api/opportunities/personalized?user_id=${pid}&limit=20`),
        fetch('/api/trends/watching'),
      ])

      let opps: Opportunity[] = []
      if (oppRes.ok) {
        const data = await oppRes.json()
        opps = data.opportunities || []
        if (data.snapshot_id) setSnapshotId(data.snapshot_id)
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
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }

  const handleFeedback = async (oppId: string, type: 'saved' | 'dismissed') => {
    setFeedbackMap(m => ({ ...m, [oppId]: type }))
    if (type === 'dismissed') setDismissedIds(s => new Set(s).add(oppId))
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profileId,
          opportunity_id: oppId,
          snapshot_id: snapshotId,
          feedback_type: type
        })
      })
    } catch { /* silent — optimistic UI already applied */ }
  }

  void searchParams

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  const noDataAtAll = opportunities.length === 0 && watching.length === 0

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-12">

        <header className="mb-10">
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Recommended Opportunities</h1>
          <p className="text-sm text-slate-500 mt-1">Ranked for you based on your goals and constraints</p>
        </header>

        {noDataAtAll && (
          <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <p className="text-base font-medium text-slate-900 mb-2">Rishi is still collecting signals</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              Signals are being collected and analyzed. Opportunities will appear here
              once evidence is strong enough to qualify.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/explore" className="rishi-btn-primary">
                Browse signals
              </Link>
              <Link href="/method" className="rishi-btn-secondary">
                How it works
              </Link>
            </div>
          </section>
        )}

        {!noDataAtAll && opportunities.length === 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-8 text-center mb-10">
            <p className="text-base font-medium text-slate-900 mb-2">No qualified opportunities yet</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-2">
              No hypotheses have passed all evidence gates for your preferences.
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              This is intentional — false positives are worse than waiting.
            </p>
          </section>
        )}

        {opportunities.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {hasQualified ? 'Ready to Build' : 'Emerging Signals'}
              </h2>
              {/* Audience filter tabs */}
              <div className="flex items-center gap-1">
                {(['all', 'developer', 'creator'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setAudienceFilter(f)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      audienceFilter === f
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'developer' ? 'Dev' : 'Creator'}
                  </button>
                ))}
              </div>
            </div>
            {!hasQualified && (
              <p className="text-xs text-amber-600 mb-4">
                No fully qualified hypotheses yet. Showing top emerging signals still gathering evidence.
              </p>
            )}

            <div className="space-y-4">
              {opportunities.map((opp) => {
                if (dismissedIds.has(opp.id)) return null
                const h = opp.hypothesis
                const isCreator = h?.hypothesis_type === 'creator'

                // Audience filter
                if (audienceFilter === 'developer' && isCreator) return null
                if (audienceFilter === 'creator' && !isCreator) return null

                // Creator card branch
                if (isCreator) {
                  return (
                    <CreatorOpportunityCard
                      key={opp.id}
                      id={opp.id}
                      trend_id={opp.trend_id}
                      display_name={opp.display_name}
                      qualified={opp.qualified}
                      hypothesis={h ? {
                        title: h.title,
                        summary: h.summary,
                        status: h.status,
                        platform_focus: h.platform_focus || [],
                        monetization_angle: h.monetization_angle || null,
                        pain_points: h.pain_points || [],
                      } : null}
                      engagement_velocity={(opp as Record<string, unknown>).engagement_velocity as number | undefined}
                      feedbackState={feedbackMap[opp.id] || null}
                      isExpanded={expandedId === opp.id}
                      onToggleExpand={() => setExpandedId(expandedId === opp.id ? null : opp.id)}
                      onSave={() => handleFeedback(opp.id, 'saved')}
                      onDismiss={() => handleFeedback(opp.id, 'dismissed')}
                    />
                  )
                }

                const painSignals = h ? parseJsonField<string[]>(h.pain_signals, []) : []
                const whoAffects = h ? parseJsonField<string[]>(h.who_it_affects, []) : []
                const demandEvidence = h ? parseJsonField<{ title: string; source: string; url: string }[]>(h.demand_evidence, []) : []
                const actions = parseJsonField<string[]>(opp.suggested_actions, [])
                const isExpanded = expandedId === opp.id
                const title = h?.title && h.title.length > 10 ? h.title : opp.display_name
                const summary = h?.summary || opp.why_now || null
                const isPending = !h || h.status === 'uncertain' || h.status === 'topic_only'

                return (
                  <article key={opp.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <Link
                        href={`/trends/${opp.trend_id}`}
                        className="text-base font-semibold text-slate-900 hover:text-indigo-600 transition-colors leading-snug"
                      >
                        {title}
                      </Link>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {opp.qualified && (
                          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            Ready to build
                          </span>
                        )}
                        {!opp.qualified && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Forming</span>
                        )}
                      </div>
                    </div>

                    {summary && (
                      <p className="text-sm text-slate-600 leading-relaxed mb-3">{summary}</p>
                    )}

                    {whoAffects.length > 0 && (
                      <p className="text-xs text-slate-400 mb-3">
                        Affects: {whoAffects.join(', ')}
                      </p>
                    )}

                    {painSignals.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Pain signals</p>
                        <ul className="space-y-1">
                          {painSignals.slice(0, 4).map((p, i) => (
                            <li key={i} className="text-sm text-slate-600 flex gap-2">
                              <span className="text-indigo-400 shrink-0">&bull;</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {painSignals.length === 0 && actions.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">What to build</p>
                        <ul className="space-y-1">
                          {actions.slice(0, 3).map((a, i) => (
                            <li key={i} className="text-sm text-slate-600 flex gap-2">
                              <span className="text-indigo-400 shrink-0">&bull;</span>
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : opp.id)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors mb-1"
                    >
                      {isExpanded ? 'Less' : 'Details'}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-4">
                        {demandEvidence.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Evidence</p>
                            <ul className="space-y-1">
                              {demandEvidence.slice(0, 5).map((d, i) => (
                                <li key={i} className="text-xs text-slate-600">
                                  <span className="text-slate-400">[{d.source}]</span>{' '}
                                  {d.url ? (
                                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-colors">
                                      {d.title}
                                    </a>
                                  ) : d.title}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {opp.whats_the_risk && (
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Uncertainty</p>
                            <p className="text-xs text-slate-600">{opp.whats_the_risk}</p>
                          </div>
                        )}

                        {isPending && !opp.whats_the_risk && (
                          <p className="text-xs text-amber-600">
                            Hypothesis is {h?.status || 'pending'}. Evidence not yet strong enough for a confident assessment.
                          </p>
                        )}

                        {opp.competition && (
                          <div className="text-xs text-slate-500">
                            Competition: {opp.competition.level}
                          </div>
                        )}

                        {(opp.fit_reasons || []).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Why you see this</p>
                            <ul className="space-y-0.5">
                              {opp.fit_reasons.filter(r => !r.includes('avoid')).map((r, i) => (
                                <li key={i} className="text-xs text-slate-600">&bull; {r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/trends/${opp.trend_id}`}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                        >
                          Open Brief &rarr;
                        </Link>
                        <Link
                          href={`/trends/${opp.trend_id}`}
                          title="Ask Rishi about this"
                          className="text-xs text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                          Ask
                        </Link>
                        {/* Why shown popover */}
                        <div className="relative">
                          <button
                            onClick={() => setWhyShownId(whyShownId === opp.id ? null : opp.id)}
                            title="Why is this here?"
                            className="text-slate-300 hover:text-slate-500 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="10" strokeWidth={2} />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4M12 8h.01" />
                            </svg>
                          </button>
                          {whyShownId === opp.id && (
                            <div className="absolute bottom-6 left-0 z-20 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Why you see this</p>
                              {(opp.fit_reasons || []).filter(r => !r.includes('avoid')).length > 0 ? (
                                <ul className="space-y-1">
                                  {opp.fit_reasons.filter(r => !r.includes('avoid')).map((r, i) => (
                                    <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                                      <span className="text-indigo-400 shrink-0">•</span>{r}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-slate-500">Based on your profile preferences.</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleFeedback(opp.id, 'saved')}
                          title="Save"
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            feedbackMap[opp.id] === 'saved'
                              ? 'text-emerald-700 bg-emerald-50'
                              : 'text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          {feedbackMap[opp.id] === 'saved' ? 'Saved' : 'Save'}
                        </button>
                        <button
                          onClick={() => handleFeedback(opp.id, 'dismissed')}
                          title="Not for me"
                          className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {watching.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Watching</h2>
            <p className="text-xs text-slate-400 mb-4">
              Signals that haven&apos;t formed valid hypotheses yet
            </p>

            <div className="space-y-1">
              {watching.slice(0, 8).map((t) => {
                const name = (!t.display_name || t.display_name.startsWith('Untitled'))
                  ? 'Emerging signal'
                  : t.display_name

                return (
                  <Link
                    key={t.trend_id}
                    href={`/trends/${t.trend_id}`}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 transition group"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-slate-800 group-hover:text-indigo-600 transition-colors">{name}</span>
                      <span className="text-xs text-slate-400 ml-2">{t.signal_count} signal{t.signal_count !== 1 ? 's' : ''}</span>
                    </div>
                    {t.reasons.length > 0 && (
                      <span className="text-xs text-slate-400 shrink-0">{t.reasons[0]}</span>
                    )}
                  </Link>
                )
              })}
            </div>

            {watching.length > 8 && (
              <Link href="/explore" className="block text-center text-xs text-indigo-600 font-medium mt-3">
                See all {watching.length} in Explore
              </Link>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default function ForYouPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    }>
      <ForYouContent />
    </Suspense>
  )
}
