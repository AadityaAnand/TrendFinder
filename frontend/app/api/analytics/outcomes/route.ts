import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET /api/analytics/outcomes - Get outcome intelligence data
export async function GET(request: Request) {
  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const trendId = searchParams.get('trend_id')
  const opportunityId = searchParams.get('opportunity_id')

  // If specific opportunity requested
  if (opportunityId) {
    const { data: stats, error } = await supabase
      .from('opportunity_outcome_stats')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .single()

    if (error || !stats) {
      return NextResponse.json(
        { error: 'No outcome stats found for this opportunity' },
        { status: 404 }
      )
    }

    return NextResponse.json({ opportunity_stats: stats })
  }

  // If specific trend requested
  if (trendId) {
    const { data: trendStats } = await supabase
      .from('trend_outcome_stats')
      .select('*')
      .eq('trend_id', trendId)
      .single()

    // Get all opportunity stats for this trend
    const { data: opportunities } = await supabase
      .from('trend_opportunities')
      .select('id')
      .eq('trend_id', trendId)

    const oppIds = opportunities?.map(o => o.id) || []

    const { data: oppStats } = await supabase
      .from('opportunity_outcome_stats')
      .select('*')
      .in('opportunity_id', oppIds)

    // Get misclassifications
    const { data: misclassifications } = await supabase
      .from('trend_misclassifications')
      .select('*')
      .eq('trend_id', trendId)
      .order('detected_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
      trend_stats: trendStats || null,
      opportunity_stats: oppStats || [],
      misclassifications: misclassifications || [],
      archetype: trendStats?.trend_archetype || null
    })
  }

  // Default: return aggregate stats across all trends
  const { data: allTrendStats } = await supabase
    .from('trend_outcome_stats')
    .select('*')
    .order('total_user_completions', { ascending: false })
    .limit(20)

  // Get recent misclassifications
  const { data: recentMisclass } = await supabase
    .from('trend_misclassifications')
    .select(`
      *,
      detected_trends (theme)
    `)
    .neq('misclassification_type', 'none')
    .order('detected_at', { ascending: false })
    .limit(10)

  // Calculate aggregate metrics
  const stats = allTrendStats || []
  const totalStarts = stats.reduce((sum, s) => sum + (s.total_user_starts || 0), 0)
  const totalCompletions = stats.reduce((sum, s) => sum + (s.total_user_completions || 0), 0)

  // Archetype distribution
  const archetypes: Record<string, number> = {}
  for (const s of stats) {
    if (s.trend_archetype) {
      archetypes[s.trend_archetype] = (archetypes[s.trend_archetype] || 0) + 1
    }
  }

  // Misclassification summary
  const misclassTypes: Record<string, number> = {}
  for (const m of (recentMisclass || [])) {
    misclassTypes[m.misclassification_type] = (misclassTypes[m.misclassification_type] || 0) + 1
  }

  return NextResponse.json({
    summary: {
      trends_with_outcomes: stats.length,
      total_user_starts: totalStarts,
      total_user_completions: totalCompletions,
      overall_completion_rate: totalStarts > 0
        ? Math.round((totalCompletions / totalStarts) * 100)
        : 0
    },
    archetype_distribution: archetypes,
    misclassification_summary: misclassTypes,
    top_trends: stats.slice(0, 10).map(s => ({
      trend_id: s.trend_id,
      completions: s.total_user_completions,
      completion_rate: s.avg_completion_rate,
      archetype: s.trend_archetype,
      difficulty: s.execution_difficulty_score
    })),
    recent_misclassifications: (recentMisclass || []).map(m => ({
      trend_id: m.trend_id,
      trend_theme: m.detected_trends?.theme,
      type: m.misclassification_type,
      actual_outcome: m.actual_outcome,
      detected_at: m.detected_at
    }))
  })
}
