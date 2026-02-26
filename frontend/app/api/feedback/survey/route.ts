import { getServerSupabase } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const db = getServerSupabase()

  const body = await req.json()
  const { user_id, working_well, could_be_better, want_to_see } = body

  if (!working_well && !could_be_better && !want_to_see) {
    return NextResponse.json({ error: 'At least one feedback field is required' }, { status: 400 })
  }

  const { error } = await db.from('user_feedback_surveys').insert({
    user_id: user_id ?? null,
    working_well: working_well ?? null,
    could_be_better: could_be_better ?? null,
    want_to_see: want_to_see ?? null,
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to save feedback', details: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
