import { getServerSupabase, getLatestSnapshot } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerSupabase()
  const { id: opportunityId } = await params
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  const snapshot = await getLatestSnapshot(supabase)

  if (!snapshot) {
    return NextResponse.json(
      { error: 'No snapshot available' },
      { status: 404 }
    )
  }

  const { data: verdict } = await supabase
    .from('execution_verdicts')
    .select('*')
    .eq('user_id', userId)
    .eq('opportunity_id', opportunityId)
    .eq('snapshot_id', snapshot.id)
    .single()

  const { data: feasibility } = await supabase
    .from('execution_feasibility')
    .select('*')
    .eq('user_id', userId)
    .eq('opportunity_id', opportunityId)
    .eq('snapshot_id', snapshot.id)
    .single()

  const { data: requirements } = await supabase
    .from('execution_requirements')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .eq('snapshot_id', snapshot.id)
    .single()

  const { data: moat } = await supabase
    .from('opportunity_moats')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .eq('snapshot_id', snapshot.id)
    .single()

  if (!verdict && !feasibility && !requirements) {
    return NextResponse.json(
      { error: 'No execution analysis available. Run analysis first.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    verdict: verdict ? {
      verdict: verdict.verdict,
      reasons: verdict.verdict_reasons,
      archetype: verdict.archetype,
      risk_flags: verdict.risk_flags,
      model_version: verdict.model_version
    } : null,
    feasibility: feasibility ? {
      score: feasibility.feasibility_score,
      team_fit: feasibility.team_fit,
      time_fit: feasibility.time_fit,
      skill_coverage: feasibility.skill_coverage,
      execution_type_fit: feasibility.execution_type_fit,
      sales_motion_fit: feasibility.sales_motion_fit,
      infra_load_fit: feasibility.infra_load_fit,
      blocking_factors: feasibility.blocking_factors,
      summary: feasibility.fit_summary
    } : null,
    requirements: requirements ? {
      build_weeks: { min: requirements.build_weeks_min, max: requirements.build_weeks_max },
      maintenance_level: requirements.maintenance_level,
      operational_complexity: requirements.operational_complexity,
      infra_cost: requirements.infra_cost_bucket,
      execution_type: requirements.execution_type,
      sales_motion: requirements.sales_motion,
      required_stack: requirements.required_stack,
      required_team: { min: requirements.required_team_size_min, max: requirements.required_team_size_max },
      estimation_confidence: requirements.estimation_confidence,
      estimation_notes: requirements.estimation_notes
    } : null,
    moat: moat ? {
      types: moat.moat_types,
      strength: moat.moat_strength,
      risk: moat.moat_risk,
      evidence: moat.moat_evidence
    } : null,
    disclaimer: 'This analysis is informational only. It does not constitute financial or business advice. All estimates are ranges, not commitments.',
    snapshot_id: snapshot.id
  })
}
