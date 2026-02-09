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
      router.replace(hasPrefs ? '/overview' : '/settings')
    } else {
      setShowPage(true)
    }
  }, [ready, isLoggedIn, hasPrefs, router])

  if (!showPage) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">

      <div className="max-w-5xl mx-auto px-6 pt-24 pb-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-medium text-indigo-600 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          Evidence-based foresight
        </div>
        <h1 className="text-5xl font-bold text-slate-900 tracking-tight leading-tight max-w-3xl">
          See what&apos;s emerging.<br />
          <span className="rishi-gradient-text">Build what matters.</span>
        </h1>
        <p className="text-lg text-slate-500 mt-6 max-w-2xl leading-relaxed">
          Rishi watches Hacker News, GitHub, Dev.to, and Reddit every day.
          It filters noise through evidence gates and surfaces only the opportunities
          backed by real demand and independent sources.
        </p>
        <p className="text-sm text-slate-400 mt-3 max-w-2xl">
          No hype. Every recommendation is auditable, every score is deterministic,
          and every uncertainty is shown &mdash; not hidden.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Link href="/sign-up" className="rishi-btn-primary">
            Get started free
          </Link>
          <Link href="/explore" className="rishi-btn-secondary">
            Explore trends
          </Link>
        </div>
      </div>

      <div className="rishi-section">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">What is Rishi?</h2>
          <p className="text-sm text-slate-500 max-w-3xl leading-relaxed mb-8">
            Most trend tools give you dashboards of noisy data. Rishi is different &mdash; it&apos;s an
            evidence-gated pipeline that turns raw developer community signals into qualified,
            actionable opportunities. Think of it as a research analyst that reads every
            HN thread, every trending repo, every Dev.to post &mdash; and tells you only what passes
            real qualification gates.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rishi-card p-5">
              <div className="text-2xl font-bold rishi-gradient-text mb-1">4 sources</div>
              <p className="text-sm text-slate-500">HN, GitHub, Dev.to, Reddit &mdash; scraped daily for new signals</p>
            </div>
            <div className="rishi-card p-5">
              <div className="text-2xl font-bold rishi-gradient-text mb-1">4 evidence gates</div>
              <p className="text-sm text-slate-500">Demand, independence, actionability, confidence &mdash; all must pass</p>
            </div>
            <div className="rishi-card p-5">
              <div className="text-2xl font-bold rishi-gradient-text mb-1">0 black boxes</div>
              <p className="text-sm text-slate-500">Every score is a weighted formula. Every uncertainty is flagged. Fully auditable.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">What you&apos;ll get</h2>
          <p className="text-sm text-slate-500 mb-8 max-w-2xl">
            Every day, Rishi answers one question: &ldquo;What should I build next, and why?&rdquo;
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rishi-card p-5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center mb-3">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Trend summaries</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Plain-English explanations of what developers are talking about, what they need, and why it matters.
              </p>
            </div>
            <div className="rishi-card p-5">
              <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center mb-3">
                <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Build ideas</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Specific, actionable product ideas with effort estimates &mdash; not generic &ldquo;build a tool for X&rdquo; suggestions.
              </p>
            </div>
            <div className="rishi-card p-5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Competitor landscape</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Known existing solutions and their gaps, so you know where to differentiate.
              </p>
            </div>
            <div className="rishi-card p-5">
              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center mb-3">
                <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Honest risk assessment</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Every opportunity includes its uncertainty factors, evidence gaps, and timing risks.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rishi-section">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">How it works</h2>
          <p className="text-sm text-slate-500 mb-10">Six stages. Each one filters out noise. Only the strongest signals survive.</p>

          <div className="space-y-6">
            {[
              { n: '1', title: 'Signal collection', desc: 'Daily scrapers pull the latest from Hacker News, GitHub Trending, Dev.to, and Reddit. Each item becomes a raw signal with source, title, URL, and engagement score.' },
              { n: '2', title: 'Deduplication', desc: 'URLs are cleaned and normalized. Similar titles across sources are matched using fuzzy comparison. Duplicates are linked so the evidence chain is preserved.' },
              { n: '3', title: 'Trend detection', desc: 'Related signals are grouped into coherent trends using topic extraction and keyword clustering. Each trend gets a momentum score with recency weighting. A trend needs 2+ independent artifacts to survive.' },
              { n: '4', title: 'Opportunity qualification', desc: 'Each trend is checked against strict gates: demand signals, 2+ independent artifacts, a specific buildable action, and lifecycle confidence above 60%. Only trends that pass all gates qualify.' },
              { n: '5', title: 'Intelligence layers', desc: 'Qualified opportunities get timing intelligence (early edge, crowded, late but monetizable), competition analysis (saturation, wedge opportunities), and execution feasibility matched to your profile.' },
              { n: '6', title: 'Personalized ranking', desc: 'Your preferences reorder opportunities so the most relevant appear first. Personalization never hides qualified opportunities — it only changes their order.' },
            ].map((step) => (
              <div key={step.n} className="flex gap-5">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
                  {step.n}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Why trust Rishi</h2>
          <p className="text-sm text-slate-500 mb-8">Built on guardrails, not hype. Every recommendation is auditable.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rishi-card p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Evidence-gated</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Every opportunity requires 2+ independent artifacts and real demand signals.
                Trends without sufficient evidence stay in &ldquo;Watching&rdquo; &mdash; they never get promoted.
              </p>
            </div>
            <div className="rishi-card p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Uncertainty is visible</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Low-confidence data is flagged with uncertainty indicators, not hidden.
                You always see what the system is unsure about.
              </p>
            </div>
            <div className="rishi-card p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Deterministic scoring</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Scores come from weighted formulas with named components &mdash; not black-box neural nets.
                Every number traces back to the raw signals that produced it.
              </p>
            </div>
            <div className="rishi-card p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">No filter bubble</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Personalization reorders qualified opportunities &mdash; it never hides them.
                The Explore page always shows every tracked trend, unfiltered.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rishi-section">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Ready to see what&apos;s emerging?</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Create an account, set your preferences, and see personalized opportunities in under a minute.
          </p>
          <Link href="/sign-up" className="rishi-btn-primary inline-flex">
            Get started free
          </Link>
        </div>
      </div>
    </div>
  )
}
