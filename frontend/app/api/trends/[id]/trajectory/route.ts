import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: trajectory, error } = await supabase
    .from('trend_trajectories')
    .select('*')
    .eq('trend_id', id)
    .single()

  if (error || !trajectory) {
    return NextResponse.json(
      { error: 'Trajectory not found' },
      { status: 404 }
    )
  }

  const trajectoryData = typeof trajectory.trajectory_data === 'string'
    ? JSON.parse(trajectory.trajectory_data)
    : trajectory.trajectory_data

  const stageHistory = typeof trajectory.stage_history === 'string'
    ? JSON.parse(trajectory.stage_history)
    : trajectory.stage_history

  return NextResponse.json({
    trend_id: trajectory.trend_id,
    first_seen_at: trajectory.first_seen_at,
    last_seen_at: trajectory.last_seen_at,
    total_snapshots: trajectory.total_snapshots,
    peak_momentum: trajectory.peak_momentum,
    peak_momentum_at: trajectory.peak_momentum_at,
    current_stage: trajectory.current_stage,
    qualified_count: trajectory.qualified_count,
    last_qualified_at: trajectory.last_qualified_at,
    trajectory: trajectoryData,
    stage_history: stageHistory
  })
}
