import { getServerSupabase } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function assignVariant(userId: string, experimentName: string, variants: string[]): string {
  const hash = crypto.createHash('sha256').update(userId + experimentName).digest('hex')
  const idx = parseInt(hash.slice(0, 8), 16) % variants.length
  return variants[idx]
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { user_id, experiment_name, variants } = body

  if (!user_id || !experiment_name || !Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json({ error: 'user_id, experiment_name, and variants[] are required' }, { status: 400 })
  }

  const db = getServerSupabase()

  // Return existing assignment if it exists
  const { data: existing } = await db
    .from('user_experiments')
    .select('variant')
    .eq('user_id', user_id)
    .eq('experiment_name', experiment_name)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ variant: existing.variant, experiment_name, is_new: false })
  }

  // Deterministic assignment based on user_id hash
  const variant = assignVariant(user_id, experiment_name, variants)

  const { error } = await db
    .from('user_experiments')
    .insert({ user_id, experiment_name, variant })

  if (error) {
    return NextResponse.json({ error: 'Failed to assign variant', details: error.message }, { status: 500 })
  }

  return NextResponse.json({ variant, experiment_name, is_new: true }, { status: 201 })
}
