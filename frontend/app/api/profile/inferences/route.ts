import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET /api/profile/inferences?user_id=xxx - Get inferred preferences
export async function GET(request: Request) {
  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  const { data: inferences, error } = await supabase
    .from('user_inferred_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !inferences) {
    return NextResponse.json(
      { error: 'No inferences found', has_inferences: false },
      { status: 404 }
    )
  }

  return NextResponse.json({
    has_inferences: true,
    inferred_roles: inferences.inferred_roles || [],
    inferred_domains: inferences.inferred_domains || [],
    inferred_stack: inferences.inferred_stack || [],
    inferred_risk_tolerance: inferences.inferred_risk_tolerance,
    confidence_scores: inferences.confidence_scores || {},
    evidence_summary: inferences.evidence_summary || {},
    user_accepted: inferences.user_accepted || false,
    user_rejected_items: inferences.user_rejected_items || [],
    inference_version: inferences.inference_version,
    last_computed_at: inferences.last_computed_at
  })
}

// POST /api/profile/inferences - Accept or reject inferences
export async function POST(request: Request) {
  const supabase = getServerSupabase()
  const body = await request.json()
  const { user_id, action, item } = body

  if (!user_id || !action) {
    return NextResponse.json(
      { error: 'user_id and action are required' },
      { status: 400 }
    )
  }

  if (action === 'accept') {
    // Accept all inferences
    const { error } = await supabase
      .from('user_inferred_preferences')
      .update({ user_accepted: true, updated_at: new Date().toISOString() })
      .eq('user_id', user_id)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to accept inferences', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ status: 'accepted' })
  }

  if (action === 'reject' && item) {
    // Reject a specific inferred item
    const { data: current } = await supabase
      .from('user_inferred_preferences')
      .select('user_rejected_items')
      .eq('user_id', user_id)
      .single()

    const rejected = current?.user_rejected_items || []
    if (!rejected.includes(item)) {
      rejected.push(item)
    }

    const { error } = await supabase
      .from('user_inferred_preferences')
      .update({
        user_rejected_items: rejected,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user_id)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to reject item', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ status: 'rejected', item })
  }

  if (action === 'decline') {
    // Decline all inferences (opt-out)
    const { error } = await supabase
      .from('user_inferred_preferences')
      .update({ user_accepted: false, updated_at: new Date().toISOString() })
      .eq('user_id', user_id)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to decline inferences', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ status: 'declined' })
  }

  return NextResponse.json(
    { error: 'Invalid action. Must be accept, reject, or decline' },
    { status: 400 }
  )
}
