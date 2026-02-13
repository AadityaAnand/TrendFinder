import { createClient, SupabaseClient } from '@supabase/supabase-js'

const GENERIC_PHRASES = new Set([
  'unpopular opinion', 'show hn', 'ask hn', 'tell hn', 'launch hn',
  'my thoughts', 'today i learned', 'a story', 'thoughts on',
  'hot take', 'rant', 'discussion', 'opinion', 'hiring', 'who is hiring',
  'new', 'update', 'release', 'announcement', 'guide', 'tutorial',
  'review', 'comparison', 'best', 'top', 'how', 'why', 'what',
])

function isGenericName(name: string): boolean {
  if (!name) return true
  const lower = name.trim().toLowerCase()
  if (lower.length < 3) return true
  if (GENERIC_PHRASES.has(lower)) return true
  for (const phrase of GENERIC_PHRASES) {
    if (lower === phrase) return true
  }
  return false
}

let _serverClient: SupabaseClient | null = null

export function getServerSupabase(): SupabaseClient {
  if (_serverClient) return _serverClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is missing. Set it in .env.local or Vercel environment variables.'
    )
  }

  const key = serviceKey || anonKey
  if (!key) {
    throw new Error(
      'No Supabase key available. Set SUPABASE_SERVICE_ROLE_KEY (preferred for server) or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
    )
  }

  _serverClient = createClient(url, key, {
    auth: { persistSession: false },
  })
  return _serverClient
}

export function getTrendDisplayName(
  theme?: string | null,
  trendKeyword?: string | null,
  trendId?: string
): string {
  if (theme && theme.trim() && !isGenericName(theme)) return theme.trim()
  if (trendKeyword && trendKeyword.trim() && !isGenericName(trendKeyword)) return trendKeyword.trim()
  if (theme && theme.trim()) return theme.trim()
  if (trendKeyword && trendKeyword.trim()) return trendKeyword.trim()
  if (trendId) return `Signal #${trendId.slice(0, 6)}`
  return 'Emerging signal'
}

export function getHypothesisDisplayTitle(
  hypothesisTitle?: string | null,
  theme?: string | null,
  trendKeyword?: string | null,
  trendId?: string
): string {
  if (hypothesisTitle && hypothesisTitle.trim().length > 5 && !isGenericName(hypothesisTitle)) {
    return hypothesisTitle.trim()
  }
  return getTrendDisplayName(theme, trendKeyword, trendId)
}

export async function getLatestSnapshot(db: SupabaseClient) {
  const { data, error } = await db
    .from('trend_snapshots')
    .select('id, run_at, scoring_version, detector_version')
    .order('run_at', { ascending: false })
    .limit(1)
    .single()

  if (data) return data

  if (error) {
    const fallback = await db
      .from('trend_snapshots')
      .select('id, created_at, scoring_version, detector_version')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (fallback.data) {
      return { ...fallback.data, run_at: fallback.data.created_at }
    }
  }

  return null
}
