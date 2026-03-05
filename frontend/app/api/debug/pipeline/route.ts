import { getServerSupabase, getLatestSnapshot } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key || key !== process.env.CHAT_ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServerSupabase()
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const snapshot = await getLatestSnapshot(db)
  if (!snapshot) {
    return NextResponse.json({
      last_snapshot: null,
      total_trends: 0,
      qualified: 0,
      rejection_breakdown: {},
      gate_stats: [],
      source_signals_24h: {},
    })
  }

  // Fetch trend_opportunities for last snapshot
  const [oppsRes, gateLogRes, signalsRes] = await Promise.all([
    db
      .from('trend_opportunities')
      .select('trend_id, qualified, rejection_reasons, opportunity_score')
      .eq('snapshot_id', snapshot.id),
    db
      .from('pipeline_qualification_log')
      .select('gate_name, passed, calculated_value, threshold, signal_type, diagnostic_mode')
      .eq('snapshot_id', snapshot.id)
      .eq('diagnostic_mode', false),
    db
      .from('raw_signals')
      .select('source')
      .gte('created_at', cutoff24h)
      .limit(10000),
  ])

  const opps = oppsRes.data ?? []
  const gateLogs = gateLogRes.data ?? []
  const signals = signalsRes.data ?? []

  // Aggregate rejection reasons from trend_opportunities
  const rejectionBreakdown: Record<string, number> = {}
  let qualifiedCount = 0
  for (const opp of opps) {
    if (opp.qualified) { qualifiedCount++; continue }
    for (const reason of (opp.rejection_reasons as string[] | null) ?? []) {
      rejectionBreakdown[reason] = (rejectionBreakdown[reason] ?? 0) + 1
    }
  }

  // Aggregate gate stats from qualification log (if table exists and has data)
  const gateMap: Record<string, { passed: number; failed: number }> = {}
  for (const log of gateLogs) {
    if (!gateMap[log.gate_name]) gateMap[log.gate_name] = { passed: 0, failed: 0 }
    if (log.passed) gateMap[log.gate_name].passed++
    else gateMap[log.gate_name].failed++
  }

  const gateOrder = ['persistence', 'artifact', 'hypothesis', 'confidence', 'demand', 'actionability']
  const gateStats = [
    ...gateOrder.filter(g => gateMap[g]).map(g => ({
      gate: g,
      passed: gateMap[g].passed,
      failed: gateMap[g].failed,
      total: gateMap[g].passed + gateMap[g].failed,
      pass_rate: gateMap[g].passed / (gateMap[g].passed + gateMap[g].failed),
    })),
    // Creator gates
    ...Object.keys(gateMap)
      .filter(g => g.startsWith('creator_'))
      .map(g => ({
        gate: g,
        passed: gateMap[g].passed,
        failed: gateMap[g].failed,
        total: gateMap[g].passed + gateMap[g].failed,
        pass_rate: gateMap[g].passed / (gateMap[g].passed + gateMap[g].failed),
      })),
  ]

  // Source signal counts (last 24h)
  const sourceSignals: Record<string, number> = {}
  for (const s of signals) {
    sourceSignals[s.source] = (sourceSignals[s.source] ?? 0) + 1
  }

  return NextResponse.json({
    last_snapshot: { id: snapshot.id, run_at: snapshot.run_at },
    total_trends: opps.length,
    qualified: qualifiedCount,
    rejection_breakdown: Object.fromEntries(
      Object.entries(rejectionBreakdown).sort(([, a], [, b]) => b - a)
    ),
    gate_stats: gateStats,
    source_signals_24h: sourceSignals,
    has_gate_log: gateLogs.length > 0,
  })
}
