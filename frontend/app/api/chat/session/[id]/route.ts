import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// DELETE /api/chat/session/[id]?user_id=xxx — delete session and all messages
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getServerSupabase()
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  // Verify ownership
  const { data: session } = await db
    .from('opportunity_chat_sessions')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.user_id !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { error } = await db.from('opportunity_chat_sessions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })

  return NextResponse.json({ message: 'Session deleted' })
}
