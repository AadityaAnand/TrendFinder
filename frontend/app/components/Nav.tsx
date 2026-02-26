'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

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
  const { isLoggedIn, ready, signOut } = useAuth()
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
          <div className="flex items-center gap-6">
            <NavLink href="/for-you" active={pathname === '/for-you'}>For You</NavLink>
            <NavLink href="/explore" active={pathname === '/explore'}>Trends</NavLink>
            <NavLink href="/method" active={pathname === '/method'}>How It Works</NavLink>
            <NavLink href="/settings" active={pathname === '/settings'}>Settings</NavLink>
            <button
              onClick={async () => {
                await signOut()
                router.push('/')
              }}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors ml-2"
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
