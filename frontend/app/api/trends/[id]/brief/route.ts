import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getLatestSnapshot, getHypothesisDisplayTitle, getTrendDisplayName } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = getServerSupabase()

  const { data: trend } = await supabase
    .from('detected_trends')
    .select('id, theme, status, first_seen')
    .eq('id', id)
    .single()

  if (!trend) {
    return NextResponse.json({ error: 'Trend not found' }, { status: 404 })
  }

  const snapshot = await getLatestSnapshot(supabase)
  if (!snapshot) {
    return NextResponse.json({ error: 'No snapshot available' }, { status: 404 })
  }

  const [
    hypothesisRes,
    intelligenceRes,
    opportunityRes,
    trajectoryRes,
    timingRes,
    competitionRes,
    wedgesRes,
    signalsRes,
    lifecycleRes,
  ] = await Promise.all([
    supabase.from('problem_hypotheses')
      .select('hypothesis_title, hypothesis_summary, hypothesis_status, confidence, who_it_affects, pain_signals, demand_evidence')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id).limit(1).single(),
    supabase.from('trend_intelligence')
      .select('summary, build_ideas, existing_solutions, risks')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id).single(),
    supabase.from('trend_opportunities')
      .select('id, qualified, opportunity_score, suggested_actions, rejection_reasons, demand_hits, independent_artifact_count')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id).single(),
    supabase.from('trend_trajectories')
      .select('trajectory_data, peak_momentum, peak_momentum_at, current_stage, total_snapshots, qualified_count')
      .eq('trend_id', id).single(),
    supabase.from('trend_timing_signals')
      .select('timing_label, confidence, timing_reasons, expiry_risk')
      .eq('trend_id', id).order('computed_at', { ascending: false }).limit(1).single(),
    supabase.from('trend_competitive_intelligence')
      .select('competition_level, saturation_score, confidence')
      .eq('trend_id', id).order('computed_at', { ascending: false }).limit(1).single(),
    supabase.from('trend_wedges')
      .select('wedge_type, trigger_reason, confidence')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id),
    supabase.from('trend_signals')
      .select('raw_signals!inner(title, source, url, score, created_at)')
      .eq('trend_id', id).limit(20),
    supabase.from('trend_lifecycle_history')
      .select('lifecycle_stage, stage_confidence, acceleration_comparable')
      .eq('trend_id', id).eq('snapshot_id', snapshot.id).single(),
  ])

  const parseJson = (v: unknown, fallback: unknown[]) => {
    if (!v) return fallback
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return fallback } }
    return v
  }

  const hypothesis = hypothesisRes.data
  const intelligence = intelligenceRes.data
  const opportunity = opportunityRes.data
  const trajectoryRow = trajectoryRes.data
  const timing = timingRes.data
  const competition = competitionRes.data
  const wedges = wedgesRes.data || []
  const lifecycle = lifecycleRes.data

  const trendName = getHypothesisDisplayTitle(
    hypothesis?.hypothesis_title, trend.theme, null, id
  )

  let trajectory: any[] = []
  if (trajectoryRow?.trajectory_data) {
    trajectory = typeof trajectoryRow.trajectory_data === 'string'
      ? JSON.parse(trajectoryRow.trajectory_data)
      : trajectoryRow.trajectory_data || []
  }

  const seen = new Set<string>()
  const signals: any[] = []
  for (const row of (signalsRes.data || []) as any[]) {
    const sig = row.raw_signals
    if (!sig) continue
    const key = sig.url || sig.title
    if (seen.has(key)) continue
    seen.add(key)
    signals.push({
      title: sig.title,
      source: sig.source,
      url: sig.url || null,
      score: sig.score || 0,
      created_at: sig.created_at,
    })
  }

  const sourceBreakdown: Record<string, number> = {}
  for (const sig of signals) {
    sourceBreakdown[sig.source] = (sourceBreakdown[sig.source] || 0) + 1
  }

  const buildIdeas = parseJson(intelligence?.build_ideas, []) as any[]
  const existingSolutions = parseJson(intelligence?.existing_solutions, []) as any[]
  const risks = (intelligence?.risks || []) as string[]

  const whoWantsThis = parseJson(hypothesis?.who_it_affects, []) as string[]
  const painSignals = parseJson(hypothesis?.pain_signals, []) as string[]
  const demandEvidence = parseJson(hypothesis?.demand_evidence, []) as any[]

  const whatsHappening = hypothesis?.hypothesis_summary
    || intelligence?.summary
    || null

  const whyNow: string[] = []
  if (timing) {
    const timingLabels: Record<string, string> = {
      early_edge: 'The market window is open — early movers have an advantage right now.',
      too_early: 'Still very early — limited data, but worth watching.',
      crowded: 'The space is getting crowded. Differentiation is key.',
      late_but_monetizable: 'Late to the trend, but monetization paths still exist.',
    }
    if (timingLabels[timing.timing_label]) whyNow.push(timingLabels[timing.timing_label])
  }
  if (demandEvidence.length > 0) {
    whyNow.push(`${demandEvidence.length} demand signal${demandEvidence.length > 1 ? 's' : ''} detected — people are actively looking for solutions.`)
  }
  if (signals.length >= 3) {
    const sources = Object.keys(sourceBreakdown)
    whyNow.push(`Evidence from ${sources.length} independent source${sources.length > 1 ? 's' : ''} (${sources.join(', ')}).`)
  }
  if (lifecycle?.lifecycle_stage === 'rising') {
    whyNow.push('Momentum is accelerating — signal volume is increasing.')
  }

  const howToValidate: string[] = []
  const keyword = trendName.split(' ').slice(0, 3).join(' ')
  howToValidate.push(`Search for "${keyword}" on Twitter/Reddit to gauge real-time interest.`)
  if (whoWantsThis.length > 0) {
    howToValidate.push(`Interview 3-5 ${whoWantsThis[0].toLowerCase()} about their current workflow and pain points.`)
  }
  howToValidate.push('Build a landing page describing your solution and measure signup conversion.')
  if (buildIdeas.length > 0) {
    howToValidate.push(`Prototype the simplest version of "${buildIdeas[0]?.idea || 'your solution'}" in a weekend.`)
  }
  howToValidate.push('Post your prototype to relevant communities and track engagement.')

  let suggestedActions: string[] = []
  if (opportunity?.suggested_actions) {
    if (typeof opportunity.suggested_actions === 'string') {
      try { suggestedActions = JSON.parse(opportunity.suggested_actions) } catch { suggestedActions = opportunity.suggested_actions.split('\n').filter(Boolean) }
    } else if (Array.isArray(opportunity.suggested_actions)) {
      suggestedActions = opportunity.suggested_actions
    }
  }

  const allRisks: string[] = [...risks]
  if (competition && competition.competition_level === 'high') {
    allRisks.push('High competition — many players are already building in this space.')
  }
  if (timing?.expiry_risk === 'high') {
    allRisks.push('The opportunity window may be closing soon.')
  }

  const latestPoint = trajectory[trajectory.length - 1]

  const brief = {
    trend_id: id,
    trend_name: trendName,
    trend_status: hypothesis?.hypothesis_status || 'uncertain',
    stage: lifecycle?.lifecycle_stage || trajectoryRow?.current_stage || null,
    stage_confidence: lifecycle?.stage_confidence || 0,
    updated_at: snapshot.run_at,
    first_seen: trend.first_seen,
    confidence: hypothesis?.confidence || 0,
    qualified: opportunity?.qualified || false,
    opportunity_score: opportunity?.opportunity_score || 0,
    brief: {
      whats_happening: whatsHappening,
      why_now: whyNow,
      who_wants_this: whoWantsThis,
      what_to_build: buildIdeas.length > 0 ? buildIdeas : suggestedActions.map((a: string) => ({ idea: a, effort: '', audience: '' })),
      how_to_validate: howToValidate,
      risks: allRisks,
      pain_signals: painSignals,
    },
    market: {
      existing_solutions: existingSolutions,
      competition_level: competition?.competition_level || null,
      saturation_score: competition?.saturation_score || 0,
      wedges: wedges.map((w: any) => ({
        type: w.wedge_type,
        reason: w.trigger_reason,
        confidence: w.confidence,
      })),
    },
    evidence: {
      signals,
      source_breakdown: sourceBreakdown,
      demand_evidence: demandEvidence,
    },
    metrics: {
      momentum: latestPoint?.momentum || 0,
      peak_momentum: trajectoryRow?.peak_momentum || 0,
      signal_count: latestPoint?.signal_count || signals.length,
      total_snapshots: trajectoryRow?.total_snapshots || 0,
      qualified_count: trajectoryRow?.qualified_count || 0,
      trajectory,
      timing: timing ? {
        label: timing.timing_label,
        confidence: timing.confidence,
        reasons: timing.timing_reasons || [],
        expiry_risk: timing.expiry_risk,
      } : null,
    },
  }

  return NextResponse.json(brief)
}
