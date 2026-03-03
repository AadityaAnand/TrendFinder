import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET /api/chat/session/[id]/messages?limit=50&offset=0 — paginated messages
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getServerSupabase()
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  const { data: messages, error, count } = await db
    .from('opportunity_chat_messages')
    .select('id, role, content, evidence_citations, confidence_score, query_type, metadata, created_at', { count: 'exact' })
    .eq('session_id', id)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  return NextResponse.json({
    messages: messages || [],
    total: count || 0,
    limit,
    offset,
  })
}
