import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// GET /api/profile/preferences?user_id=xxx - Get user preferences
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  const { data: preferences, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !preferences) {
    return NextResponse.json(
      { error: 'Preferences not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(preferences)
}

// PUT /api/profile/preferences - Update user preferences
export async function PUT(request: Request) {
  const body = await request.json()
  const {
    user_id,
    target_roles,
    domains,
    tech_stack,
    time_horizon,
    team_size,
    risk_tolerance,
    avoid_topics
  } = body

  if (!user_id) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  // Get current preferences for version tracking
  const { data: current } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user_id)
    .single()

  if (!current) {
    return NextResponse.json(
      { error: 'Preferences not found. Create profile first.' },
      { status: 404 }
    )
  }

  const newVersion = (current.preference_version || 1) + 1

  // Save current preferences to history before updating
  await supabase
    .from('user_preference_history')
    .insert({
      user_id,
      preference_version: current.preference_version,
      preferences_snapshot: {
        target_roles: current.target_roles,
        domains: current.domains,
        tech_stack: current.tech_stack,
        time_horizon: current.time_horizon,
        team_size: current.team_size,
        risk_tolerance: current.risk_tolerance,
        avoid_topics: current.avoid_topics
      }
    })

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {
    preference_version: newVersion,
    updated_at: new Date().toISOString()
  }

  if (target_roles !== undefined) updateData.target_roles = target_roles
  if (domains !== undefined) updateData.domains = domains
  if (tech_stack !== undefined) updateData.tech_stack = tech_stack
  if (time_horizon !== undefined) updateData.time_horizon = time_horizon
  if (team_size !== undefined) updateData.team_size = team_size
  if (risk_tolerance !== undefined) updateData.risk_tolerance = risk_tolerance
  if (avoid_topics !== undefined) updateData.avoid_topics = avoid_topics

  // Update preferences
  const { data: updated, error } = await supabase
    .from('user_preferences')
    .update(updateData)
    .eq('user_id', user_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to update preferences', details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ...updated,
    message: 'Preferences updated successfully'
  })
}
