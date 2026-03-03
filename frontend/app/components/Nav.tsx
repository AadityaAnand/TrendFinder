'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

type BuilderType = 'developer' | 'creator' | 'both'

const AUDIENCE_LABELS: Record<BuilderType, string> = {
  developer: 'Dev',
  creator: 'Creator',
  both: 'Both',
}

const AUDIENCE_OPTIONS: { value: BuilderType; label: string }[] = [
  { value: 'developer', label: 'I\'m a developer' },
  { value: 'creator', label: 'I\'m a creator' },
  { value: 'both', label: 'Both' },
]

function AudienceSwitcher({ userId }: { userId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<BuilderType | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('builder_type')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.builder_type) setCurrent(data.builder_type as BuilderType)
      })
  }, [userId])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = async (value: BuilderType) => {
    setCurrent(value)
    setOpen(false)
    await supabase.from('user_profiles').update({ builder_type: value }).eq('id', userId)
    router.refresh()
  }

  if (!current) return null

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
      >
        {AUDIENCE_LABELS[current]}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50">
          {AUDIENCE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                current === opt.value
                  ? 'text-indigo-600 font-semibold bg-indigo-50'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-sm transition-colors relative py-1 ${
        active
          ? 'text-indigo-600 font-medium'
          : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
      {active && (
        <span className="absolute -bottom-4.25 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
      )}
    </Link>
  )
}

export function Nav() {
  const { isLoggedIn, ready, signOut, profileId } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  if (!ready) return null

  if (pathname === '/sign-up' || pathname === '/sign-in') return null

  return (
    <nav className="bg-white/95 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href={isLoggedIn ? '/for-you' : '/'} className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight text-slate-900">Rishi</span>
        </Link>

        {isLoggedIn ? (
          <div className="flex items-center gap-5">
            <NavLink href="/for-you" active={pathname === '/for-you'}>For You</NavLink>
            <NavLink href="/explore" active={pathname === '/explore'}>Trends</NavLink>
            <NavLink href="/method" active={pathname === '/method'}>How It Works</NavLink>
            {profileId && <AudienceSwitcher userId={profileId} />}
            <NavLink href="/settings" active={pathname === '/settings'}>Settings</NavLink>
            <button
              onClick={async () => {
                await signOut()
                router.push('/')
              }}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <Link
              href="/sign-in"
              className="text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rishi-btn-primary py-1.5! px-4! text-sm!"
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
