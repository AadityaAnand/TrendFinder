import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const VALID_FEEDBACK_TYPES = ['saved', 'dismissed', 'acted', 'not_relevant', 'brief_helpful', 'brief_not_helpful'] as const
type FeedbackType = typeof VALID_FEEDBACK_TYPES[number]
const BRIEF_FEEDBACK_TYPES = ['brief_helpful', 'brief_not_helpful']

export async function POST(request: Request) {
  const supabase = getServerSupabase()
  const body = await request.json()
  const { user_id, opportunity_id, snapshot_id, feedback_type, note } = body

  // Validate required fields (snapshot_id is optional for brief feedback)
  const isBriefFeedback = BRIEF_FEEDBACK_TYPES.includes(feedback_type)
  if (!user_id || !opportunity_id || (!isBriefFeedback && !snapshot_id) || !feedback_type) {
    return NextResponse.json(
      { error: 'user_id, opportunity_id, snapshot_id, and feedback_type are required' },
      { status: 400 }
    )
  }

  // Validate feedback type
  if (!VALID_FEEDBACK_TYPES.includes(feedback_type as FeedbackType)) {
    return NextResponse.json(
      { error: `Invalid feedback_type. Must be one of: ${VALID_FEEDBACK_TYPES.join(', ')}` },
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

  // Upsert feedback (update if exists, insert if not)
  const { data: feedback, error } = await supabase
    .from('user_opportunity_feedback')
    .upsert(
      {
        user_id,
        opportunity_id,
        snapshot_id: snapshot_id || null,
        feedback_type,
        note: note || null,
        created_at: new Date().toISOString()
      },
      {
        onConflict: 'user_id,opportunity_id'
      }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to record feedback', details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    id: feedback.id,
    feedback_type: feedback.feedback_type,
    message: 'Feedback recorded successfully'
  }, { status: 201 })
}

// GET /api/feedback?user_id=xxx - Get user's feedback history
export async function GET(request: Request) {
  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  const feedbackType = searchParams.get('feedback_type')

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  let query = supabase
    .from('user_opportunity_feedback')
    .select(`
      *,
      trend_opportunities (
        id,
        action_type,
        action_title,
        why_now,
        trend_id
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (feedbackType && VALID_FEEDBACK_TYPES.includes(feedbackType as FeedbackType)) {
    query = query.eq('feedback_type', feedbackType)
  }

  const { data: feedback, error } = await query

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch feedback', details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    feedback: feedback || [],
    count: feedback?.length || 0
  })
}

// DELETE /api/feedback?user_id=xxx&opportunity_id=xxx - Remove feedback
export async function DELETE(request: Request) {
  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  const opportunityId = searchParams.get('opportunity_id')

  if (!userId || !opportunityId) {
    return NextResponse.json(
      { error: 'user_id and opportunity_id are required' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('user_opportunity_feedback')
    .delete()
    .eq('user_id', userId)
    .eq('opportunity_id', opportunityId)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete feedback', details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    message: 'Feedback removed successfully'
  })
}
