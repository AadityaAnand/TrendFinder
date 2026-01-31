'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

export default function LandingPage() {
  const router = useRouter()
  const { isLoggedIn, hasPrefs, ready } = useAuth()
  const [showPage, setShowPage] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (isLoggedIn) {
      router.replace(hasPrefs ? '/explore' : '/settings')
    } else {
      setShowPage(true)
    }
  }, [ready, isLoggedIn, hasPrefs, router])

  if (!showPage) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ── */}
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-16">
        <h1 className="text-5xl font-bold text-slate-900 tracking-tight leading-tight max-w-3xl">
          Stop scrolling Hacker News.<br />Start building what people want.
        </h1>
        <p className="text-lg text-slate-500 mt-6 max-w-2xl leading-relaxed">
          TrendSignal is an opportunity intelligence platform. Every day, we scrape
          thousands of signals from Hacker News, GitHub Trending, Dev.to, and Reddit —
          then run them through a multi-stage evidence pipeline to surface only
          the trends backed by real demand, independent sources, and clear actions.
        </p>
        <p className="text-base text-slate-400 mt-3 max-w-2xl">
          No vibes. No hype. Every recommendation is auditable, every score is deterministic,
          and every uncertainty is shown — not hidden.
        </p>
        <div className="flex gap-3 mt-8">
          <Link
            href="/sign-up"
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

      {/* ── What is TrendSignal ── */}
      <div className="border-t border-slate-100 bg-slate-50/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">What is TrendSignal?</h2>
          <p className="text-sm text-slate-500 max-w-3xl leading-relaxed mb-8">
            Most trend tools give you dashboards of noisy data. TrendSignal is different — it is an
            evidence-gated pipeline that turns raw developer community signals into qualified,
            actionable opportunities. Think of it as a research analyst that reads every
            HN thread, every trending repo, every Dev.to post — and tells you only what passes
            real qualification gates.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <div className="text-2xl font-bold text-slate-900 mb-1">4 sources</div>
              <p className="text-sm text-slate-500">HN, GitHub, Dev.to, Reddit — scraped daily for new signals</p>
            </div>
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <div className="text-2xl font-bold text-slate-900 mb-1">6 evidence gates</div>
              <p className="text-sm text-slate-500">Deduplication, clustering, demand detection, lifecycle, timing, competition</p>
            </div>
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <div className="text-2xl font-bold text-slate-900 mb-1">0 black boxes</div>
              <p className="text-sm text-slate-500">Every score is a weighted formula. Every uncertainty is flagged. Fully auditable.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── How it works (the science) ── */}
      <div id="how-it-works" className="border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">The pipeline: how trends become opportunities</h2>
          <p className="text-sm text-slate-500 mb-10">Six stages. Each one filters out noise. Only the strongest signals survive.</p>

          <div className="space-y-8">
            {/* Stage 1 */}
            <div className="flex gap-6">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">1</div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Signal collection</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
                  Every day, scrapers pull the latest from Hacker News (top stories), GitHub Trending
                  (new repos by stars), Dev.to (top articles), and Reddit (rising posts). Each item
                  becomes a raw signal with source, title, URL, score, and timestamp.
                </p>
              </div>
            </div>

            {/* Stage 2 */}
            <div className="flex gap-6">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">2</div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Deduplication</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
                  URL canonicalization strips tracking parameters and wrapper domains. Fuzzy title
                  matching (token sort ratio) catches the same story posted across sources. Duplicates
                  are linked, not deleted — preserving the evidence chain.
                </p>
              </div>
            </div>

            {/* Stage 3 */}
            <div className="flex gap-6">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">3</div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Trend detection &amp; clustering</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
                  Keywords are extracted from deduplicated signals and mapped to themes. Embedding-based
                  clustering (sentence-transformers + HDBSCAN) groups related signals into coherent trends.
                  Momentum scores are calculated using p90-normalized, 7-day decay weighting. A trend must
                  have 2+ independent artifacts to survive.
                </p>
              </div>
            </div>

            {/* Stage 4 */}
            <div className="flex gap-6">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">4</div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Opportunity qualification</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
                  Each trend is evaluated against strict gates: Does it have demand signals (people asking
                  &quot;how to&quot;, &quot;alternative to&quot;, &quot;problem with&quot;)? Are there 2+ independent evidence
                  artifacts? Can we suggest a specific, buildable action? Is lifecycle confidence above 60%?
                  Only trends that pass all gates become &quot;qualified opportunities.&quot;
                </p>
              </div>
            </div>

            {/* Stage 5 */}
            <div className="flex gap-6">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">5</div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Intelligence layers</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
                  Qualified opportunities get additional analysis: <strong>Timing intelligence</strong> classifies
                  the window (too early, early edge, crowded, late but monetizable). <strong>Competition
                  analysis</strong> estimates saturation and identifies wedge opportunities.
                  <strong> Execution feasibility</strong> matches the opportunity against your profile (team size,
                  risk tolerance, stack).
                </p>
              </div>
            </div>

            {/* Stage 6 */}
            <div className="flex gap-6">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">6</div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Personalized ranking</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
                  Your preferences — role, domains, tech stack, time horizon, risk appetite — produce a
                  relevance score (0-1) using weighted component matching. This reorders opportunities for
                  your &quot;For You&quot; feed. Personalization never hides qualified opportunities — it
                  only changes their order. The global Explore view is always available.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scoring explained ── */}
      <div className="border-t border-slate-100 bg-slate-50/50">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">How scores work</h2>
          <p className="text-sm text-slate-500 mb-8 max-w-2xl">Every number on the platform is computed, not guessed. Here&apos;s what they mean.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Momentum score</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                How fast a trend is growing. Calculated from signal volume with p90 normalization
                and 7-day exponential decay. Higher = faster growth relative to baseline.
              </p>
            </div>
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Opportunity score</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Composite score combining momentum, demand signal strength, evidence quality,
                and action specificity. Only computed for trends that pass all qualification gates.
              </p>
            </div>
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Lifecycle stage</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Where a trend sits in its arc: emerging, rising, peaking, stable, or declining.
                Determined by acceleration patterns across daily snapshots. Shown with a confidence percentage.
              </p>
            </div>
            <div className="p-5 bg-white rounded-xl border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Personalized score</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Your opportunity score adjusted by relevance. Components: role match, domain match,
                stack match, effort fit, risk fit, and avoid penalty. Each is visible in the breakdown.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Why trust it ── */}
      <div id="trust" className="border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Why trust it</h2>
          <p className="text-sm text-slate-500 mb-10">Built on guardrails, not hype. Every recommendation is auditable.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl border border-slate-200 bg-white">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Evidence-gated</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Every opportunity requires 2+ independent artifacts and real demand signals.
                Trends without sufficient evidence stay in &quot;watching&quot; — they never get promoted.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 bg-white">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Uncertainty is visible</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Low-confidence data is flagged with uncertainty indicators, not hidden.
                You always see how many factors the system is unsure about.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 bg-white">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Deterministic scoring</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Scores come from weighted formulas with named components — not black-box neural nets.
                Every number can be traced back to the raw signals that produced it.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 bg-white">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">No filter bubble</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Personalization reorders qualified opportunities — it never hides them.
                The Explore page always shows every tracked trend, unfiltered.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom CTA ── */}
      <div className="border-t border-slate-100 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6 py-14 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Stop guessing. Start building.</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Create an account, set your preferences, and see personalized opportunities in under a minute.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex px-6 py-3 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition"
          >
            Get started free
          </Link>
        </div>
      </div>
    </div>
  )
}
