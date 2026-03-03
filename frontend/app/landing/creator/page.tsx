'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

function setAudienceCookie(audience: string) {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `rishi_audience=${audience}; expires=${expires}; path=/; SameSite=Lax`
}

export default function CreatorLandingPage() {
  const router = useRouter()
  const { isLoggedIn, hasPrefs, ready } = useAuth()
  const [showPage, setShowPage] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (isLoggedIn) {
      router.replace(hasPrefs ? '/overview' : '/settings')
    } else {
      setAudienceCookie('creator')
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FDF2F8', borderRadius: 20, padding: '4px 12px', marginBottom: 24 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9333EA', textTransform: 'uppercase', letterSpacing: '0.05em' }}>For creators</span>
        </div>
        <h1 style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1, color: '#111827', maxWidth: 680 }}>
          Spot content trends before they blow up.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.75, color: '#4B5563', marginTop: 28, maxWidth: 560 }}>
          Rishi monitors TikTok, YouTube, Instagram, and other creator platforms to find rising formats, audience pain points, and monetization opportunities — before they&apos;re saturated.
        </p>
        <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/sign-up" className="rishi-btn-primary">
            Find your next viral format
          </Link>
          <Link href="/method" className="rishi-btn-secondary">
            See how it works
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section style={{ borderTop: '1px solid #E5E7EB' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9333EA', marginBottom: 12 }}>
            How it works
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, marginTop: 40 }}>

            <div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FDF2F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9333EA" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.54C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
                  <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>We track creator platforms.</h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: '#4B5563' }}>
                YouTube, TikTok, Instagram, Spotify, Twitch, Medium — monitored continuously for rising engagement and emerging formats.
              </p>
            </div>

            <div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FDF2F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9333EA" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>We find rising formats.</h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: '#4B5563' }}>
                When audience pain points cluster across platforms, that&apos;s a signal. We surface formats with momentum before they peak.
              </p>
            </div>

            <div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FDF2F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9333EA" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>You get a content brief.</h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: '#4B5563' }}>
                What the audience wants, which formats are working, and how to monetize it. Concrete, actionable, grounded in signals.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Sample brief preview */}
      <section style={{ borderTop: '1px solid #E5E7EB', background: '#F8F9FB' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9333EA', marginBottom: 12 }}>
            What a creator brief looks like
          </p>
          <p style={{ fontSize: 15, color: '#4B5563', marginBottom: 36, maxWidth: 480 }}>
            Every opportunity comes with audience pain points, platform data, and a monetization angle.
          </p>

          <div style={{ maxWidth: 560, border: '1px solid #E5E7EB', borderRadius: 16, padding: 24, background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
                Long-form personal finance breakdowns for skeptical 25–35 year olds
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#047857', background: '#ECFDF5', padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
                Ready to create
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {['YouTube', 'Newsletter', 'Podcast'].map(p => (
                <span key={p} style={{ fontSize: 10, fontWeight: 600, color: '#9333EA', background: '#FDF2F8', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}>{p}</span>
              ))}
            </div>
            <p style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.75, marginBottom: 12 }}>
              Millennials distrust traditional financial advice but are actively seeking alternatives. Long-form, evidence-based breakdowns that challenge conventional wisdom are outperforming polished how-to content.
            </p>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 8 }}>Audience pain</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  '"Every finance creator just says index funds. Nobody explains why my specific situation is different."',
                  '"I make good money but still feel like I\'m doing it wrong compared to finance Twitter."',
                ].map((p, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#4B5563', fontStyle: 'italic', display: 'flex', gap: 8 }}>
                    <span style={{ color: '#9333EA', flexShrink: 0 }}>•</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ background: '#F8F9FB', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 4 }}>Monetization angle</p>
              <p style={{ fontSize: 13, color: '#4B5563' }}>Financial planning templates + community ($29/mo) once trust is established over 6+ months of free content</p>
            </div>
            <div style={{ borderTop: '1px solid #F1F3F6', paddingTop: 12 }}>
              <p style={{ fontSize: 12, color: '#9CA3AF' }}>From 3 independent platforms &nbsp;·&nbsp; YouTube, Reddit, Podcast comments</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section style={{ borderTop: '1px solid #E5E7EB' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <blockquote style={{ fontSize: 20, lineHeight: 1.6, color: '#111827', fontStyle: 'italic', margin: 0 }}>
            &ldquo;I spotted the personal finance skeptic angle two months before it became saturated. Built an audience of 8,000 newsletter subscribers before the big creators noticed.&rdquo;
          </blockquote>
          <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 20 }}>Maya, independent content creator</p>
        </div>
      </section>

      {/* What we track */}
      <section style={{ borderTop: '1px solid #E5E7EB', background: '#F8F9FB' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9333EA', marginBottom: 12 }}>
            Built on real platform signals
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginTop: 40 }}>
            {[
              { title: 'Platform coverage', body: 'YouTube trends, TikTok formats, Instagram engagement patterns, Spotify listener data, Twitch clips, Medium articles.' },
              { title: 'Audience pain points', body: 'Real comments and discussions where audiences say what content is missing — not what brands think they want.' },
              { title: 'Monetization data', body: 'Which formats lead to sponsorships, courses, subscriptions, and affiliate income based on what\'s actually working.' },
              { title: 'Timing windows', body: 'We flag trends before they peak so you have a window to establish yourself before the space gets crowded.' },
            ].map(({ title, body }) => (
              <div key={title} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, background: '#ffffff' }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.75, color: '#4B5563' }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ borderTop: '1px solid #E5E7EB', background: '#9333EA' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: '#ffffff', marginBottom: 12 }}>Ready to find your next viral format?</h2>
          <p style={{ fontSize: 16, color: '#E9D5FF', marginBottom: 32 }}>Free while we&apos;re in beta. No credit card.</p>
          <Link href="/sign-up" style={{ display: 'inline-block', background: '#ffffff', color: '#9333EA', fontWeight: 600, fontSize: 14, padding: '12px 28px', borderRadius: 8, textDecoration: 'none' }}>
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
            <Link href="/landing/developer" style={{ fontSize: 13, color: '#6366F1', textDecoration: 'none', fontWeight: 500 }}>For developers →</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
