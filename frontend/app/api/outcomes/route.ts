import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// Valid outcome types
const VALID_OUTCOME_TYPES = [
  'explored',    // User clicked through / viewed details
  'started',     // User indicated they started working on it
  'completed',   // User completed/shipped something
  'abandoned',   // User started but stopped
  'passed'       // User explicitly passed after consideration
] as const

type OutcomeType = typeof VALID_OUTCOME_TYPES[number]

// Valid drop-off stages for abandoned outcomes
const VALID_DROP_OFF_STAGES = ['explored', 'started', 'midway', 'near_complete'] as const

// POST /api/outcomes - Record an opportunity outcome
export async function POST(request: Request) {
  const body = await request.json()
  const {
    user_id,
    opportunity_id,
    outcome_type,
    note,
    time_spent_days,
    // Phase 6 enhanced fields
    quality_score,
    time_to_first_action,
    time_to_completion,
    drop_off_stage,
    success_factors,
    failure_factors
  } = body

  if (!user_id || !opportunity_id || !outcome_type) {
    return NextResponse.json(
      { error: 'user_id, opportunity_id, and outcome_type are required' },
      { status: 400 }
    )
  }

  if (!VALID_OUTCOME_TYPES.includes(outcome_type as OutcomeType)) {
    return NextResponse.json(
      { error: `Invalid outcome_type. Must be one of: ${VALID_OUTCOME_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Validate quality_score if provided
  if (quality_score !== undefined && (quality_score < 1 || quality_score > 5)) {
    return NextResponse.json(
      { error: 'quality_score must be between 1 and 5' },
      { status: 400 }
    )
  }

  // Validate drop_off_stage if provided
  if (drop_off_stage && !VALID_DROP_OFF_STAGES.includes(drop_off_stage)) {
    return NextResponse.json(
      { error: `Invalid drop_off_stage. Must be one of: ${VALID_DROP_OFF_STAGES.join(', ')}` },
      { status: 400 }
    )
  }

  // Verify user exists
  const { data: user } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user_id)
    .single()

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }

  // Build outcome data
  const outcomeData: Record<string, unknown> = {
    user_id,
    opportunity_id,
    outcome_type,
    note: note || null,
    time_spent_days: time_spent_days || null,
    recorded_at: new Date().toISOString()
  }

  // Add Phase 6 enhanced fields if provided
  if (quality_score !== undefined) outcomeData.quality_score = quality_score
  if (time_to_first_action !== undefined) outcomeData.time_to_first_action = time_to_first_action
  if (time_to_completion !== undefined) outcomeData.time_to_completion = time_to_completion
  if (drop_off_stage) outcomeData.drop_off_stage = drop_off_stage
  if (success_factors) outcomeData.success_factors = success_factors
  if (failure_factors) outcomeData.failure_factors = failure_factors

  // Upsert outcome
  const { data: outcome, error } = await supabase
    .from('opportunity_outcomes')
    .upsert(outcomeData, { onConflict: 'user_id,opportunity_id' })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to record outcome', details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    id: outcome.id,
    outcome_type: outcome.outcome_type,
    quality_score: outcome.quality_score,
    message: 'Outcome recorded successfully'
  }, { status: 201 })
}

// GET /api/outcomes?user_id=xxx - Get user's outcomes
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  const outcomeType = searchParams.get('outcome_type')

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  let query = supabase
    .from('opportunity_outcomes')
    .select(`
      *,
      trend_opportunities (
        id,
        trend_id,
        opportunity_score,
        suggested_actions,
        detected_trends (
          theme,
          description
        )
      )
    `)
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })

  if (outcomeType && VALID_OUTCOME_TYPES.includes(outcomeType as OutcomeType)) {
    query = query.eq('outcome_type', outcomeType)
  }

  const { data: outcomes, error } = await query

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch outcomes', details: error.message },
      { status: 500 }
    )
  }

  // Calculate summary stats
  const stats = {
    total: outcomes?.length || 0,
    explored: outcomes?.filter(o => o.outcome_type === 'explored').length || 0,
    started: outcomes?.filter(o => o.outcome_type === 'started').length || 0,
    completed: outcomes?.filter(o => o.outcome_type === 'completed').length || 0,
    abandoned: outcomes?.filter(o => o.outcome_type === 'abandoned').length || 0,
    passed: outcomes?.filter(o => o.outcome_type === 'passed').length || 0,
    completion_rate: 0
  }

  // Completion rate = completed / (started + completed + abandoned)
  const attempted = stats.started + stats.completed + stats.abandoned
  if (attempted > 0) {
    stats.completion_rate = Math.round((stats.completed / attempted) * 100)
  }

  return NextResponse.json({
    outcomes: outcomes || [],
    stats
  })
}
