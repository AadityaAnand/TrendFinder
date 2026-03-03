'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

function getAudienceCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)rishi_audience=([^;]+)/)
  return match ? match[1] : null
}

export default function LandingPage() {
  const router = useRouter()
  const { isLoggedIn, hasPrefs, ready } = useAuth()

  useEffect(() => {
    if (!ready) return
    if (isLoggedIn) {
      router.replace(hasPrefs ? '/overview' : '/settings')
      return
    }

    // Route logged-out users to audience-specific landing
    const params = new URLSearchParams(window.location.search)
    const utmAudience = params.get('audience')
    if (utmAudience === 'creator' || utmAudience === 'developer') {
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()
      document.cookie = `rishi_audience=${utmAudience}; expires=${expires}; path=/; SameSite=Lax`
      router.replace(`/landing/${utmAudience}`)
      return
    }
    const cookieAudience = getAudienceCookie()
    if (cookieAudience === 'creator' || cookieAudience === 'developer') {
      router.replace(`/landing/${cookieAudience}`)
      return
    }
    // Default: developer landing
    router.replace('/landing/developer')
  }, [ready, isLoggedIn, hasPrefs, router])

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 20, height: 20, border: '2px solid #E5E7EB', borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  )
}
