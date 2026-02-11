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
      <div className="min-h-screen bg-[var(--bg-0)] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-0)]">

      <section className="relative overflow-hidden">
        <div className="absolute top-[-120px] right-[-80px] w-[600px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08)_0%,transparent_70%)] pointer-events-none" />
        <div className="absolute bottom-[-200px] left-[-100px] w-[400px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.04)_0%,transparent_70%)] pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 pt-28 pb-24 relative">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--border-accent)] bg-[var(--accent-subtle)] text-xs font-medium text-[var(--text-accent)] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            Evidence-based foresight
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-[var(--text-primary)] tracking-tight leading-[1.1] max-w-3xl">
            See what&apos;s emerging.<br />
            <span className="rishi-gradient-text">Build what matters.</span>
          </h1>
          <p className="text-lg text-[var(--text-secondary)] mt-7 max-w-2xl leading-relaxed">
            Rishi watches Hacker News, GitHub, Dev.to, and Reddit every day.
            It filters noise through evidence gates and surfaces only the opportunities
            backed by real demand and independent sources.
          </p>
          <p className="text-sm text-[var(--text-tertiary)] mt-3 max-w-2xl leading-relaxed">
            No hype. Every recommendation is auditable, every score is deterministic,
            and every uncertainty is shown &mdash; not hidden.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <Link href="/sign-up" className="rishi-btn-primary">
              Get started free
            </Link>
            <Link href="/explore" className="rishi-btn-secondary">
              Explore trends
            </Link>
          </div>
        </div>
      </section>

      <div className="rishi-section">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold tracking-widest uppercase text-[var(--text-accent)] mb-3">What is Rishi</p>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">An evidence-gated foresight engine</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed mb-10">
            Most trend tools give you dashboards of noisy data. Rishi is different &mdash; it turns raw developer
            community signals into qualified, actionable opportunities. Think of it as a research analyst
            that reads every HN thread, every trending repo, every Dev.to post &mdash; and tells you only
            what passes real qualification gates.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="rishi-card p-6">
              <div className="text-3xl font-bold rishi-gradient-text mb-2">4</div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Sources scraped daily</p>
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">HN, GitHub, Dev.to, Reddit</p>
            </div>
            <div className="rishi-card p-6">
              <div className="text-3xl font-bold rishi-gradient-text mb-2">5</div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Evidence gates</p>
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">Demand, independence, hypothesis, actionability, confidence</p>
            </div>
            <div className="rishi-card p-6">
              <div className="text-3xl font-bold rishi-gradient-text mb-2">0</div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Black boxes</p>
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">Every score is a weighted formula. Fully auditable.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rishi-section">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold tracking-widest uppercase text-[var(--text-accent)] mb-3">What you get</p>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Answers, not dashboards</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-10 max-w-2xl">
            Every day, Rishi answers one question: &ldquo;What should I build next, and why?&rdquo;
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rishi-card p-6">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center mb-4">
                <svg className="w-4.5 h-4.5 text-[var(--accent-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">Problem hypotheses</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Not just topics &mdash; real problem statements with affected personas, pain signals, and demand evidence.
              </p>
            </div>
            <div className="rishi-card p-6">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center mb-4">
                <svg className="w-4.5 h-4.5 text-[var(--accent-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">Build ideas</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Specific, actionable product ideas with effort estimates &mdash; not generic &ldquo;build a tool for X&rdquo; suggestions.
              </p>
            </div>
            <div className="rishi-card p-6">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center mb-4">
                <svg className="w-4.5 h-4.5 text-[var(--accent-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">Competitor landscape</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Known existing solutions and their gaps, so you know where to differentiate.
              </p>
            </div>
            <div className="rishi-card p-6">
              <div className="w-9 h-9 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center mb-4">
                <svg className="w-4.5 h-4.5 text-[var(--accent-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">Honest risk assessment</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Every opportunity includes its uncertainty factors, evidence gaps, and timing risks.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rishi-section">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold tracking-widest uppercase text-[var(--text-accent)] mb-3">How it works</p>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Six stages of filtering</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-12">Each one filters out noise. Only the strongest signals survive.</p>

          <div className="space-y-8">
            {[
              { n: '1', title: 'Signal collection', desc: 'Daily scrapers pull the latest from Hacker News, GitHub Trending, Dev.to, and Reddit. Each item becomes a raw signal with source, title, URL, and engagement score.' },
              { n: '2', title: 'Deduplication', desc: 'URLs are cleaned and normalized. Similar titles across sources are matched using fuzzy comparison. Duplicates are linked so the evidence chain is preserved.' },
              { n: '3', title: 'Trend detection', desc: 'Related signals are grouped into coherent trends using topic extraction and keyword clustering. Each trend gets a momentum score with recency weighting. A trend needs 2+ independent artifacts to survive.' },
              { n: '4', title: 'Hypothesis generation', desc: 'Each trend is analyzed to determine if it represents a real problem. Valid hypotheses get a problem statement, affected personas, and pain signals. Topics without clear problems are filtered.' },
              { n: '5', title: 'Opportunity qualification', desc: 'Hypotheses are checked against strict gates: demand signals, independent evidence, valid hypothesis, actionability, and lifecycle confidence above 60%. Only those passing all gates qualify.' },
              { n: '6', title: 'Personalized ranking', desc: 'Your preferences reorder opportunities so the most relevant appear first. Personalization never hides qualified opportunities — it only changes their order.' },
            ].map((step) => (
              <div key={step.n} className="flex gap-5 items-start">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center text-sm font-bold shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                  {step.n}
                </div>
                <div className="pt-0.5">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{step.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed max-w-2xl">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rishi-section">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold tracking-widest uppercase text-[var(--text-accent)] mb-3">Trust</p>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Built on guardrails, not hype</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-10">Every recommendation is auditable.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rishi-card p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Evidence-gated</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Every opportunity requires 2+ independent artifacts and real demand signals.
                Trends without sufficient evidence stay in &ldquo;Watching&rdquo; &mdash; they never get promoted.
              </p>
            </div>
            <div className="rishi-card p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Uncertainty is visible</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Low-confidence data is flagged with uncertainty indicators, not hidden.
                You always see what the system is unsure about.
              </p>
            </div>
            <div className="rishi-card p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Deterministic scoring</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Scores come from weighted formulas with named components &mdash; not black-box neural nets.
                Every number traces back to the raw signals that produced it.
              </p>
            </div>
            <div className="rishi-card p-6">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">No filter bubble</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Personalization reorders qualified opportunities &mdash; it never hides them.
                The Explore page always shows every tracked trend, unfiltered.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rishi-section">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">Ready to see what&apos;s emerging?</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-md mx-auto leading-relaxed">
            Create an account, set your preferences, and see personalized opportunities in under a minute.
          </p>
          <Link href="/sign-up" className="rishi-btn-primary">
            Get started free
          </Link>
        </div>
      </div>

      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">Rishi &mdash; Evidence-based foresight</span>
          <div className="flex items-center gap-5 text-xs text-[var(--text-tertiary)]">
            <Link href="/method" className="hover:text-[var(--text-secondary)] transition-colors">How it works</Link>
            <Link href="/explore" className="hover:text-[var(--text-secondary)] transition-colors">Explore</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
