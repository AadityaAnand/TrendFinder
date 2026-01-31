'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const USER_ID_KEY = 'trend_generator_user_id'
const HAS_PREFS_KEY = 'trend_generator_has_prefs'

export function useAuth() {
  const [userId, setUserId] = useState<string | null>(null)
  const [hasPrefs, setHasPrefs] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const uid = localStorage.getItem(USER_ID_KEY)
    const prefs = localStorage.getItem(HAS_PREFS_KEY) === 'true'
    setUserId(uid)
    setHasPrefs(prefs)
    setReady(true)
  }, [])

  const login = (uid: string) => {
    localStorage.setItem(USER_ID_KEY, uid)
    setUserId(uid)
  }

  const markPrefsComplete = () => {
    localStorage.setItem(HAS_PREFS_KEY, 'true')
    setHasPrefs(true)
  }

  const logout = () => {
    localStorage.removeItem(USER_ID_KEY)
    localStorage.removeItem(HAS_PREFS_KEY)
    setUserId(null)
    setHasPrefs(false)
  }

  return { userId, hasPrefs, ready, login, markPrefsComplete, logout }
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-sm font-medium transition ${
        active
          ? 'text-slate-900'
          : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </Link>
  )
}

export function Nav() {
  const { userId, ready, logout } = useAuth()
  const pathname = usePathname()

  if (!ready) return null

  const isLoggedIn = !!userId

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-base font-bold text-slate-900 tracking-tight">
          TrendSignal
        </Link>

        {isLoggedIn ? (
          <div className="flex items-center gap-6">
            <NavLink href="/for-you" active={pathname === '/for-you'}>For You</NavLink>
            <NavLink href="/explore" active={pathname === '/explore'}>Explore</NavLink>
            <NavLink href="/settings" active={pathname === '/settings'}>Settings</NavLink>
            <button
              onClick={() => {
                logout()
                window.location.href = '/'
              }}
              className="text-sm text-slate-400 hover:text-slate-600 transition"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <a href="#how-it-works" className="text-sm text-slate-500 hover:text-slate-800 font-medium transition">
              How it works
            </a>
            <a href="#trust" className="text-sm text-slate-500 hover:text-slate-800 font-medium transition">
              Why trust it
            </a>
            <Link
              href="/get-started"
              className="px-4 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition"
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
