import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  const includeSeen = searchParams.get('include_seen') === 'true'
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  let query = supabase
    .from('user_alerts')
    .select(`
      *,
      detected_trends (
        id,
        theme
      )
    `)
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!includeSeen) {
    query = query.is('seen_at', null)
  }

  const { data: alerts, error } = await query

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: error.message },
      { status: 500 }
    )
  }

  // Count unseen
  const { count: unseenCount } = await supabase
    .from('user_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('seen_at', null)
    .is('dismissed_at', null)

  // Group by priority
  const byPriority = {
    urgent: (alerts || []).filter(a => a.priority === 'urgent'),
    high: (alerts || []).filter(a => a.priority === 'high'),
    normal: (alerts || []).filter(a => a.priority === 'normal'),
    low: (alerts || []).filter(a => a.priority === 'low')
  }

  return NextResponse.json({
    alerts: alerts || [],
    unseen_count: unseenCount || 0,
    by_priority: byPriority
  })
}

// PATCH /api/alerts - Mark alerts as seen or dismissed
export async function PATCH(request: Request) {
  const supabase = getServerSupabase()
  try {
    const body = await request.json()
    const { alert_id, alert_ids, action } = body

    if (!action || !['seen', 'dismissed', 'actioned'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be one of: seen, dismissed, actioned' },
        { status: 400 }
      )
    }

    const ids = alert_ids || (alert_id ? [alert_id] : [])
    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'alert_id or alert_ids is required' },
        { status: 400 }
      )
    }

    const updateField = `${action}_at`
    const updateData: Record<string, string> = {}
    updateData[updateField] = new Date().toISOString()

    const { data, error } = await supabase
      .from('user_alerts')
      .update(updateData)
      .in('id', ids)
      .select()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update alerts', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      updated: data?.length || 0,
      action
    })
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
