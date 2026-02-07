import { getServerSupabase, getLatestSnapshot } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const db = getServerSupabase()
  const checks: Record<string, unknown> = {}

  const snapshot = await getLatestSnapshot(db)
  checks.latest_snapshot = snapshot
    ? { id: snapshot.id, run_at: snapshot.run_at, scoring_version: snapshot.scoring_version, detector_version: snapshot.detector_version }
    : null

  const { count: snapshotCount } = await db
    .from('trend_snapshots')
    .select('*', { count: 'exact', head: true })
  checks.total_snapshots = snapshotCount

  const { data: versionDist } = await db
    .from('trend_snapshots')
    .select('scoring_version')
    .order('run_at', { ascending: false })
    .limit(10)
  checks.recent_scoring_versions = [...new Set((versionDist || []).map(v => v.scoring_version))]

  const { data: pipelineRun } = await db
    .from('pipeline_runs')
    .select('run_at, success, pipeline_version, error')
    .order('run_at', { ascending: false })
    .limit(1)
    .single()
  checks.latest_pipeline_run = pipelineRun

  if (snapshot) {
    const { count: itemCount } = await db
      .from('trend_snapshot_items')
      .select('*', { count: 'exact', head: true })
      .eq('snapshot_id', snapshot.id)
    checks.snapshot_items_count = itemCount

    const { count: lifecycleCount } = await db
      .from('trend_lifecycle_history')
      .select('*', { count: 'exact', head: true })
      .eq('snapshot_id', snapshot.id)
    checks.lifecycle_entries_count = lifecycleCount

    const { count: oppCount } = await db
      .from('trend_opportunities')
      .select('*', { count: 'exact', head: true })
      .eq('snapshot_id', snapshot.id)
    checks.opportunities_count = oppCount

    const { count: qualifiedCount } = await db
      .from('trend_opportunities')
      .select('*', { count: 'exact', head: true })
      .eq('snapshot_id', snapshot.id)
      .eq('qualified', true)
    checks.qualified_opportunities_count = qualifiedCount

    const { count: signalCount } = await db
      .from('trend_signals')
      .select('*', { count: 'exact', head: true })
      .eq('snapshot_id', snapshot.id)
    checks.trend_signals_count = signalCount
  }

  const { count: trendCount } = await db
    .from('detected_trends')
    .select('*', { count: 'exact', head: true })
  checks.total_detected_trends = trendCount

  const { data: detectorVersions } = await db
    .from('detected_trends')
    .select('detector_version')
    .limit(100)
  const vCounts: Record<string, number> = {}
  for (const v of detectorVersions || []) {
    vCounts[v.detector_version] = (vCounts[v.detector_version] || 0) + 1
  }
  checks.detected_trends_by_version = vCounts

  const { count: profileCount } = await db
    .from('user_profiles')
    .select('*', { count: 'exact', head: true })
  checks.user_profiles_count = profileCount

  const { count: prefCount } = await db
    .from('user_preferences')
    .select('*', { count: 'exact', head: true })
  checks.user_preferences_count = prefCount

  checks.env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'not set (using anon key)',
  }

  return NextResponse.json(checks)
}
