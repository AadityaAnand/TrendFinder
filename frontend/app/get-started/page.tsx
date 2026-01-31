'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const USER_ID_KEY = 'trend_generator_user_id'

export default function GetStartedPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const uid = localStorage.getItem(USER_ID_KEY)
    if (uid) {
      router.replace('/settings')
    }
  }, [router])

  const handleGetStarted = async () => {
    try {
      setCreating(true)
      setError(null)

      const externalId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const name = displayName.trim() || 'Anonymous'

      // Check if profile already exists (demo user)
      const checkRes = await fetch(`/api/profile?external_id=${encodeURIComponent(externalId)}`)

      let profileId: string

      if (checkRes.status === 404) {
        const createRes = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ external_id: externalId, display_name: name })
        })

        if (!createRes.ok) throw new Error('Failed to create profile')
        const profile = await createRes.json()
        profileId = profile.id
      } else if (checkRes.ok) {
        const profile = await checkRes.json()
        profileId = profile.id
      } else {
        throw new Error('Failed to check profile')
      }

      localStorage.setItem(USER_ID_KEY, profileId)
      router.push('/settings')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <Link href="/" className="text-base font-bold text-slate-900 tracking-tight">
            TrendSignal
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-6 mb-2">Get started</h1>
          <p className="text-sm text-slate-500">
            Create your profile to get personalized trend intelligence.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Your name <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
              onKeyDown={(e) => e.key === 'Enter' && handleGetStarted()}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            onClick={handleGetStarted}
            disabled={creating}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition ${
              creating
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {creating ? 'Creating profile...' : 'Continue'}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          No email required. Your preferences are stored locally.
        </p>
      </div>
    </div>
  )
}
