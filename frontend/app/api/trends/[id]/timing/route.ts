import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// GET /api/trends/[id]/timing - Get timing intelligence for a trend
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trendId } = await params

  // Get latest snapshot
  const { data: snapshot } = await supabase
    .from('trend_snapshots')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!snapshot) {
    return NextResponse.json(
      { error: 'No snapshot available' },
      { status: 404 }
    )
  }

  // Get timing signal for this trend
  const { data: timing, error } = await supabase
    .from('trend_timing_signals')
    .select('*')
    .eq('trend_id', trendId)
    .eq('snapshot_id', snapshot.id)
    .single()

  if (error || !timing) {
    // Try to get the most recent timing for this trend
    const { data: latestTiming } = await supabase
      .from('trend_timing_signals')
      .select('*')
      .eq('trend_id', trendId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single()

    if (latestTiming) {
      return NextResponse.json({
        timing: latestTiming,
        snapshot_id: latestTiming.snapshot_id,
        is_current: false
      })
    }

    return NextResponse.json(
      { error: 'No timing data available for this trend' },
      { status: 404 }
    )
  }

  // Get timing history for this trend
  const { data: history } = await supabase
    .from('trend_timing_signals')
    .select('timing_label, timing_confidence, expiry_risk, computed_at')
    .eq('trend_id', trendId)
    .order('computed_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    timing: {
      label: timing.timing_label,
      confidence: timing.timing_confidence,
      reasons: timing.timing_reasons,
      guards: timing.timing_guards,
      inflections: timing.inflections_detected,
      expiry_risk: timing.expiry_risk,
      expiry_reasons: timing.expiry_reasons,
      inputs: timing.inputs_used,
      model_version: timing.model_version,
      computed_at: timing.computed_at
    },
    history: history || [],
    snapshot_id: snapshot.id,
    is_current: true
  })
}
