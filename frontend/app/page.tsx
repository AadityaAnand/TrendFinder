'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const USER_ID_KEY = 'trend_generator_user_id'
const HAS_PREFS_KEY = 'trend_generator_has_prefs'

const PIPELINE_STEPS = [
  {
    number: '01',
    title: 'Collect signals',
    description: 'We scrape Hacker News, GitHub Trending, Dev.to, and Reddit every day for raw signals — new repos, hot discussions, rising posts.',
  },
  {
    number: '02',
    title: 'Cluster into trends',
    description: 'Embedding-based clustering groups signals into coherent trends. Only trends with 2+ independent sources survive.',
  },
  {
    number: '03',
    title: 'Qualify opportunities',
    description: 'Each trend must pass demand signals, clear actions, independent evidence, and lifecycle gates before it reaches you.',
  },
  {
    number: '04',
    title: 'Rank for you',
    description: 'Your preferences (role, stack, risk tolerance) reorder qualified opportunities. Personalization changes ranking, not wording.',
  },
]

const TRUST_POINTS = [
  {
    title: 'Evidence-gated',
    description: 'Every opportunity requires 2+ independent artifacts and real demand signals. No vibes, no hype.',
  },
  {
    title: 'Uncertainty shown',
    description: 'Low-confidence data is flagged, not hidden. You always see what the system doesn\'t know.',
  },
  {
    title: 'Deterministic scoring',
    description: 'Scores come from weighted formulas, not black-box models. Every number is auditable.',
  },
  {
    title: 'No filter bubble',
    description: 'Personalization reorders — it never hides qualified opportunities. Global view always available.',
  },
]

export default function LandingPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const uid = localStorage.getItem(USER_ID_KEY)
    if (uid) {
      const hasPrefs = localStorage.getItem(HAS_PREFS_KEY) === 'true'
      if (hasPrefs) {
        router.replace('/for-you')
      } else {
        router.replace('/settings')
      }
    } else {
      setReady(true)
    }
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-16">
        <h1 className="text-5xl font-bold text-slate-900 tracking-tight leading-tight max-w-2xl">
          What should you build this week?
        </h1>
        <p className="text-lg text-slate-500 mt-5 max-w-xl leading-relaxed">
          Opportunity intelligence from Hacker News, GitHub, Dev.to, and Reddit.
          Only showing opportunities with real demand signals and clear actions.
        </p>
        <div className="flex gap-3 mt-8">
          <Link
            href="/get-started"
            className="px-6 py-3 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Get started free
          </Link>
          <Link
            href="/explore"
            className="px-6 py-3 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition"
          >
            Browse trends
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div id="how-it-works" className="border-t border-slate-100 bg-slate-50/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">How it works</h2>
          <p className="text-sm text-slate-500 mb-10">Four-stage pipeline. Every step has an evidence gate.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PIPELINE_STEPS.map((step) => (
              <div key={step.number} className="relative">
                <span className="text-xs font-bold text-slate-300 tracking-widest">{step.number}</span>
                <h3 className="text-sm font-semibold text-slate-900 mt-2 mb-1.5">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why trust it */}
      <div id="trust" className="border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Why trust it</h2>
          <p className="text-sm text-slate-500 mb-10">Built on guardrails, not hype. Every recommendation is auditable.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TRUST_POINTS.map((point) => (
              <div key={point.title} className="p-5 rounded-xl border border-slate-200 bg-white">
                <h3 className="text-sm font-semibold text-slate-900 mb-1.5">{point.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{point.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="border-t border-slate-100 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 py-14 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Stop guessing. Start building.</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Set your preferences in 30 seconds. Get personalized, evidence-backed opportunities.
          </p>
          <Link
            href="/get-started"
            className="inline-flex px-6 py-3 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Get started free
          </Link>
        </div>
      </div>
    </div>
  )
}
