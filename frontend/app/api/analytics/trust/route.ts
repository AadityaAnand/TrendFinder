import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET /api/analytics/trust - Get trust analytics (internal use)
export async function GET(request: Request) {
  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const daysBack = parseInt(searchParams.get('days') || '30', 10)

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysBack)
  const cutoff = cutoffDate.toISOString()

  // 1. Qualification stats
  const { data: opportunities } = await supabase
    .from('trend_opportunities')
    .select('id, qualified, rejection_reasons, created_at')
    .gte('created_at', cutoff)

  const qualifiedOpps = opportunities?.filter(o => o.qualified) || []
  const rejectedOpps = opportunities?.filter(o => !o.qualified) || []

  const rejectionReasons: Record<string, number> = {}
  for (const opp of rejectedOpps) {
    for (const reason of (opp.rejection_reasons || [])) {
      rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1
    }
  }

  // 2. Feedback stats
  const { data: feedback } = await supabase
    .from('user_opportunity_feedback')
    .select('feedback_type, user_id')
    .gte('created_at', cutoff)

  const feedbackByType: Record<string, number> = {}
  const uniqueUsers = new Set<string>()

  for (const fb of (feedback || [])) {
    feedbackByType[fb.feedback_type] = (feedbackByType[fb.feedback_type] || 0) + 1
    uniqueUsers.add(fb.user_id)
  }

  const totalFeedback = feedback?.length || 0
  const saved = feedbackByType['saved'] || 0
  const acted = feedbackByType['acted'] || 0
  const dismissed = (feedbackByType['dismissed'] || 0) + (feedbackByType['not_relevant'] || 0)

  // 3. Outcome stats
  const { data: outcomes } = await supabase
    .from('opportunity_outcomes')
    .select('outcome_type')
    .gte('recorded_at', cutoff)

  const outcomesByType: Record<string, number> = {}
  for (const outcome of (outcomes || [])) {
    outcomesByType[outcome.outcome_type] = (outcomesByType[outcome.outcome_type] || 0) + 1
  }

  const started = outcomesByType['started'] || 0
  const completed = outcomesByType['completed'] || 0
  const abandoned = outcomesByType['abandoned'] || 0

  // 4. Time to qualification (from trajectories)
  const { data: trajectories } = await supabase
    .from('trend_trajectories')
    .select('first_seen_at, last_qualified_at, qualified_count')
    .gt('qualified_count', 0)

  const daysToQualify: number[] = []
  for (const traj of (trajectories || [])) {
    if (traj.first_seen_at && traj.last_qualified_at) {
      const firstSeen = new Date(traj.first_seen_at)
      const qualified = new Date(traj.last_qualified_at)
      const days = Math.floor((qualified.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24))
      if (days >= 0) {
        daysToQualify.push(days)
      }
    }
  }

  daysToQualify.sort((a, b) => a - b)
  const n = daysToQualify.length

  // Build response
  return NextResponse.json({
    generated_at: new Date().toISOString(),
    period_days: daysBack,

    qualification: {
      total_opportunities: opportunities?.length || 0,
      qualified_count: qualifiedOpps.length,
      rejected_count: rejectedOpps.length,
      qualification_rate: opportunities?.length
        ? Math.round((qualifiedOpps.length / opportunities.length) * 1000) / 10
        : 0,
      rejection_reasons: rejectionReasons
    },

    time_to_qualification: n > 0 ? {
      sample_size: n,
      min_days: daysToQualify[0],
      max_days: daysToQualify[n - 1],
      median_days: daysToQualify[Math.floor(n / 2)],
      avg_days: Math.round(daysToQualify.reduce((a, b) => a + b, 0) / n * 10) / 10
    } : null,

    user_engagement: {
      total_feedback: totalFeedback,
      unique_users: uniqueUsers.size,
      feedback_breakdown: feedbackByType,
      save_rate: totalFeedback > 0 ? Math.round((saved / totalFeedback) * 1000) / 10 : 0,
      dismiss_rate: totalFeedback > 0 ? Math.round((dismissed / totalFeedback) * 1000) / 10 : 0,
      positive_ratio: totalFeedback > 0 ? Math.round(((saved + acted) / totalFeedback) * 100) / 100 : 0
    },

    outcomes: {
      total: outcomes?.length || 0,
      breakdown: outcomesByType,
      started,
      completed,
      abandoned,
      completion_rate: started > 0 ? Math.round((completed / started) * 1000) / 10 : 0
    },

    health_indicators: {
      has_qualified_opportunities: qualifiedOpps.length > 0,
      has_user_engagement: totalFeedback > 0,
      has_outcomes: (outcomes?.length || 0) > 0,
      positive_feedback_dominant: (saved + acted) > dismissed
    }
  })
}
