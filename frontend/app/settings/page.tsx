'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

interface UserPreferences {
  id: string
  user_id: string
  target_roles: string[]
  domains: string[]
  tech_stack: string[]
  time_horizon: string
  team_size: string
  risk_tolerance: string
  avoid_topics: string[]
  preference_version: number
}

interface UserProfile {
  id: string
  external_id: string
  display_name: string | null
  preferences: UserPreferences | null
}

const ROLE_OPTIONS = [
  { value: 'developer', label: 'Developer', description: 'Building software products' },
  { value: 'founder', label: 'Founder', description: 'Starting or running a business' },
  { value: 'marketer', label: 'Marketer', description: 'Growing audiences and brands' },
  { value: 'creator', label: 'Creator', description: 'Creating content and media' },
  { value: 'researcher', label: 'Researcher', description: 'Exploring and analyzing' }
]

const DOMAIN_OPTIONS = [
  { value: 'ai', label: 'AI/ML' },
  { value: 'web3', label: 'Web3/Crypto' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'health', label: 'Health/Wellness' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'devtools', label: 'Developer Tools' }
]

const STACK_OPTIONS = [
  { value: 'react', label: 'React/Next.js' },
  { value: 'python', label: 'Python' },
  { value: 'node', label: 'Node.js' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' }
]

const TIME_HORIZON_OPTIONS = [
  { value: 'this_week', label: 'This week', description: 'Quick wins only' },
  { value: 'this_month', label: 'This month', description: 'Short-term projects' },
  { value: 'this_quarter', label: 'This quarter', description: 'Medium-term initiatives' },
  { value: 'flexible', label: 'Flexible', description: 'Open to any timeline' }
]

const TEAM_SIZE_OPTIONS = [
  { value: 'solo', label: 'Solo', description: 'Working alone' },
  { value: 'small_team', label: 'Small team', description: '2-5 people' },
  { value: 'larger_team', label: 'Larger team', description: '6+ people' }
]

const RISK_OPTIONS = [
  { value: 'low', label: 'Low', description: 'Prefer established trends' },
  { value: 'medium', label: 'Medium', description: 'Balance of risk and stability' },
  { value: 'high', label: 'High', description: 'Early mover on emerging trends' }
]

const STEPS = [
  { key: 'role', title: 'Who are you?', subtitle: 'Select your primary roles' },
  { key: 'interests', title: 'What interests you?', subtitle: 'Pick domains and tech you care about' },
  { key: 'constraints', title: 'Your constraints', subtitle: 'Timeline, team, and risk appetite' },
]

function ChipSelect({
  options,
  selected,
  onChange,
  multi = true,
}: {
  options: { value: string; label: string; description?: string }[]
  selected: string | string[]
  onChange: (v: string | string[]) => void
  multi?: boolean
}) {
  const selectedArr = Array.isArray(selected) ? selected : [selected]

  const toggle = (value: string) => {
    if (multi) {
      const arr = selectedArr.includes(value)
        ? selectedArr.filter(v => v !== value)
        : [...selectedArr, value]
      onChange(arr)
    } else {
      onChange(value)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(option => {
        const isSelected = selectedArr.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition border ${
              isSelected
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
            title={option.description}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { profileId, hasPrefs, ready, isLoggedIn, markPrefsComplete } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [isOnboarding, setIsOnboarding] = useState(false)

  // Form state
  const [targetRoles, setTargetRoles] = useState<string[]>([])
  const [domains, setDomains] = useState<string[]>([])
  const [techStack, setTechStack] = useState<string[]>([])
  const [timeHorizon, setTimeHorizon] = useState('flexible')
  const [teamSize, setTeamSize] = useState('solo')
  const [riskTolerance, setRiskTolerance] = useState('medium')
  const [avoidTopics, setAvoidTopics] = useState('')

  useEffect(() => {
    if (!ready) return
    if (!isLoggedIn) {
      router.replace('/')
      return
    }
    setIsOnboarding(!hasPrefs)
    if (profileId) {
      loadProfile(profileId)
    } else {
      setLoading(false)
      setError('Profile not found. Please sign up again.')
    }
  }, [ready, isLoggedIn, hasPrefs, profileId, router])

  const loadProfile = async (pid: string) => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/profile?user_id=${pid}`)

      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        initFormFromPreferences(data.preferences)
      } else {
        setError('Could not load profile. Please try signing up again.')
      }
    } catch {
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const initFormFromPreferences = (prefs: UserPreferences | null) => {
    if (prefs) {
      setTargetRoles(prefs.target_roles || [])
      setDomains(prefs.domains || [])
      setTechStack(prefs.tech_stack || [])
      setTimeHorizon(prefs.time_horizon || 'flexible')
      setTeamSize(prefs.team_size || 'solo')
      setRiskTolerance(prefs.risk_tolerance || 'medium')
      setAvoidTopics((prefs.avoid_topics || []).join(', '))
    }
  }

  const handleSave = async () => {
    if (!profile) return

    try {
      setSaving(true)
      setError(null)

      const res = await fetch('/api/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profile.id,
          target_roles: targetRoles,
          domains: domains,
          tech_stack: techStack,
          time_horizon: timeHorizon,
          team_size: teamSize,
          risk_tolerance: riskTolerance,
          avoid_topics: avoidTopics.split(',').map(t => t.trim()).filter(Boolean)
        })
      })

      if (!res.ok) throw new Error('Failed to save preferences')

      markPrefsComplete()

      if (isOnboarding) {
        router.push('/for-you')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      handleSave()
    }
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    )
  }

  const stepContent = [
    // Step 0: Role
    <div key="role" className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">Your primary roles</label>
        <ChipSelect options={ROLE_OPTIONS} selected={targetRoles} onChange={(v) => setTargetRoles(v as string[])} />
      </div>
    </div>,

    // Step 1: Interests
    <div key="interests" className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">Domains you care about</label>
        <ChipSelect options={DOMAIN_OPTIONS} selected={domains} onChange={(v) => setDomains(v as string[])} />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">Tech stack you work with</label>
        <ChipSelect options={STACK_OPTIONS} selected={techStack} onChange={(v) => setTechStack(v as string[])} />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Topics to avoid</label>
        <input
          type="text"
          value={avoidTopics}
          onChange={(e) => setAvoidTopics(e.target.value)}
          placeholder="e.g., crypto, blockchain"
          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
        />
        <p className="text-xs text-slate-400 mt-1.5">Comma-separated. These topics will be ranked lower, not hidden.</p>
      </div>
    </div>,

    // Step 2: Constraints
    <div key="constraints" className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">Time horizon</label>
        <ChipSelect options={TIME_HORIZON_OPTIONS} selected={timeHorizon} onChange={(v) => setTimeHorizon(v as string)} multi={false} />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">Team size</label>
        <ChipSelect options={TEAM_SIZE_OPTIONS} selected={teamSize} onChange={(v) => setTeamSize(v as string)} multi={false} />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">Risk tolerance</label>
        <ChipSelect options={RISK_OPTIONS} selected={riskTolerance} onChange={(v) => setRiskTolerance(v as string)} multi={false} />
      </div>
    </div>,
  ]

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          {isOnboarding ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Set up your preferences</h1>
              <p className="text-sm text-slate-500 mt-1">This only changes ranking — all qualified opportunities remain visible.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
              <p className="text-sm text-slate-500 mt-1">Update your preferences to adjust opportunity ranking.</p>
            </>
          )}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 grow">
              <button
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 text-xs font-medium transition ${
                  i === step ? 'text-slate-900' : i < step ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold border transition ${
                  i === step
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : i < step
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-slate-200 text-slate-400'
                }`}>
                  {i < step ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="hidden sm:inline">{s.title}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`grow h-px ${i < step ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step title */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900">{STEPS[step].title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{STEPS[step].subtitle}</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step content */}
        {stepContent[step]}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-100">
          <div>
            {step > 0 && (
              <button
                onClick={handleBack}
                className="text-sm text-slate-500 hover:text-slate-700 font-medium transition"
              >
                Back
              </button>
            )}
          </div>
          <button
            onClick={handleNext}
            disabled={saving}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition ${
              saving
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {step < STEPS.length - 1
              ? 'Continue'
              : saving
              ? 'Saving...'
              : isOnboarding
              ? 'Save & see opportunities'
              : 'Save preferences'
            }
          </button>
        </div>

        {/* Version info for returning users */}
        {!isOnboarding && profile?.preferences?.preference_version && (
          <p className="text-xs text-slate-400 text-center mt-6">
            Preference version {profile.preferences.preference_version}
          </p>
        )}
      </div>
    </div>
  )
}
