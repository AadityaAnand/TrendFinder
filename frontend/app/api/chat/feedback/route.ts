import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// POST /api/chat/feedback — submit thumbs up/down on an assistant message
export async function POST(request: Request) {
  const db = getServerSupabase()
  const body = await request.json()
  const { message_id, user_id, feedback_type, feedback_text } = body

  if (!message_id || !user_id || !feedback_type) {
    return NextResponse.json({ error: 'message_id, user_id, and feedback_type are required' }, { status: 400 })
  }

  if (!['thumbs_up', 'thumbs_down'].includes(feedback_type)) {
    return NextResponse.json({ error: 'feedback_type must be thumbs_up or thumbs_down' }, { status: 400 })
  }

  if (feedback_text && typeof feedback_text !== 'string') {
    return NextResponse.json({ error: 'feedback_text must be a string' }, { status: 400 })
  }

  if (feedback_text && feedback_text.length > 500) {
    return NextResponse.json({ error: 'feedback_text too long (max 500 characters)' }, { status: 400 })
  }

  // Verify the message exists and belongs to the user's session
  const { data: message } = await db
    .from('opportunity_chat_messages')
    .select('id, role, session_id, opportunity_chat_sessions!inner(user_id)')
    .eq('id', message_id)
    .single()

  if (!message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  // Only allow feedback on assistant messages
  if (message.role !== 'assistant') {
    return NextResponse.json({ error: 'Feedback can only be submitted on assistant messages' }, { status: 400 })
  }

  // Verify the user owns the session
  const sessions = message.opportunity_chat_sessions as unknown as { user_id: string } | { user_id: string }[]
  const sessionUserId = Array.isArray(sessions) ? sessions[0]?.user_id : sessions?.user_id
  if (sessionUserId !== user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Upsert feedback (one feedback per user per message)
  const { error } = await db
    .from('chat_message_feedback')
    .upsert(
      {
        message_id,
        user_id,
        feedback_type,
        feedback_text: feedback_text?.trim() || null,
      },
      { onConflict: 'message_id,user_id' }
    )

  if (error) {
    return NextResponse.json({ error: 'Failed to save feedback', details: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
