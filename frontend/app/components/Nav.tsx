'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

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
  const { isLoggedIn, ready, signOut } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  if (!ready) return null

  // Hide nav on auth pages for cleaner look
  if (pathname === '/sign-up' || pathname === '/sign-in') return null

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-base font-bold text-slate-900 tracking-tight">
          TrendSignal
        </Link>

        {isLoggedIn ? (
          <div className="flex items-center gap-6">
            <NavLink href="/explore" active={pathname === '/explore'}>Explore</NavLink>
            <NavLink href="/learn" active={pathname === '/learn'}>Learn</NavLink>
            <NavLink href="/settings" active={pathname === '/settings'}>Settings</NavLink>
            <button
              onClick={async () => {
                await signOut()
                router.push('/')
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
              href="/sign-in"
              className="text-sm text-slate-500 hover:text-slate-800 font-medium transition"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
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
