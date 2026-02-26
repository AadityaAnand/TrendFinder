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
      <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 20, height: 20, border: '2px solid #E5E7EB', borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#111827' }}>

      <section style={{ maxWidth: 960, margin: '0 auto', padding: '120px 24px 96px' }}>
        <h1 style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1, color: '#111827', maxWidth: 720 }}>
          See what&apos;s emerging.
          <br />
          Build what matters.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.7, color: '#4B5563', marginTop: 24, maxWidth: 600 }}>
          Rishi watches developer communities daily, detects trends with real evidence, and tells you what to build&nbsp;&mdash; and when.
        </p>
        <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/sign-up" className="rishi-btn-primary">
            Get started
          </Link>
          <Link href="/method" className="rishi-btn-secondary">
            Learn more
          </Link>
        </div>
      </section>

      <section style={{ borderTop: '1px solid #E5E7EB' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', marginBottom: 12 }}>
            How it works
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, marginTop: 40 }}>

            <div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>We watch</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4B5563' }}>
                Signals from Hacker News, GitHub, and Dev.to are collected daily.
              </p>
            </div>

            <div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>We analyze</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4B5563' }}>
                Trends are detected, filtered for real demand, and qualified against strict evidence gates.
              </p>
            </div>

            <div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>You decide</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4B5563' }}>
                Get opportunity briefs with build ideas, market analysis, and validation steps.
              </p>
            </div>

          </div>
        </div>
      </section>

      <section style={{ borderTop: '1px solid #E5E7EB' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', marginBottom: 12 }}>
            Built on evidence, not hype
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginTop: 40 }}>

            <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 6 }}>Independent sources</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4B5563' }}>
                2+ independent artifacts required.
              </p>
            </div>

            <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 6 }}>Demand signals</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4B5563' }}>
                Real people asking how-to / looking for solutions.
              </p>
            </div>

            <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 6 }}>Buildable actions</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4B5563' }}>
                Concrete, specific product ideas.
              </p>
            </div>

            <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 6 }}>Plain English briefs</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4B5563' }}>
                Every opportunity is summarized in narrative form — no scores, no jargon.
              </p>
            </div>

          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid #E5E7EB', padding: '24px 0' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#9CA3AF' }}>
            Rishi &copy; {new Date().getFullYear()}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Link href="/method" style={{ fontSize: 13, color: '#9CA3AF', textDecoration: 'none' }}>
              How It Works
            </Link>
            <Link href="/sign-in" style={{ fontSize: 13, color: '#9CA3AF', textDecoration: 'none' }}>
              Sign In
            </Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
