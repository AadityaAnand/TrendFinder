import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET /api/analytics/confidence - Get calibration metrics and predictions
export async function GET(request: Request) {
  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const entityType = searchParams.get('entity_type')
  const entityId = searchParams.get('entity_id')
  const predictionType = searchParams.get('prediction_type')

  // If specific entity requested, return its predictions
  if (entityType && entityId) {
    const query = supabase
      .from('confidence_predictions')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('predicted_at', { ascending: false })

    if (predictionType) {
      query.eq('prediction_type', predictionType)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch predictions', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ predictions: data })
  }

  // Otherwise return calibration overview
  // Get latest metrics by prediction type
  const { data: metrics, error: metricsError } = await supabase
    .from('calibration_metrics')
    .select('*')
    .order('computed_at', { ascending: false })
    .limit(20)

  if (metricsError) {
    return NextResponse.json(
      { error: 'Failed to fetch metrics', details: metricsError.message },
      { status: 500 }
    )
  }

  // Group by prediction type (latest only)
  const metricsByType: Record<string, unknown> = {}
  for (const m of metrics || []) {
    if (!metricsByType[m.prediction_type]) {
      metricsByType[m.prediction_type] = m
    }
  }

  // Get active adjustments
  const { data: adjustments } = await supabase
    .from('confidence_adjustments')
    .select('*')
    .eq('active', true)

  // Get recent predictions summary
  const { data: recentPredictions } = await supabase
    .from('confidence_predictions')
    .select('prediction_type, confidence_score, resolved_at, actual_outcome')
    .order('predicted_at', { ascending: false })
    .limit(100)

  // Compute summary stats
  const resolved = (recentPredictions || []).filter(p => p.resolved_at)
  const unresolved = (recentPredictions || []).filter(p => !p.resolved_at)

  const avgConfidence = resolved.length > 0
    ? resolved.reduce((sum, p) => sum + (p.confidence_score || 0), 0) / resolved.length
    : 0

  const accuracyCount = resolved.filter(p =>
    (p.confidence_score >= 0.5) === p.actual_outcome
  ).length

  return NextResponse.json({
    metrics_by_type: metricsByType,
    active_adjustments: adjustments || [],
    summary: {
      total_resolved: resolved.length,
      total_unresolved: unresolved.length,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      prediction_accuracy: resolved.length > 0
        ? Math.round((accuracyCount / resolved.length) * 100) / 100
        : null,
      prediction_types: Object.keys(metricsByType)
    }
  })
}

// POST /api/analytics/confidence - Resolve a prediction
export async function POST(request: Request) {
  const supabase = getServerSupabase()
  try {
    const body = await request.json()
    const { prediction_id, actual_outcome, actual_value, note } = body

    if (!prediction_id || actual_outcome === undefined) {
      return NextResponse.json(
        { error: 'prediction_id and actual_outcome are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('confidence_predictions')
      .update({
        actual_outcome,
        actual_value,
        resolved_at: new Date().toISOString(),
        resolution_note: note
      })
      .eq('id', prediction_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to resolve prediction', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ resolved: data })
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
