import { getServerSupabase, getLatestSnapshot, getHypothesisDisplayTitle } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// Relevance scoring weights (mirrors Python relevance_scorer.py)
const WEIGHTS = {
  role_match: 0.25,
  domain_match: 0.25,
  stack_match: 0.20,
  effort_fit: 0.15,
  risk_fit: 0.10,
  avoid_penalty: 0.30
}

// Role keywords for matching
const ROLE_KEYWORDS: Record<string, string[]> = {
  developer: ['api', 'sdk', 'framework', 'library', 'tool', 'cli', 'database', 'backend', 'frontend'],
  founder: ['startup', 'business', 'market', 'growth', 'revenue', 'funding', 'saas', 'b2b', 'b2c'],
  marketer: ['content', 'seo', 'social', 'brand', 'campaign', 'analytics', 'audience', 'viral'],
  creator: ['content', 'video', 'podcast', 'newsletter', 'blog', 'youtube', 'tiktok', 'audience'],
  researcher: ['paper', 'study', 'analysis', 'data', 'academic', 'science', 'research']
}

// Domain keywords
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  ai: ['ai', 'ml', 'machine learning', 'gpt', 'llm', 'neural', 'deep learning', 'model'],
  web3: ['crypto', 'blockchain', 'defi', 'nft', 'web3', 'ethereum', 'bitcoin', 'token'],
  fintech: ['finance', 'payment', 'banking', 'trading', 'investment', 'fintech'],
  health: ['health', 'medical', 'fitness', 'wellness', 'healthcare', 'biotech'],
  ecommerce: ['ecommerce', 'shop', 'retail', 'marketplace', 'commerce', 'store'],
  devtools: ['developer', 'devtools', 'ide', 'debugging', 'testing', 'ci/cd', 'infrastructure']
}

// Tech stack keywords
const STACK_KEYWORDS: Record<string, string[]> = {
  react: ['react', 'nextjs', 'next.js', 'jsx', 'hooks'],
  python: ['python', 'django', 'flask', 'fastapi', 'pytorch'],
  node: ['node', 'nodejs', 'express', 'npm', 'javascript', 'typescript'],
  rust: ['rust', 'cargo', 'wasm'],
  go: ['golang', 'go']
}

function computeKeywordMatch(text: string, keywords: string[]): number {
  if (!text || keywords.length === 0) return 0
  const lowerText = text.toLowerCase()
  const matches = keywords.filter(kw => lowerText.includes(kw.toLowerCase()))
  return Math.min(matches.length / Math.max(keywords.length, 3), 1.0)
}

function computeRoleMatch(trendText: string, targetRoles: string[]): number {
  if (targetRoles.length === 0) return 0.5
  const allKeywords = targetRoles.flatMap(role => ROLE_KEYWORDS[role.toLowerCase()] || [])
  return computeKeywordMatch(trendText, allKeywords)
}

function computeDomainMatch(trendText: string, domains: string[]): number {
  if (domains.length === 0) return 0.5
  const allKeywords = domains.flatMap(domain => DOMAIN_KEYWORDS[domain.toLowerCase()] || [])
  return computeKeywordMatch(trendText, allKeywords)
}

function computeStackMatch(trendText: string, techStack: string[]): number {
  if (techStack.length === 0) return 0.5
  const allKeywords = techStack.flatMap(tech => STACK_KEYWORDS[tech.toLowerCase()] || [tech.toLowerCase()])
  return computeKeywordMatch(trendText, allKeywords)
}

function computeEffortFit(actionType: string, timeHorizon: string, teamSize: string): number {
  const effortMap: Record<string, number> = {
    build: 0.8,
    create: 0.6,
    learn: 0.3,
    explore: 0.2,
    apply: 0.4
  }
  const baseEffort = effortMap[actionType?.toLowerCase()] || 0.5

  const horizonMultiplier: Record<string, number> = {
    'this_week': baseEffort > 0.5 ? 0.7 : 1.0,
    'this_month': 1.0,
    'this_quarter': baseEffort < 0.5 ? 0.8 : 1.0,
    'flexible': 1.0
  }

  const teamMultiplier = teamSize === 'solo' && baseEffort > 0.7 ? 0.8 : 1.0

  return Math.min((horizonMultiplier[timeHorizon] || 1.0) * teamMultiplier, 1.0)
}

function computeRiskFit(lifecycle: string | null, riskTolerance: string): number {
  const riskMap: Record<string, number> = {
    emerging: 0.9,
    growing: 0.6,
    mature: 0.3,
    declining: 0.7
  }
  const trendRisk = riskMap[lifecycle?.toLowerCase() || ''] || 0.5

  const toleranceMap: Record<string, [number, number]> = {
    low: [0, 0.4],
    medium: [0.3, 0.7],
    high: [0.5, 1.0]
  }
  const [minRisk, maxRisk] = toleranceMap[riskTolerance] || [0.3, 0.7]

  if (trendRisk >= minRisk && trendRisk <= maxRisk) return 1.0
  const distance = trendRisk < minRisk ? minRisk - trendRisk : trendRisk - maxRisk
  return Math.max(1.0 - distance * 2, 0)
}

function computeAvoidPenalty(trendText: string, avoidTopics: string[]): number {
  if (avoidTopics.length === 0) return 0
  const lowerText = trendText.toLowerCase()
  const matches = avoidTopics.filter(topic => lowerText.includes(topic.toLowerCase()))
  return matches.length > 0 ? 1.0 : 0
}

function generateFitReasons(
  scores: Record<string, number>,
  preferences: Record<string, unknown>
): string[] {
  const reasons: string[] = []

  if (scores.role_match >= 0.6 && (preferences.target_roles as string[])?.length > 0) {
    reasons.push(`Matches your ${(preferences.target_roles as string[])[0]} focus`)
  }
  if (scores.domain_match >= 0.6 && (preferences.domains as string[])?.length > 0) {
    reasons.push(`Relevant to ${(preferences.domains as string[])[0]}`)
  }
  if (scores.stack_match >= 0.6 && (preferences.tech_stack as string[])?.length > 0) {
    reasons.push(`Uses ${(preferences.tech_stack as string[])[0]}`)
  }
  if (scores.effort_fit >= 0.8) {
    reasons.push('Fits your time constraints')
  }
  if (scores.risk_fit >= 0.8) {
    reasons.push('Matches your risk profile')
  }
  if (scores.avoid_penalty > 0) {
    reasons.push('Contains topics you prefer to avoid')
  }

  return reasons
}

function computeRelevanceScore(
  opportunity: Record<string, unknown>,
  trend: Record<string, unknown>,
  preferences: Record<string, unknown>
): { relevance_score: number; breakdown: Record<string, number>; fit_reasons: string[] } {
  const trendText = `${trend.theme || ''} ${trend.description || ''} ${opportunity.action_title || ''} ${opportunity.why_now || ''}`

  const scores = {
    role_match: computeRoleMatch(trendText, (preferences.target_roles as string[]) || []),
    domain_match: computeDomainMatch(trendText, (preferences.domains as string[]) || []),
    stack_match: computeStackMatch(trendText, (preferences.tech_stack as string[]) || []),
    effort_fit: computeEffortFit(
      opportunity.action_type as string,
      (preferences.time_horizon as string) || 'flexible',
      (preferences.team_size as string) || 'solo'
    ),
    risk_fit: computeRiskFit(
      trend.lifecycle_stage as string,
      (preferences.risk_tolerance as string) || 'medium'
    ),
    avoid_penalty: computeAvoidPenalty(trendText, (preferences.avoid_topics as string[]) || [])
  }

  const relevance_score = Math.max(0, Math.min(1,
    WEIGHTS.role_match * scores.role_match +
    WEIGHTS.domain_match * scores.domain_match +
    WEIGHTS.stack_match * scores.stack_match +
    WEIGHTS.effort_fit * scores.effort_fit +
    WEIGHTS.risk_fit * scores.risk_fit -
    WEIGHTS.avoid_penalty * scores.avoid_penalty
  ))

  const fit_reasons = generateFitReasons(scores, preferences)

  return { relevance_score, breakdown: scores, fit_reasons }
}

// Archetype modifiers for outcome-aware scoring (Phase 6)
const ARCHETYPE_MODIFIERS: Record<string, number> = {
  proven_winner: 0.20,
  fast_mvp: 0.15,
  infra_bet: 0.05,
  content_wedge: 0.0,
  execution_trap: -0.25,
}

const MIN_OUTCOMES_FOR_ADJUSTMENT = 3

interface OutcomeModifier {
  modifier: number
  factors: Record<string, string>
  has_data: boolean
  archetype?: string
}

function computeOutcomeModifier(outcomeStats: Record<string, unknown> | null): OutcomeModifier {
  if (!outcomeStats) {
    return { modifier: 0, factors: {}, has_data: false }
  }

  const totalStarts = (outcomeStats.total_user_starts as number) || 0
  if (totalStarts < MIN_OUTCOMES_FOR_ADJUSTMENT) {
    return { modifier: 0, factors: {}, has_data: false }
  }

  const factors: Record<string, string> = {}
  let modifier = 0

  const archetype = outcomeStats.trend_archetype as string
  const completionRate = (outcomeStats.avg_completion_rate as number) || 0
  const avgQuality = (outcomeStats.avg_quality_score as number) || 0
  const difficulty = (outcomeStats.execution_difficulty_score as number) || 5

  // Archetype factor (most impactful)
  if (archetype && ARCHETYPE_MODIFIERS[archetype] !== undefined) {
    const archetypeMod = ARCHETYPE_MODIFIERS[archetype]
    modifier += archetypeMod
    if (archetypeMod > 0) {
      factors.archetype = `Trend type: ${archetype.replace(/_/g, ' ')} (boost)`
    } else if (archetypeMod < 0) {
      factors.archetype = `Trend type: ${archetype.replace(/_/g, ' ')} (caution)`
    }
  }

  // Completion rate factor
  if (completionRate >= 0.5) {
    modifier += 0.08
    factors.completion = `Strong completion history (${Math.round(completionRate * 100)}%)`
  } else if (completionRate < 0.2) {
    modifier -= 0.10
    factors.completion = `Low completion history (${Math.round(completionRate * 100)}%)`
  }

  // Quality factor
  if (avgQuality >= 4) {
    modifier += 0.07
    factors.quality = `High quality track record (avg ${avgQuality.toFixed(1)}/5)`
  } else if (avgQuality < 2.5) {
    modifier -= 0.05
    factors.quality = `Quality concerns (avg ${avgQuality.toFixed(1)}/5)`
  }

  // Difficulty warning
  if (difficulty >= 7) {
    factors.difficulty = `Execution difficulty: ${Math.round(difficulty)}/10 (challenging)`
    modifier -= 0.03
  }

  // Cap the modifier
  modifier = Math.max(-0.30, Math.min(0.30, modifier))

  return {
    modifier: Math.round(modifier * 1000) / 1000,
    factors,
    has_data: true,
    archetype
  }
}

// GET /api/opportunities/personalized?user_id=xxx
export async function GET(request: Request) {
  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  const includeUnqualified = searchParams.get('include_unqualified') === 'true'

  if (!userId) {
    return NextResponse.json(
      { error: 'user_id is required' },
      { status: 400 }
    )
  }

  const { data: preferences, error: prefError } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (prefError || !preferences) {
    return NextResponse.json(
      { error: 'User preferences not found' },
      { status: 404 }
    )
  }

  const snapshot = await getLatestSnapshot(supabase)

  if (!snapshot) {
    return NextResponse.json(
      { error: 'No snapshot available' },
      { status: 404 }
    )
  }

  // Get opportunities with their trends and explanations
  let oppQuery = supabase
    .from('trend_opportunities')
    .select(`
      *,
      detected_trends (
        id,
        theme
      ),
      opportunity_explanations (
        why_this_trend,
        why_now,
        whats_the_risk
      )
    `)
    .eq('snapshot_id', snapshot.id)
    .order('opportunity_score', { ascending: false })

  if (!includeUnqualified) {
    oppQuery = oppQuery.eq('qualified', true)
  }

  const { data: opportunities, error: oppError } = await oppQuery

  if (oppError) {
    return NextResponse.json(
      { error: 'Failed to fetch opportunities', details: oppError.message },
      { status: 500 }
    )
  }

  // Get user's feedback to filter out dismissed
  const { data: feedback } = await supabase
    .from('user_opportunity_feedback')
    .select('opportunity_id, feedback_type')
    .eq('user_id', userId)

  const dismissedIds = new Set(
    (feedback || [])
      .filter(f => f.feedback_type === 'dismissed' || f.feedback_type === 'not_relevant')
      .map(f => f.opportunity_id)
  )
  const savedIds = new Set(
    (feedback || [])
      .filter(f => f.feedback_type === 'saved')
      .map(f => f.opportunity_id)
  )

  // Get trend IDs and opportunity IDs for lookups
  const trendIds = [...new Set((opportunities || []).map(o => o.trend_id).filter(Boolean))]
  const oppIds = (opportunities || []).map(o => o.id).filter(Boolean)

  // Fetch hypotheses for all trends
  const { data: hypotheses } = await supabase
    .from('problem_hypotheses')
    .select('trend_id, hypothesis_title, hypothesis_summary, hypothesis_status, confidence, pain_signals, who_it_affects, demand_evidence, hypothesis_type, platform_focus, monetization_angle')
    .eq('snapshot_id', snapshot.id)
    .in('trend_id', trendIds)

  const hypothesisMap: Record<string, Record<string, unknown>> = {}
  for (const h of (hypotheses || [])) {
    hypothesisMap[h.trend_id] = h
  }

  // Fetch outcome stats for all trends (Phase 6)
  const { data: outcomeStats } = await supabase
    .from('trend_outcome_stats')
    .select('*')
    .in('trend_id', trendIds)

  const outcomeStatsMap: Record<string, Record<string, unknown>> = {}
  for (const stat of (outcomeStats || [])) {
    outcomeStatsMap[stat.trend_id] = stat
  }

  // Fetch confidence predictions for opportunities (Phase 7)
  const { data: confidencePredictions } = await supabase
    .from('confidence_predictions')
    .select('entity_id, prediction_type, confidence_score, confidence_interval_low, confidence_interval_high, confidence_factors')
    .eq('entity_type', 'opportunity')
    .in('entity_id', oppIds)
    .eq('snapshot_id', snapshot.id)

  const confidenceMap: Record<string, Record<string, unknown>> = {}
  for (const pred of (confidencePredictions || [])) {
    if (!confidenceMap[pred.entity_id]) {
      confidenceMap[pred.entity_id] = {}
    }
    confidenceMap[pred.entity_id][pred.prediction_type] = {
      confidence: pred.confidence_score,
      interval: [pred.confidence_interval_low, pred.confidence_interval_high],
      factors: pred.confidence_factors
    }
  }

  // Fetch timing signals for trends (Phase 8)
  const { data: timingSignals } = await supabase
    .from('trend_timing_signals')
    .select('trend_id, timing_label, timing_confidence, timing_reasons, timing_guards, expiry_risk')
    .in('trend_id', trendIds)
    .eq('snapshot_id', snapshot.id)

  const timingMap: Record<string, Record<string, unknown>> = {}
  for (const signal of (timingSignals || [])) {
    timingMap[signal.trend_id] = {
      label: signal.timing_label,
      confidence: signal.timing_confidence,
      reasons: signal.timing_reasons,
      guards: signal.timing_guards,
      expiry_risk: signal.expiry_risk
    }
  }

  // Fetch competitive intelligence for trends (Phase 9)
  const { data: competitiveIntel } = await supabase
    .from('trend_competitive_intelligence')
    .select('trend_id, saturation_score, competition_level, confidence, confidence_reasons')
    .in('trend_id', trendIds)
    .eq('snapshot_id', snapshot.id)

  const competitionMap: Record<string, Record<string, unknown>> = {}
  for (const intel of (competitiveIntel || [])) {
    competitionMap[intel.trend_id] = intel
  }

  // Fetch wedges for highly competitive trends (Phase 9)
  const highCompTrends = (competitiveIntel || [])
    .filter(i => i.competition_level === 'high')
    .map(i => i.trend_id)

  let wedgeMap: Record<string, Array<Record<string, unknown>>> = {}
  if (highCompTrends.length > 0) {
    const { data: wedges } = await supabase
      .from('trend_wedges')
      .select('trend_id, wedge_type, trigger_reason, confidence')
      .in('trend_id', highCompTrends)
      .eq('snapshot_id', snapshot.id)

    for (const w of (wedges || [])) {
      if (!wedgeMap[w.trend_id]) wedgeMap[w.trend_id] = []
      wedgeMap[w.trend_id].push({
        wedge_type: w.wedge_type,
        trigger_reason: w.trigger_reason,
        confidence: w.confidence
      })
    }
  }

  // Competition score modifiers (Phase 9)
  const COMPETITION_MODIFIERS: Record<string, number> = {
    high: -0.20,
    moderate: -0.10,
    low: 0,
    uncertain: 0
  }

  // Fetch execution verdicts for user (Phase 10 — annotates, never re-ranks)
  const { data: executionVerdicts } = await supabase
    .from('execution_verdicts')
    .select('opportunity_id, verdict, verdict_reasons, archetype, risk_flags')
    .eq('user_id', userId)
    .eq('snapshot_id', snapshot.id)

  const verdictMap: Record<string, Record<string, unknown>> = {}
  for (const v of (executionVerdicts || [])) {
    verdictMap[v.opportunity_id] = {
      verdict: v.verdict,
      reasons: v.verdict_reasons,
      archetype: v.archetype,
      risk_flags: v.risk_flags
    }
  }

  // Score and rank opportunities
  const personalizedOpportunities = (opportunities || [])
    .filter(opp => !dismissedIds.has(opp.id))
    .map(opp => {
      const { relevance_score, breakdown, fit_reasons } = computeRelevanceScore(
        opp,
        opp.detected_trends || {},
        preferences
      )

      // Compute outcome modifier (Phase 6)
      const trendOutcomeStats = outcomeStatsMap[opp.trend_id] || null
      const outcomeModifier = computeOutcomeModifier(trendOutcomeStats)

      // Apply outcome modifier to global score
      let adjustedGlobalScore = opp.opportunity_score || 0
      if (outcomeModifier.has_data) {
        adjustedGlobalScore = adjustedGlobalScore * (1 + outcomeModifier.modifier)
        adjustedGlobalScore = Math.max(0, Math.min(1, adjustedGlobalScore))
      }

      // Apply competition modifier (Phase 9)
      const competitionData = competitionMap[opp.trend_id]
      const competitionLevel = (competitionData?.competition_level as string) || 'uncertain'
      const competitionModifier = COMPETITION_MODIFIERS[competitionLevel] || 0
      if (competitionModifier !== 0) {
        adjustedGlobalScore = adjustedGlobalScore * (1 + competitionModifier)
        adjustedGlobalScore = Math.max(0, Math.min(1, adjustedGlobalScore))
      }

      // Personalized score: 60% (outcome+competition adjusted) global quality, 40% relevance
      const personalized_score = 0.6 * adjustedGlobalScore + 0.4 * relevance_score

      const trendData = opp.detected_trends || {}
      const explanations = Array.isArray(opp.opportunity_explanations)
        ? opp.opportunity_explanations[0]
        : opp.opportunity_explanations
      const hypothesis = hypothesisMap[opp.trend_id] || null
      const displayName = getHypothesisDisplayTitle(
        hypothesis?.hypothesis_title as string | undefined,
        trendData.theme,
        null,
        opp.trend_id
      )

      const result: Record<string, unknown> = {
        ...opp,
        display_name: displayName,
        action_title: opp.action_title || displayName,
        why_now: opp.why_now || explanations?.why_now || null,
        why_this_trend: explanations?.why_this_trend || null,
        whats_the_risk: explanations?.whats_the_risk || null,
        detected_trends: { ...trendData, theme: displayName },
        relevance_score,
        relevance_breakdown: breakdown,
        fit_reasons,
        personalized_score,
        global_score: opp.opportunity_score,
        is_saved: savedIds.has(opp.id)
      }

      if (hypothesis) {
        result.hypothesis = {
          title: hypothesis.hypothesis_title,
          summary: hypothesis.hypothesis_summary,
          status: hypothesis.hypothesis_status,
          confidence: hypothesis.confidence,
          pain_signals: hypothesis.pain_signals,
          who_it_affects: hypothesis.who_it_affects,
          demand_evidence: hypothesis.demand_evidence,
          hypothesis_type: hypothesis.hypothesis_type || 'developer',
          platform_focus: hypothesis.platform_focus || [],
          monetization_angle: hypothesis.monetization_angle || null,
        }
      }

      // Include outcome data if present (Phase 6)
      if (outcomeModifier.has_data) {
        result.outcome_modifier = outcomeModifier.modifier
        result.outcome_factors = outcomeModifier.factors
        result.outcome_archetype = outcomeModifier.archetype
        result.adjusted_global_score = adjustedGlobalScore
      }

      // Include confidence predictions if present (Phase 7)
      const oppConfidence = confidenceMap[opp.id]
      if (oppConfidence) {
        result.confidence_predictions = oppConfidence
      }

      // Include timing data if present (Phase 8)
      const trendTiming = timingMap[opp.trend_id]
      if (trendTiming) {
        // Phase 9: Override timing if early_edge + high competition
        if (trendTiming.label === 'early_edge' && competitionLevel === 'high') {
          result.timing = { ...trendTiming, label: 'crowded', original_label: 'early_edge' }
        } else {
          result.timing = trendTiming
        }
      }

      // Include competition data if present (Phase 9)
      if (competitionData) {
        result.competition = {
          level: competitionLevel,
          saturation_score: competitionData.saturation_score,
          confidence: competitionData.confidence,
          modifier: competitionModifier
        }
        const trendWedges = wedgeMap[opp.trend_id]
        if (trendWedges && trendWedges.length > 0) {
          result.wedges = trendWedges
        }
      }

      // Include execution verdict if present (Phase 10 — annotation only, no ranking impact)
      const oppVerdict = verdictMap[opp.id]
      if (oppVerdict) {
        result.execution = oppVerdict
      }

      return result
    })
    .sort((a, b) => (b.personalized_score as number) - (a.personalized_score as number))
    .slice(0, limit)

  return NextResponse.json({
    opportunities: personalizedOpportunities,
    snapshot_id: snapshot.id,
    user_id: userId,
    preference_version: preferences.preference_version
  })
}
