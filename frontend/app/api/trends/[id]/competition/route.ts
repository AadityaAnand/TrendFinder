import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// GET /api/trends/[id]/competition - Get competitive intelligence for a trend
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

  // Get competitive intelligence
  const { data: intel, error } = await supabase
    .from('trend_competitive_intelligence')
    .select('*')
    .eq('trend_id', trendId)
    .eq('snapshot_id', snapshot.id)
    .single()

  if (error || !intel) {
    // Try latest available
    const { data: latestIntel } = await supabase
      .from('trend_competitive_intelligence')
      .select('*')
      .eq('trend_id', trendId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!latestIntel) {
      return NextResponse.json(
        { error: 'No competitive data available for this trend' },
        { status: 404 }
      )
    }

    // Return with stale marker
    return NextResponse.json({
      intelligence: latestIntel,
      signals: [],
      wedges: [],
      is_current: false
    })
  }

  // Get raw signals
  const { data: signals } = await supabase
    .from('competitive_signals')
    .select('signal_type, value, normalized_value, source, notes')
    .eq('trend_id', trendId)
    .eq('snapshot_id', snapshot.id)

  // Get wedges
  const { data: wedges } = await supabase
    .from('trend_wedges')
    .select('wedge_type, trigger_reason, confidence')
    .eq('trend_id', trendId)
    .eq('snapshot_id', snapshot.id)

  // Get competition history
  const { data: history } = await supabase
    .from('trend_competitive_intelligence')
    .select('saturation_score, competition_level, confidence, created_at')
    .eq('trend_id', trendId)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    intelligence: {
      saturation_score: intel.saturation_score,
      competition_level: intel.competition_level,
      confidence: intel.confidence,
      confidence_reasons: intel.confidence_reasons,
      signals_used: intel.signals_used,
      source_types_used: intel.source_types_used,
      method_version: intel.method_version
    },
    signals: signals || [],
    wedges: wedges || [],
    history: history || [],
    snapshot_id: snapshot.id,
    is_current: true
  })
}
