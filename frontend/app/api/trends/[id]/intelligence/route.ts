import { getServerSupabase, getLatestSnapshot } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = getServerSupabase()
  const snapshot = await getLatestSnapshot(supabase)

  if (!snapshot) {
    return NextResponse.json({ intelligence: null })
  }

  const { data } = await supabase
    .from('trend_intelligence')
    .select('summary, build_ideas, existing_solutions, risks, signal_count, prompt_version, created_at')
    .eq('trend_id', id)
    .eq('snapshot_id', snapshot.id)
    .single()

  if (!data) {
    return NextResponse.json({ intelligence: null })
  }

  // Parse JSONB fields
  let buildIdeas = data.build_ideas
  if (typeof buildIdeas === 'string') {
    try { buildIdeas = JSON.parse(buildIdeas) } catch { buildIdeas = [] }
  }

  let existingSolutions = data.existing_solutions
  if (typeof existingSolutions === 'string') {
    try { existingSolutions = JSON.parse(existingSolutions) } catch { existingSolutions = [] }
  }

  return NextResponse.json({
    intelligence: {
      summary: data.summary,
      build_ideas: buildIdeas || [],
      existing_solutions: existingSolutions || [],
      risks: data.risks || [],
      signal_count: data.signal_count,
      generated_at: data.created_at,
    }
  })
}
