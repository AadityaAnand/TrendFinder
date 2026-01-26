import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// GET /api/alerts/digest?user_id=xxx - Get alert digest summary
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  const days = parseInt(searchParams.get('days') || '7', 10)

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  // Get alerts from the time window
  const { data: alerts, error } = await supabase
    .from('user_alerts')
    .select(`
      alert_type,
      priority,
      confidence,
      created_at,
      seen_at,
      payload,
      detected_trends (
        id,
        theme
      )
    `)
    .eq('user_id', userId)
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: error.message },
      { status: 500 }
    )
  }

  const alertList = alerts || []

  // Compute digest statistics
  const digest = {
    period_days: days,
    total_alerts: alertList.length,
    unseen_alerts: alertList.filter(a => !a.seen_at).length,

    by_type: {} as Record<string, number>,
    by_priority: {
      urgent: 0,
      high: 0,
      normal: 0,
      low: 0
    } as Record<string, number>,

    // Key highlights
    highlights: [] as Array<{
      type: string
      trend_theme: string
      message: string
      created_at: string
    }>,

    // Trends with most alerts
    top_trends: [] as Array<{
      trend_id: string
      theme: string
      alert_count: number
    }>
  }

  // Count by type and priority
  const trendCounts: Record<string, { id: string; theme: string; count: number }> = {}

  for (const alert of alertList) {
    // By type
    digest.by_type[alert.alert_type] = (digest.by_type[alert.alert_type] || 0) + 1

    // By priority
    if (alert.priority && digest.by_priority[alert.priority] !== undefined) {
      digest.by_priority[alert.priority]++
    }

    // Track trends (detected_trends is a single object from the join)
    const trendData = alert.detected_trends as unknown as { id: string; theme: string } | null
    if (trendData && typeof trendData === 'object' && 'id' in trendData) {
      if (!trendCounts[trendData.id]) {
        trendCounts[trendData.id] = { id: trendData.id, theme: trendData.theme, count: 0 }
      }
      trendCounts[trendData.id].count++
    }

    // Add to highlights if high priority
    if (alert.priority === 'urgent' || alert.priority === 'high') {
      const trendTheme = (trendData && typeof trendData === 'object' && 'theme' in trendData) ? trendData.theme : 'Unknown trend'
      let message = ''

      switch (alert.alert_type) {
        case 'entered_early_edge':
          message = 'Entered early edge timing window'
          break
        case 'became_eligible':
          message = 'Became a qualified opportunity'
          break
        case 'expiry_risk_high':
          message = 'High expiry risk - window closing'
          break
        case 'momentum_breakout':
          message = 'Significant momentum increase detected'
          break
        default:
          message = alert.alert_type.replace(/_/g, ' ')
      }

      if (digest.highlights.length < 5) {
        digest.highlights.push({
          type: alert.alert_type,
          trend_theme: trendTheme,
          message,
          created_at: alert.created_at
        })
      }
    }
  }

  // Top trends by alert count
  digest.top_trends = Object.values(trendCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(t => ({ trend_id: t.id, theme: t.theme, alert_count: t.count }))

  return NextResponse.json(digest)
}
