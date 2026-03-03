'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

function setAudienceCookie(audience: string) {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `rishi_audience=${audience}; expires=${expires}; path=/; SameSite=Lax`
}

export default function DeveloperLandingPage() {
  const router = useRouter()
  const { isLoggedIn, hasPrefs, ready } = useAuth()
  const [showPage, setShowPage] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (isLoggedIn) {
      router.replace(hasPrefs ? '/overview' : '/settings')
    } else {
      setAudienceCookie('developer')
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

      {/* Hero */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '120px 24px 96px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EEF2FF', borderRadius: 20, padding: '4px 12px', marginBottom: 24 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>For developers</span>
        </div>
        <h1 style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1, color: '#111827', maxWidth: 680 }}>
          See what developers are starting to build before everyone else does.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.75, color: '#4B5563', marginTop: 28, maxWidth: 560 }}>
          Rishi reads discussions across Hacker News, Reddit, GitHub, and other places where developers hang out. It finds patterns, filters out noise, and shows you opportunities that are actually worth building.
        </p>
        <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/sign-up" className="rishi-btn-primary">
            Find your next project
          </Link>
          <Link href="/method" className="rishi-btn-secondary">
            See how it works
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section style={{ borderTop: '1px solid #E5E7EB' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', marginBottom: 12 }}>
            How it works
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, marginTop: 40 }}>

            <div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>We monitor developer communities.</h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: '#4B5563' }}>
                Hacker News, Reddit, GitHub, Product Hunt, Dev.to, IndieHackers, and Substack — scanned every few hours.
              </p>
            </div>

            <div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>We find cross-community patterns.</h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: '#4B5563' }}>
                When the same problem surfaces across GitHub, HN, and Reddit, that&apos;s a signal. We score by community spread, not raw engagement.
              </p>
            </div>

            <div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>You get an opportunity brief.</h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: '#4B5563' }}>
                What&apos;s happening, who&apos;s affected, and what you could build. With evidence. No dashboards, no charts.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Sample brief preview */}
      <section style={{ borderTop: '1px solid #E5E7EB', background: '#F8F9FB' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', marginBottom: 12 }}>
            What a developer brief looks like
          </p>
          <p style={{ fontSize: 15, color: '#4B5563', marginBottom: 36, maxWidth: 480 }}>
            Every qualified opportunity comes with context, evidence, and concrete build ideas.
          </p>

          <div style={{ maxWidth: 560, border: '1px solid #E5E7EB', borderRadius: 16, padding: 24, background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
                Self-hosted vector search for edge AI apps
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#047857', background: '#ECFDF5', padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
                Ready to build
              </span>
            </div>
            <p style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.75, marginBottom: 12 }}>
              AI engineers building on-device applications need a lightweight, embeddable vector DB that works without a cloud dependency. Existing solutions require a server or are too heavy for mobile and edge deployments.
            </p>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 14 }}>
              Affects: AI engineers, mobile developers, embedded systems builders
            </p>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 8 }}>Pain signals</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  "Can't use Chroma or Pinecone on device — latency and privacy blockers",
                  "SQLite with manual cosine similarity is fragile and slow",
                  "No good TypeScript-native option below 5MB",
                ].map((p, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#4B5563', display: 'flex', gap: 8 }}>
                    <span style={{ color: '#6366F1', flexShrink: 0 }}>•</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ borderTop: '1px solid #F1F3F6', paddingTop: 12 }}>
              <p style={{ fontSize: 12, color: '#9CA3AF' }}>From 4 independent sources &nbsp;·&nbsp; HN, GitHub, Reddit, Dev.to</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section style={{ borderTop: '1px solid #E5E7EB' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <blockquote style={{ fontSize: 20, lineHeight: 1.6, color: '#111827', fontStyle: 'italic', margin: 0 }}>
            &ldquo;I found the vector database opportunity three months before it blew up. Built a prototype in a weekend and had 200 GitHub stars before launch.&rdquo;
          </blockquote>
          <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 20 }}>Sarah, independent developer</p>
        </div>
      </section>

      {/* Built on evidence */}
      <section style={{ borderTop: '1px solid #E5E7EB', background: '#F8F9FB' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', marginBottom: 12 }}>
            Built on evidence, not hype
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginTop: 40 }}>
            {[
              { title: 'Independent sources', body: 'Two or more independent artifacts are required. One Reddit thread is not enough.', icon: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /> },
              { title: 'Demand signals', body: 'Real developers asking how to solve something. Not just mentions or hype.', icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
              { title: 'Buildable actions', body: 'Concrete, specific product ideas with suggested implementation paths.', icon: <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /> },
              { title: 'Plain English briefs', body: 'Every opportunity is written as a short narrative. No scores, no jargon.', icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> },
            ].map(({ title, body, icon }) => (
              <div key={title} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, background: '#ffffff' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.75, color: '#4B5563' }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ borderTop: '1px solid #E5E7EB', background: '#4F46E5' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: '#ffffff', marginBottom: 12 }}>Ready to find your next project?</h2>
          <p style={{ fontSize: 16, color: '#C7D2FE', marginBottom: 32 }}>Free while we&apos;re in beta. No credit card.</p>
          <Link href="/sign-up" style={{ display: 'inline-block', background: '#ffffff', color: '#4F46E5', fontWeight: 600, fontSize: 14, padding: '12px 28px', borderRadius: 8, textDecoration: 'none' }}>
            Start for free
          </Link>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid #E5E7EB', padding: '24px 0' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#9CA3AF' }}>Rishi &copy; {new Date().getFullYear()}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Link href="/faq" style={{ fontSize: 13, color: '#9CA3AF', textDecoration: 'none' }}>FAQ</Link>
            <Link href="/method" style={{ fontSize: 13, color: '#9CA3AF', textDecoration: 'none' }}>How It Works</Link>
            <Link href="/sign-in" style={{ fontSize: 13, color: '#9CA3AF', textDecoration: 'none' }}>Sign In</Link>
            <Link href="/landing/creator" style={{ fontSize: 13, color: '#6366F1', textDecoration: 'none', fontWeight: 500 }}>For creators →</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
