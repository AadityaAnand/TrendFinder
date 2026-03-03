import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const ADMIN_KEY = process.env.CHAT_ADMIN_KEY

// GET /api/admin/chat-metrics?key=CHAT_ADMIN_KEY
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const db = getServerSupabase()

  // Run all queries in parallel
  const [
    sessionsResult,
    messagesResult,
    feedbackResult,
    queryTypeResult,
    variantResult,
    lowRatedResult,
    confidenceResult,
  ] = await Promise.all([
    // Total sessions
    db.from('opportunity_chat_sessions').select('id', { count: 'exact', head: true }),

    // Total messages
    db.from('opportunity_chat_messages').select('id', { count: 'exact', head: true }),

    // Feedback breakdown
    db.from('chat_message_feedback').select('feedback_type'),

    // Query type distribution
    db
      .from('opportunity_chat_messages')
      .select('query_type')
      .eq('role', 'assistant')
      .not('query_type', 'is', null),

    // A/B variant stats
    db
      .from('opportunity_chat_messages')
      .select('query_type, confidence_score, metadata')
      .eq('role', 'assistant')
      .not('metadata', 'is', null),

    // Recent low-rated responses
    db
      .from('chat_message_feedback')
      .select(`
        id,
        feedback_type,
        feedback_text,
        created_at,
        message_id,
        opportunity_chat_messages!inner(content, query_type, confidence_score, session_id)
      `)
      .eq('feedback_type', 'thumbs_down')
      .order('created_at', { ascending: false })
      .limit(10),

    // Confidence score distribution
    db
      .from('opportunity_chat_messages')
      .select('confidence_score, query_type')
      .eq('role', 'assistant')
      .not('confidence_score', 'is', null)
      .gte('confidence_score', 0),
  ])

  // Overview
  const totalSessions = sessionsResult.count || 0
  const totalMessages = messagesResult.count || 0
  const feedbackRows = feedbackResult.data || []
  const thumbsUp = feedbackRows.filter(f => f.feedback_type === 'thumbs_up').length
  const thumbsDown = feedbackRows.filter(f => f.feedback_type === 'thumbs_down').length
  const satisfactionRate = (thumbsUp + thumbsDown) > 0
    ? Math.round((thumbsUp / (thumbsUp + thumbsDown)) * 100)
    : null

  // Query type distribution
  const queryTypeCounts: Record<string, number> = {}
  for (const row of (queryTypeResult.data || [])) {
    const qt = row.query_type || 'unknown'
    queryTypeCounts[qt] = (queryTypeCounts[qt] || 0) + 1
  }

  // Failure modes (guard triggers)
  const guardTypes = ['temporal_guard', 'opinion_guard', 'feasibility_guard', 'error_fallback', 'evidence_fallback']
  const failureModes = guardTypes.map(type => ({
    type,
    count: queryTypeCounts[type] || 0,
  })).filter(f => f.count > 0).sort((a, b) => b.count - a.count)

  // A/B variant comparison
  const variantRows = variantResult.data || []
  const variantStats: Record<string, { count: number; totalConfidence: number; thumbsUp: number; thumbsDown: number }> = {}
  for (const row of variantRows) {
    const meta = row.metadata as Record<string, unknown> | null
    const variant = (meta?.variant as string) || 'unknown'
    if (!variantStats[variant]) {
      variantStats[variant] = { count: 0, totalConfidence: 0, thumbsUp: 0, thumbsDown: 0 }
    }
    variantStats[variant].count++
    if (typeof row.confidence_score === 'number') {
      variantStats[variant].totalConfidence += row.confidence_score
    }
  }

  // Add feedback counts per variant (simplified — cross-join via message metadata)
  for (const fb of feedbackRows) {
    // We don't have variant on feedback directly, so skip for now
    void fb
  }

  const variantComparison = Object.entries(variantStats).map(([variant, stats]) => ({
    variant,
    message_count: stats.count,
    avg_confidence: stats.count > 0 ? Math.round((stats.totalConfidence / stats.count) * 100) / 100 : null,
  }))

  // Confidence calibration
  const confRows = confidenceResult.data || []
  const confBuckets = {
    high: confRows.filter(r => (r.confidence_score || 0) >= 0.8).length,
    medium: confRows.filter(r => (r.confidence_score || 0) >= 0.5 && (r.confidence_score || 0) < 0.8).length,
    low: confRows.filter(r => (r.confidence_score || 0) < 0.5).length,
  }

  // Recent low-rated responses
  const recentLowRated = (lowRatedResult.data || []).map(row => {
    const msg = row.opportunity_chat_messages as unknown as {
      content: string
      query_type: string | null
      confidence_score: number | null
      session_id: string
    } | null
    return {
      feedback_id: row.id,
      feedback_text: row.feedback_text,
      created_at: row.created_at,
      message_content: msg?.content?.slice(0, 200) || '',
      query_type: msg?.query_type,
      confidence_score: msg?.confidence_score,
      session_id: msg?.session_id,
    }
  })

  return NextResponse.json({
    overview: {
      total_sessions: totalSessions,
      total_messages: totalMessages,
      thumbs_up: thumbsUp,
      thumbs_down: thumbsDown,
      satisfaction_rate_pct: satisfactionRate,
    },
    query_type_distribution: queryTypeCounts,
    failure_modes: failureModes,
    confidence_distribution: confBuckets,
    variant_comparison: variantComparison,
    recent_low_rated: recentLowRated,
  })
}
