import { getServerSupabase, getLatestSnapshot } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerSupabase()
  const { id: trendId } = await params

  const snapshot = await getLatestSnapshot(supabase)

  if (!snapshot) {
    return NextResponse.json(
      { error: 'No snapshot available' },
      { status: 404 }
    )
  }

  const { data: intel, error } = await supabase
    .from('trend_competitive_intelligence')
    .select('*')
    .eq('trend_id', trendId)
    .eq('snapshot_id', snapshot.id)
    .single()

  if (error || !intel) {
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

    return NextResponse.json({
      intelligence: latestIntel,
      signals: [],
      wedges: [],
      is_current: false
    })
  }

  const { data: signals } = await supabase
    .from('competitive_signals')
    .select('signal_type, value, normalized_value, source, notes')
    .eq('trend_id', trendId)
    .eq('snapshot_id', snapshot.id)

  const { data: wedges } = await supabase
    .from('trend_wedges')
    .select('wedge_type, trigger_reason, confidence')
    .eq('trend_id', trendId)
    .eq('snapshot_id', snapshot.id)

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
