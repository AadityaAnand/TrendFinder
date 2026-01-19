'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

// Demo user ID for now - in production this would come from auth
const DEMO_EXTERNAL_ID = 'demo-user-001'

function MultiSelect({
  options,
  selected,
  onChange,
  label
}: {
  options: { value: string; label: string; description?: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  label: string
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              selected.includes(option.value)
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SingleSelect({
  options,
  selected,
  onChange,
  label
}: {
  options: { value: string; label: string; description?: string }[]
  selected: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              selected === option.value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={option.description}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [targetRoles, setTargetRoles] = useState<string[]>([])
  const [domains, setDomains] = useState<string[]>([])
  const [techStack, setTechStack] = useState<string[]>([])
  const [timeHorizon, setTimeHorizon] = useState('flexible')
  const [teamSize, setTeamSize] = useState('solo')
  const [riskTolerance, setRiskTolerance] = useState('medium')
  const [avoidTopics, setAvoidTopics] = useState('')

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      setLoading(true)
      setError(null)

      // Try to get existing profile
      const res = await fetch(`/api/profile?external_id=${DEMO_EXTERNAL_ID}`)

      if (res.status === 404) {
        // Create new profile
        const createRes = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ external_id: DEMO_EXTERNAL_ID, display_name: 'Demo User' })
        })

        if (!createRes.ok) {
          throw new Error('Failed to create profile')
        }

        // Fetch the newly created profile
        const newProfileRes = await fetch(`/api/profile?external_id=${DEMO_EXTERNAL_ID}`)
        const newProfile = await newProfileRes.json()
        setProfile(newProfile)
        initFormFromPreferences(newProfile.preferences)
      } else if (res.ok) {
        const data = await res.json()
        setProfile(data)
        initFormFromPreferences(data.preferences)
      } else {
        throw new Error('Failed to load profile')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
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
      setSuccess(false)

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

      if (!res.ok) {
        throw new Error('Failed to save preferences')
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500">Loading preferences...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-2">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              ← Back
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            Personalization Settings
          </h1>
          <p className="text-gray-600 mt-2">
            Tell us about your focus to see the most relevant opportunities first.
            This only changes ranking — all qualified opportunities remain visible.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            Preferences saved successfully!
          </div>
        )}

        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Who are you?</h2>
            <MultiSelect
              label="Your primary roles"
              options={ROLE_OPTIONS}
              selected={targetRoles}
              onChange={setTargetRoles}
            />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">What interests you?</h2>
            <div className="space-y-4">
              <MultiSelect
                label="Domains you care about"
                options={DOMAIN_OPTIONS}
                selected={domains}
                onChange={setDomains}
              />
              <MultiSelect
                label="Tech stack you work with"
                options={STACK_OPTIONS}
                selected={techStack}
                onChange={setTechStack}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your constraints</h2>
            <div className="space-y-4">
              <SingleSelect
                label="Time horizon"
                options={TIME_HORIZON_OPTIONS}
                selected={timeHorizon}
                onChange={setTimeHorizon}
              />
              <SingleSelect
                label="Team size"
                options={TEAM_SIZE_OPTIONS}
                selected={teamSize}
                onChange={setTeamSize}
              />
              <SingleSelect
                label="Risk tolerance"
                options={RISK_OPTIONS}
                selected={riskTolerance}
                onChange={setRiskTolerance}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Topics to avoid</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter topics you want to deprioritize (comma-separated)
              </label>
              <input
                type="text"
                value={avoidTopics}
                onChange={(e) => setAvoidTopics(e.target.value)}
                placeholder="e.g., crypto, blockchain, NFT"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <p className="text-sm text-gray-500 mt-1">
                Opportunities containing these topics will be ranked lower
              </p>
            </div>
          </section>

          <div className="pt-6 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-3 rounded-lg font-medium transition ${
                saving
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
            {profile?.preferences?.preference_version && (
              <span className="ml-4 text-sm text-gray-500">
                Version {profile.preferences.preference_version}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
