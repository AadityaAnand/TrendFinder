import { getServerSupabase } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { user_id, experiment_name, metric_name, metric_value = 1 } = body

  if (!user_id || !experiment_name || !metric_name) {
    return NextResponse.json({ error: 'user_id, experiment_name, and metric_name are required' }, { status: 400 })
  }

  const db = getServerSupabase()

  // Look up the user's variant for this experiment
  const { data: assignment } = await db
    .from('user_experiments')
    .select('variant')
    .eq('user_id', user_id)
    .eq('experiment_name', experiment_name)
    .maybeSingle()

  if (!assignment) {
    return NextResponse.json({ error: 'User has not been assigned to this experiment' }, { status: 404 })
  }

  const { error } = await db
    .from('experiment_metrics')
    .insert({
      user_id,
      experiment_name,
      variant: assignment.variant,
      metric_name,
      metric_value,
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to record metric', details: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
