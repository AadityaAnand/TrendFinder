'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './Nav'

interface AuthGuardProps {
  children: React.ReactNode
  requirePrefs?: boolean
}

export function AuthGuard({ children, requirePrefs = false }: AuthGuardProps) {
  const { userId, hasPrefs, ready } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!ready) return

    if (!userId) {
      router.replace('/')
      return
    }

    if (requirePrefs && !hasPrefs) {
      router.replace('/settings')
    }
  }, [userId, hasPrefs, ready, requirePrefs, router])

  if (!ready) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!userId) return null
  if (requirePrefs && !hasPrefs) return null

  return <>{children}</>
}
