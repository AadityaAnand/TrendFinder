import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// GET /api/profile?external_id=xxx - Get user profile
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const externalId = searchParams.get('external_id')

  if (!externalId) {
    return NextResponse.json(
      { error: 'external_id is required' },
      { status: 400 }
    )
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select(`
      *,
      user_preferences (*)
    `)
    .eq('external_id', externalId)
    .single()

  if (error || !profile) {
    return NextResponse.json(
      { error: 'Profile not found' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    id: profile.id,
    external_id: profile.external_id,
    display_name: profile.display_name,
    profile_version: profile.profile_version,
    preferences: profile.user_preferences?.[0] || null,
    created_at: profile.created_at,
    updated_at: profile.updated_at
  })
}

// POST /api/profile - Create new user profile
export async function POST(request: Request) {
  const body = await request.json()
  const { external_id, display_name } = body

  if (!external_id) {
    return NextResponse.json(
      { error: 'external_id is required' },
      { status: 400 }
    )
  }

  // Check if profile already exists
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('external_id', external_id)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: 'Profile already exists', profile_id: existing.id },
      { status: 409 }
    )
  }

  // Create profile
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .insert({
      external_id,
      display_name: display_name || null
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to create profile', details: error.message },
      { status: 500 }
    )
  }

  // Create default preferences
  const { error: prefError } = await supabase
    .from('user_preferences')
    .insert({
      user_id: profile.id,
      target_roles: [],
      domains: [],
      tech_stack: [],
      time_horizon: 'flexible',
      team_size: 'solo',
      risk_tolerance: 'medium',
      avoid_topics: []
    })

  if (prefError) {
    console.error('Failed to create default preferences:', prefError)
  }

  return NextResponse.json({
    id: profile.id,
    external_id: profile.external_id,
    display_name: profile.display_name,
    created_at: profile.created_at
  }, { status: 201 })
}
