'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

interface UserPreferences {
  id: string
  user_id: string
  goal?: string
  experience_level?: string
  target_roles: string[]
  domains: string[]
  tech_stack: string[]
  time_horizon: string
  team_size: string
  risk_tolerance: string
  avoid_topics: string[]
  preference_version: number
  updated_at?: string
}

interface UserProfile {
  id: string
  external_id: string
  display_name: string | null
  builder_type?: string | null
  platforms?: string[] | null
  niches?: string[] | null
  audience_size?: string | null
  monetization_preferences?: string[] | null
  preferences: UserPreferences | null
}

const GOAL_OPTIONS = [
  { value: 'saas', label: 'Building a SaaS', description: 'Web or mobile product with recurring revenue' },
  { value: 'devtool', label: 'Building a dev tool', description: 'Tools, libraries, or APIs for developers' },
  { value: 'content', label: 'Content or newsletter', description: 'Writing, courses, or media business' },
  { value: 'research', label: 'Researching / investing', description: 'Tracking trends for decisions' },
  { value: 'consulting', label: 'Consulting', description: 'Helping others navigate emerging opportunities' },
  { value: 'exploring', label: 'Just exploring', description: "Curious about what's trending" },
]

const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'Beginner', description: 'New to this area' },
  { value: 'intermediate', label: 'Intermediate', description: 'Some experience, growing' },
  { value: 'expert', label: 'Expert', description: 'Deep experience in this area' },
]

const DOMAIN_OPTIONS = [
  { value: 'ai', label: 'AI/ML' },
  { value: 'devops', label: 'DevOps' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'web3', label: 'Web3/Crypto' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'health', label: 'Health/Wellness' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'devtools', label: 'Developer Tools' },
  { value: 'content_media', label: 'Content/Media' },
  { value: 'saas_b2b', label: 'SaaS / B2B' },
]

const STACK_OPTIONS = [
  { value: 'react', label: 'React/Next.js' },
  { value: 'python', label: 'Python' },
  { value: 'node', label: 'Node.js' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
]

const TIME_HORIZON_OPTIONS = [
  { value: 'this_week', label: 'This week', description: 'Quick wins only' },
  { value: 'this_month', label: 'This month', description: 'Short-term projects' },
  { value: 'this_quarter', label: 'This quarter', description: 'Medium-term initiatives' },
  { value: 'flexible', label: 'Flexible', description: 'Open to any timeline' },
]

const TEAM_SIZE_OPTIONS = [
  { value: 'solo', label: 'Solo', description: 'Working alone' },
  { value: 'small_team', label: 'Small team', description: '2–5 people' },
  { value: 'larger_team', label: 'Larger team', description: '6+ people' },
]

const RISK_OPTIONS = [
  { value: 'low', label: 'Low', description: 'Prefer established trends' },
  { value: 'medium', label: 'Medium', description: 'Balance of risk and stability' },
  { value: 'high', label: 'High', description: 'Early mover on emerging trends' },
]

const BUILDER_TYPE_OPTIONS = [
  { value: 'developer', label: 'Developer', description: 'Building software, tools, or apps' },
  { value: 'creator', label: 'Creator', description: 'Making content, videos, newsletters, or podcasts' },
  { value: 'both', label: 'Both', description: 'I do both — show me everything relevant' },
]

const PLATFORM_OPTIONS = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'other', label: 'Other' },
]

const NICHE_OPTIONS = [
  { value: 'gaming', label: 'Gaming' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'education', label: 'Education' },
  { value: 'finance', label: 'Finance' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'tech', label: 'Tech' },
  { value: 'cooking', label: 'Cooking' },
  { value: 'travel', label: 'Travel' },
  { value: 'business', label: 'Business' },
  { value: 'music', label: 'Music' },
  { value: 'comedy', label: 'Comedy' },
]

const AUDIENCE_SIZE_OPTIONS = [
  { value: 'nano', label: 'Nano', description: 'Under 10k followers' },
  { value: 'micro', label: 'Micro', description: '10k – 100k followers' },
  { value: 'mid', label: 'Mid', description: '100k – 500k followers' },
  { value: 'macro', label: 'Macro', description: '500k+ followers' },
]

const MONETIZATION_OPTIONS = [
  { value: 'sponsorships', label: 'Sponsorships' },
  { value: 'courses', label: 'Courses' },
  { value: 'affiliate', label: 'Affiliate' },
  { value: 'merchandise', label: 'Merchandise' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'ads', label: 'Ad revenue' },
  { value: 'products', label: 'Digital products' },
]

const DEV_STEPS = [
  { key: 'builder_type', title: 'What kind of builder are you?', subtitle: 'This helps us show you the right opportunities' },
  { key: 'goal', title: 'What brings you to Rishi?', subtitle: 'Choose what best describes your goal' },
  { key: 'experience', title: 'How experienced are you?', subtitle: 'With your goal area' },
  { key: 'interests', title: 'What interests you?', subtitle: 'Pick domains and tech you care about' },
  { key: 'constraints', title: 'Your constraints', subtitle: 'Timeline, team, and risk appetite' },
]

const CREATOR_STEPS = [
  { key: 'builder_type', title: 'What kind of builder are you?', subtitle: 'This helps us show you the right opportunities' },
  { key: 'creator_info', title: 'Tell us about your content', subtitle: 'Platform, niche, and how you monetize' },
  { key: 'constraints', title: 'Your constraints', subtitle: 'Timeline and risk appetite' },
]

const BOTH_STEPS = [
  { key: 'builder_type', title: 'What kind of builder are you?', subtitle: 'This helps us show you the right opportunities' },
  { key: 'goal', title: 'What brings you to Rishi?', subtitle: 'Choose what best describes your goal' },
  { key: 'experience', title: 'How experienced are you?', subtitle: 'With your goal area' },
  { key: 'interests', title: 'What interests you?', subtitle: 'Pick domains and tech you care about' },
  { key: 'creator_info', title: 'Tell us about your content', subtitle: 'Platform, niche, and how you monetize' },
  { key: 'constraints', title: 'Your constraints', subtitle: 'Timeline and risk appetite' },
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
                ? 'bg-indigo-600 text-white border-indigo-600'
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

function Tip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <p className="text-sm text-slate-600">{text}</p>
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
  const [saved, setSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [isOnboarding, setIsOnboarding] = useState(false)

  // Developer preferences
  const [goal, setGoal] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [domains, setDomains] = useState<string[]>([])
  const [techStack, setTechStack] = useState<string[]>([])
  const [avoidTopics, setAvoidTopics] = useState('')
  const [timeHorizon, setTimeHorizon] = useState('flexible')
  const [teamSize, setTeamSize] = useState('solo')
  const [riskTolerance, setRiskTolerance] = useState('medium')

  // Creator preferences
  const [builderType, setBuilderType] = useState<string>('developer')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [niches, setNiches] = useState<string[]>([])
  const [audienceSize, setAudienceSize] = useState<string>('')
  const [monetizationPrefs, setMonetizationPrefs] = useState<string[]>([])

  useEffect(() => {
    if (!ready) return
    if (!isLoggedIn) {
      router.replace('/sign-in')
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
        initFormFromProfile(data)
        if (data.preferences?.updated_at) {
          setLastSavedAt(data.preferences.updated_at)
        }
      } else {
        setError('Could not load profile. Please try signing up again.')
      }
    } catch {
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const initFormFromProfile = (profileData: UserProfile) => {
    const prefs = profileData.preferences
    if (prefs) {
      setGoal(prefs.goal || '')
      setExperienceLevel(prefs.experience_level || '')
      setDomains(prefs.domains || [])
      setTechStack(prefs.tech_stack || [])
      setTimeHorizon(prefs.time_horizon || 'flexible')
      setTeamSize(prefs.team_size || 'solo')
      setRiskTolerance(prefs.risk_tolerance || 'medium')
      setAvoidTopics((prefs.avoid_topics || []).join(', '))
    }
    // Creator fields from user_profiles
    setBuilderType(profileData.builder_type || 'developer')
    setPlatforms(profileData.platforms || [])
    setNiches(profileData.niches || [])
    setAudienceSize(profileData.audience_size || '')
    setMonetizationPrefs(profileData.monetization_preferences || [])
  }

  const getActiveSteps = () => {
    if (builderType === 'creator') return CREATOR_STEPS
    if (builderType === 'both') return BOTH_STEPS
    return DEV_STEPS
  }

  const handleSave = async () => {
    if (!profile) return
    try {
      setSaving(true)
      setError(null)
      setSaved(false)

      // Save developer preferences
      const res = await fetch('/api/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profile.id,
          goal,
          experience_level: experienceLevel,
          domains,
          tech_stack: techStack,
          time_horizon: timeHorizon,
          team_size: teamSize,
          risk_tolerance: riskTolerance,
          avoid_topics: avoidTopics.split(',').map(t => t.trim()).filter(Boolean),
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to save preferences')
      }

      // Save creator fields to user_profiles
      await supabase
        .from('user_profiles')
        .update({
          builder_type: builderType,
          platforms: platforms.length > 0 ? platforms : null,
          niches: niches.length > 0 ? niches : null,
          audience_size: audienceSize || null,
          monetization_preferences: monetizationPrefs.length > 0 ? monetizationPrefs : null,
        })
        .eq('id', profile.id)

      markPrefsComplete()
      setSaved(true)
      setLastSavedAt(new Date().toISOString())

      if (isOnboarding) {
        setStep(getActiveSteps().length) // show welcome screen
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleNext = () => {
    const steps = getActiveSteps()
    if (step < steps.length - 1) {
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
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  // Welcome screen (onboarding only, shown after successful save)
  if (step === getActiveSteps().length && isOnboarding) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-xl mx-auto px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Your feed is ready</h1>
          <p className="text-sm text-slate-500 mb-8 max-w-sm mx-auto">
            Rishi will surface opportunities matched to your goals. Here&apos;s how to get the most from it:
          </p>
          <div className="text-left space-y-4 mb-10 max-w-sm mx-auto">
            <Tip text="Save opportunities you find interesting — it improves future rankings." />
            <Tip text="Dismiss anything off-target — it won't reappear." />
            <Tip text="Check back daily — new briefs are published every morning." />
          </div>
          <button
            onClick={() => router.push('/for-you')}
            className="rishi-btn-primary"
          >
            Go to my feed &rarr;
          </button>
        </div>
      </div>
    )
  }

  const getStepContent = (stepKey: string) => {
    switch (stepKey) {
      case 'builder_type':
        return (
          <div key="builder_type" className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">Choose the option that best fits you</label>
              <ChipSelect options={BUILDER_TYPE_OPTIONS} selected={builderType} onChange={(v) => setBuilderType(v as string)} multi={false} />
            </div>
          </div>
        )
      case 'goal':
        return (
          <div key="goal" className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">Select your primary goal</label>
              <ChipSelect options={GOAL_OPTIONS} selected={goal} onChange={(v) => setGoal(v as string)} multi={false} />
            </div>
          </div>
        )
      case 'experience':
        return (
          <div key="experience" className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">
                {goal
                  ? `Your experience with ${GOAL_OPTIONS.find(g => g.value === goal)?.label ?? 'your goal'}`
                  : 'Your experience level'}
              </label>
              <ChipSelect options={EXPERIENCE_OPTIONS} selected={experienceLevel} onChange={(v) => setExperienceLevel(v as string)} multi={false} />
            </div>
          </div>
        )
      case 'interests':
        return (
          <div key="interests" className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">Areas that interest you</label>
              <ChipSelect options={DOMAIN_OPTIONS} selected={domains} onChange={(v) => setDomains(v as string[])} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">Tech stack you work with</label>
              <ChipSelect options={STACK_OPTIONS} selected={techStack} onChange={(v) => setTechStack(v as string[])} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Topics to avoid</label>
              <input
                type="text"
                value={avoidTopics}
                onChange={(e) => setAvoidTopics(e.target.value)}
                placeholder="e.g., crypto, blockchain"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
              <p className="text-xs text-slate-400 mt-1.5">Comma-separated. These topics will be ranked lower, not hidden.</p>
            </div>
          </div>
        )
      case 'creator_info':
        return (
          <div key="creator_info" className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">Platforms you create on</label>
              <ChipSelect options={PLATFORM_OPTIONS} selected={platforms} onChange={(v) => setPlatforms(v as string[])} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">Your niche(s)</label>
              <ChipSelect options={NICHE_OPTIONS} selected={niches} onChange={(v) => setNiches(v as string[])} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">Audience size</label>
              <ChipSelect options={AUDIENCE_SIZE_OPTIONS} selected={audienceSize} onChange={(v) => setAudienceSize(v as string)} multi={false} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">How you monetize (or want to)</label>
              <ChipSelect options={MONETIZATION_OPTIONS} selected={monetizationPrefs} onChange={(v) => setMonetizationPrefs(v as string[])} />
            </div>
          </div>
        )
      case 'constraints':
        return (
          <div key="constraints" className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">Time horizon</label>
              <ChipSelect options={TIME_HORIZON_OPTIONS} selected={timeHorizon} onChange={(v) => setTimeHorizon(v as string)} multi={false} />
            </div>
            {builderType !== 'creator' && (
              <div>
                <label className="block text-sm font-medium text-slate-500 mb-3">Team size</label>
                <ChipSelect options={TEAM_SIZE_OPTIONS} selected={teamSize} onChange={(v) => setTeamSize(v as string)} multi={false} />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-3">Risk tolerance</label>
              <ChipSelect options={RISK_OPTIONS} selected={riskTolerance} onChange={(v) => setRiskTolerance(v as string)} multi={false} />
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-xl mx-auto px-6 py-12">
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

        {/* Step progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          {getActiveSteps().map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 grow">
              <button
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 text-xs font-medium transition ${
                  i === step ? 'text-slate-900' : i < step ? 'text-indigo-600' : 'text-slate-400'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold border transition ${
                  i === step
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : i < step
                    ? 'border-indigo-600 bg-indigo-600 text-white'
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
              {i < getActiveSteps().length - 1 && (
                <div className={`grow h-px ${i < step ? 'bg-indigo-200' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900">{getActiveSteps()[step]?.title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{getActiveSteps()[step]?.subtitle}</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {saved && !isOnboarding && (
          <div className="mb-6 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-600">
            Preferences saved successfully.
          </div>
        )}

        {getStepContent(getActiveSteps()[step]?.key ?? '')}

        <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-200">
          <div>
            {step > 0 && (
              <button
                onClick={handleBack}
                className="text-sm text-slate-500 hover:text-slate-900 font-medium transition"
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
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {step < getActiveSteps().length - 1
              ? 'Continue'
              : saving
              ? 'Saving...'
              : isOnboarding
              ? 'Save & continue'
              : 'Save preferences'
            }
          </button>
        </div>

        {!isOnboarding && lastSavedAt && (
          <p className="text-xs text-slate-400 text-center mt-6">
            Last saved {new Date(lastSavedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            {profile?.preferences?.preference_version ? ` · v${profile.preferences.preference_version}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
