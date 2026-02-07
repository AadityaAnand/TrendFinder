import { getServerSupabase, getLatestSnapshot } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = getServerSupabase()
  const snapshot = await getLatestSnapshot(supabase)

  if (!snapshot) {
    return NextResponse.json({ watching: [] })
  }

  const { data: snapshotItems } = await supabase
    .from('trend_snapshot_items')
    .select('trend_id, momentum_score, signal_count')
    .eq('snapshot_id', snapshot.id)
    .gte('signal_count', 2)
    .gt('momentum_score', 0)
    .order('momentum_score', { ascending: false })
    .limit(20)

  if (!snapshotItems || snapshotItems.length === 0) {
    return NextResponse.json({ watching: [] })
  }

  const trendIds = snapshotItems.map(s => s.trend_id)

  const [trendsRes, oppsRes, lifecycleRes] = await Promise.all([
    supabase
      .from('detected_trends')
      .select('id, theme, description')
      .in('id', trendIds),
    supabase
      .from('trend_opportunities')
      .select('trend_id, qualified, suggested_actions')
      .eq('snapshot_id', snapshot.id)
      .in('trend_id', trendIds),
    supabase
      .from('trend_lifecycle_history')
      .select('trend_id, lifecycle_stage, stage_confidence, acceleration_comparable')
      .eq('snapshot_id', snapshot.id)
      .in('trend_id', trendIds),
  ])

  const trendMap = new Map((trendsRes.data || []).map(t => [t.id, t]))
  const oppMap = new Map((oppsRes.data || []).map(o => [o.trend_id, o]))
  const lifecycleMap = new Map((lifecycleRes.data || []).map(l => [l.trend_id, l]))

  const watching = snapshotItems
    .filter(item => {
      const opp = oppMap.get(item.trend_id)
      return !opp?.qualified
    })
    .map(item => {
      const trend = trendMap.get(item.trend_id)
      const opp = oppMap.get(item.trend_id)
      const lifecycle = lifecycleMap.get(item.trend_id)

      const reasons: string[] = []
      if (item.signal_count < 3) {
        reasons.push('Needs more independent evidence')
      }
      if (!opp) {
        reasons.push('No specific build action identified yet')
      } else if (!opp.suggested_actions || (Array.isArray(opp.suggested_actions) && opp.suggested_actions.length === 0)) {
        reasons.push('No specific build action identified yet')
      }
      if (lifecycle && lifecycle.stage_confidence < 0.6) {
        reasons.push('Lifecycle confidence still building')
      }
      if (!lifecycle || !lifecycle.acceleration_comparable) {
        reasons.push('Needs more days of data for comparison')
      }
      if (reasons.length === 0) {
        reasons.push('Collecting more evidence')
      }

      return {
        trend_id: item.trend_id,
        theme: trend?.theme || 'Unknown',
        description: trend?.description || null,
        stage: lifecycle?.lifecycle_stage || null,
        stage_confidence: lifecycle?.stage_confidence || 0,
        comparable: lifecycle?.acceleration_comparable || false,
        signal_count: item.signal_count,
        momentum_score: item.momentum_score,
        reasons,
      }
    })
    .slice(0, 10)

  return NextResponse.json({ watching })
}
