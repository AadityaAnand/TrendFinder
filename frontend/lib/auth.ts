'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  profileId: string | null
  hasPrefs: boolean
  ready: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profileId: null,
    hasPrefs: false,
    ready: false,
  })

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user)
      } else {
        setState(s => ({ ...s, ready: true }))
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user)
      } else {
        setState({ user: null, profileId: null, hasPrefs: false, ready: true })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (user: User) => {
    try {
      // Try to find existing profile linked to this auth user
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, user_preferences(*)')
        .eq('external_id', user.id)
        .single()

      if (profile) {
        const prefs = Array.isArray(profile.user_preferences)
          ? profile.user_preferences[0]
          : profile.user_preferences
        const hasPrefs = prefs && (
          (prefs.target_roles?.length > 0) ||
          (prefs.domains?.length > 0) ||
          (prefs.tech_stack?.length > 0)
        )
        setState({ user, profileId: profile.id, hasPrefs: !!hasPrefs, ready: true })
      } else {
        // Create profile for this auth user
        const { data: newProfile } = await supabase
          .from('user_profiles')
          .insert({
            external_id: user.id,
            display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || null,
          })
          .select('id')
          .single()

        if (newProfile) {
          // Create default empty preferences
          await supabase.from('user_preferences').insert({
            user_id: newProfile.id,
            target_roles: [],
            domains: [],
            tech_stack: [],
            time_horizon: 'flexible',
            team_size: 'solo',
            risk_tolerance: 'medium',
            avoid_topics: [],
          })
          setState({ user, profileId: newProfile.id, hasPrefs: false, ready: true })
        } else {
          setState({ user, profileId: null, hasPrefs: false, ready: true })
        }
      }
    } catch {
      setState(s => ({ ...s, user, ready: true }))
    }
  }

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    })
    if (error) throw error
    return data
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setState({ user: null, profileId: null, hasPrefs: false, ready: true })
  }, [])

  const markPrefsComplete = useCallback(() => {
    setState(s => ({ ...s, hasPrefs: true }))
  }, [])

  return {
    user: state.user,
    profileId: state.profileId,
    hasPrefs: state.hasPrefs,
    ready: state.ready,
    isLoggedIn: !!state.user,
    signUp,
    signIn,
    signOut,
    markPrefsComplete,
  }
}
