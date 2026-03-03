import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// POST /api/chat/session — create a new chat session
export async function POST(request: Request) {
  const db = getServerSupabase()
  const body = await request.json()
  const { trend_id, user_id } = body

  if (!trend_id || !user_id) {
    return NextResponse.json({ error: 'trend_id and user_id are required' }, { status: 400 })
  }

  // Verify user exists
  const { data: user } = await db.from('user_profiles').select('id').eq('id', user_id).single()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Assign A/B variant by hashing user_id (deterministic alternation)
  const { count } = await db
    .from('opportunity_chat_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user_id)
  const variant = ((count || 0) % 2 === 0) ? 'prompt_v1' : 'prompt_v2'

  const { data: session, error } = await db
    .from('opportunity_chat_sessions')
    .insert({ trend_id, user_id, variant })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create session', details: error.message }, { status: 500 })
  }

  return NextResponse.json({ session_id: session.id, variant: session.variant }, { status: 201 })
}

// GET /api/chat/session?trend_id=xxx&user_id=xxx — list sessions with preview
export async function GET(request: Request) {
  const db = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const trendId = searchParams.get('trend_id')
  const userId = searchParams.get('user_id')

  if (!trendId || !userId) {
    return NextResponse.json({ error: 'trend_id and user_id are required' }, { status: 400 })
  }

  const { data: sessions, error } = await db
    .from('opportunity_chat_sessions')
    .select('id, message_count, updated_at, created_at, variant')
    .eq('trend_id', trendId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }

  // Fetch preview (last assistant message) for each session
  const sessionIds = (sessions || []).map(s => s.id)
  let previewMap: Record<string, string> = {}

  if (sessionIds.length > 0) {
    const { data: previews } = await db
      .from('opportunity_chat_messages')
      .select('session_id, content, role')
      .in('session_id', sessionIds)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(sessionIds.length)

    for (const p of (previews || [])) {
      if (!previewMap[p.session_id]) {
        previewMap[p.session_id] = p.content.slice(0, 80) + (p.content.length > 80 ? '…' : '')
      }
    }
  }

  const enriched = (sessions || []).map(s => ({
    ...s,
    preview: previewMap[s.id] || null,
  }))

  return NextResponse.json({ sessions: enriched })
}
