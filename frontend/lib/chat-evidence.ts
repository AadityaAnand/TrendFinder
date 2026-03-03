/**
 * Evidence query handler — answers questions by querying Supabase directly.
 * No LLM involved: returns factual, high-confidence responses with citations.
 */

import { getServerSupabase } from './supabase-server'
import type { Citation } from './chat-context'

export interface EvidenceResult {
  content: string
  citations: Citation[]
  confidence: number
}

type IntentType = 'top_signals' | 'source_breakdown' | 'timeline' | 'persona' | 'recent'

function detectIntent(message: string): IntentType {
  const lower = message.toLowerCase()
  if (/\b(top|best|most (popular|engaged|upvoted|viewed|mentioned)|highest)\b/.test(lower)) return 'top_signals'
  if (/\b(source|platform|where|which site|subreddit|forum|community)\b/.test(lower)) return 'source_breakdown'
  if (/\b(when|timeline|history|first|started|began|date|oldest|earliest|latest)\b/.test(lower)) return 'timeline'
  if (/\b(who|person|people|creator|developer|persona|audience|user|engineer)\b/.test(lower)) return 'persona'
  return 'recent'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSignals(trendId: string, limit: number, orderBy: 'score' | 'created_at' = 'score'): Promise<any[]> {
  const db = getServerSupabase()
  const { data } = await db
    .from('trend_signals')
    .select('raw_signals!inner(id, title, source, url, score, created_at)')
    .eq('trend_id', trendId)
    .limit(limit) as { data: any[] | null }
  return (data || []).map(r => r.raw_signals).filter(Boolean)
}

async function handleTopSignals(trendId: string): Promise<EvidenceResult> {
  const rows = await getSignals(trendId, 10, 'score')
  const sorted = rows.sort((a, b) => (b.score || 0) - (a.score || 0))

  if (!sorted.length) {
    return { content: "I don't have any signals for this trend yet.", citations: [], confidence: 0.9 }
  }

  const citations: Citation[] = sorted.map(s => ({
    signal_id: s.id,
    title: s.title,
    url: s.url,
    source: s.source,
    excerpt: s.title,
  }))

  const lines = sorted.map((s, i) =>
    `${i + 1}. **[${s.source}]** ${s.title}${s.score ? ` (score: ${s.score})` : ''}`
  )

  return {
    content: `Here are the top signals for this trend, sorted by engagement:\n\n${lines.join('\n')}`,
    citations,
    confidence: 0.97,
  }
}

async function handleSourceBreakdown(trendId: string): Promise<EvidenceResult> {
  const db = getServerSupabase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await db
    .from('trend_signals')
    .select('raw_signals!inner(source)')
    .eq('trend_id', trendId) as { data: any[] | null }

  const counts: Record<string, number> = {}
  for (const row of (data || [])) {
    const source = row.raw_signals?.source || 'unknown'
    counts[source] = (counts[source] || 0) + 1
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])

  if (!sorted.length) {
    return { content: "I don't have source data for this trend yet.", citations: [], confidence: 0.9 }
  }

  const total = sorted.reduce((sum, [, n]) => sum + n, 0)
  const lines = sorted.map(([source, count]) =>
    `- **${source}**: ${count} signals (${Math.round((count / total) * 100)}%)`
  )

  return {
    content: `Here's the source breakdown for this trend (${total} total signals):\n\n${lines.join('\n')}`,
    citations: [],
    confidence: 0.98,
  }
}

async function handleTimeline(trendId: string): Promise<EvidenceResult> {
  const db = getServerSupabase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: oldest } = await db
    .from('trend_signals')
    .select('raw_signals!inner(title, source, url, created_at)')
    .eq('trend_id', trendId)
    .order('created_at', { ascending: true })
    .limit(1) as { data: any[] | null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recent } = await db
    .from('trend_signals')
    .select('raw_signals!inner(id, title, source, url, created_at)')
    .eq('trend_id', trendId)
    .order('created_at', { ascending: false })
    .limit(5) as { data: any[] | null }

  const oldestSignal = oldest?.[0]?.raw_signals
  const recentSignals = (recent || []).map(r => r.raw_signals).filter(Boolean)

  const lines: string[] = []
  if (oldestSignal?.created_at) {
    const date = new Date(oldestSignal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    lines.push(`**First seen:** ${date} — [${oldestSignal.source}] ${oldestSignal.title}`)
  }

  if (recentSignals.length > 0) {
    lines.push(`\n**Most recent signals:**`)
    recentSignals.forEach(s => {
      const date = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      lines.push(`- ${date}: [${s.source}] ${s.title}`)
    })
  }

  const citations: Citation[] = recentSignals.map(s => ({
    signal_id: s.id,
    title: s.title,
    url: s.url,
    source: s.source,
  }))

  return {
    content: lines.length ? lines.join('\n') : "I don't have timeline data for this trend yet.",
    citations,
    confidence: 0.96,
  }
}

async function handlePersona(trendId: string): Promise<EvidenceResult> {
  const db = getServerSupabase()
  const { data: brief } = await db
    .from('opportunity_briefs')
    .select('persona_roles, persona_pain_points')
    .eq('trend_id', trendId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: hypothesis } = await db
    .from('problem_hypotheses')
    .select('who_it_affects, pain_signals')
    .eq('trend_id', trendId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lines: string[] = []

  const roles = brief?.persona_roles || (hypothesis?.who_it_affects ? (
    Array.isArray(hypothesis.who_it_affects) ? hypothesis.who_it_affects : [hypothesis.who_it_affects]
  ) : [])

  if (roles.length) {
    lines.push(`**Who is affected:**\n${roles.map((r: string) => `- ${r}`).join('\n')}`)
  }

  const painPoints = brief?.persona_pain_points || []
  if (painPoints.length) {
    lines.push(`\n**Pain points:**`)
    painPoints.slice(0, 4).forEach((p: { phrase: string; quote?: string; source?: string }) => {
      lines.push(`- ${p.phrase}${p.quote ? ` ("${p.quote}" — ${p.source || 'signal'})` : ''}`)
    })
  } else if (hypothesis?.pain_signals) {
    const pains = Array.isArray(hypothesis.pain_signals) ? hypothesis.pain_signals : []
    if (pains.length) {
      lines.push(`\n**Pain signals:**\n${pains.slice(0, 5).map((p: string) => `- ${p}`).join('\n')}`)
    }
  }

  return {
    content: lines.length ? lines.join('\n') : "I don't have persona data for this trend yet.",
    citations: [],
    confidence: 0.9,
  }
}

async function handleRecent(trendId: string): Promise<EvidenceResult> {
  const rows = await getSignals(trendId, 10)
  const recent = rows.sort((a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  )

  if (!recent.length) {
    return { content: "I don't have any signals for this trend yet.", citations: [], confidence: 0.9 }
  }

  const citations: Citation[] = recent.map(s => ({
    signal_id: s.id,
    title: s.title,
    url: s.url,
    source: s.source,
  }))

  const lines = recent.map(s => {
    const date = s.created_at
      ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : ''
    return `- **[${s.source}]** ${s.title}${date ? ` (${date})` : ''}`
  })

  return {
    content: `Here are the most recent signals for this trend:\n\n${lines.join('\n')}\n\nWould you like me to dig deeper into any specific aspect?`,
    citations,
    confidence: 0.95,
  }
}

export async function handleEvidenceQuery(trendId: string, message: string): Promise<EvidenceResult> {
  const intent = detectIntent(message)

  switch (intent) {
    case 'top_signals': return handleTopSignals(trendId)
    case 'source_breakdown': return handleSourceBreakdown(trendId)
    case 'timeline': return handleTimeline(trendId)
    case 'persona': return handlePersona(trendId)
    default: return handleRecent(trendId)
  }
}
