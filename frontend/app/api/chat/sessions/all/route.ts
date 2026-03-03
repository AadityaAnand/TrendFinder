import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET /api/chat/sessions/all?user_id=xxx — all chat sessions for a user (all trends)
export async function GET(request: Request) {
  const db = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  const { data: sessions, error } = await db
    .from('opportunity_chat_sessions')
    .select(`
      id,
      message_count,
      updated_at,
      created_at,
      trend_id,
      detected_trends!inner(theme)
    `)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }

  type DetectedTrend = { theme: string } | { theme: string }[]

  const enriched = (sessions || []).map(s => ({
    id: s.id,
    trend_id: s.trend_id,
    trend_name: (() => {
      const t = s.detected_trends as DetectedTrend | null
      if (!t) return 'Unknown trend'
      return Array.isArray(t) ? (t[0]?.theme ?? 'Unknown trend') : t.theme
    })(),
    message_count: s.message_count,
    updated_at: s.updated_at,
    created_at: s.created_at,
  }))

  return NextResponse.json({ sessions: enriched })
}
