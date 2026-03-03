/**
 * Classifies user messages into query types for the chat router.
 * Returns one of: 'evidence' | 'idea' | 'temporal_guard' | 'opinion_guard'
 *
 * Default is 'evidence' (safer fallback — DB queries can't hallucinate).
 */

export type QueryType = 'evidence' | 'idea' | 'temporal_guard' | 'opinion_guard'

// Patterns that suggest the user wants to look at actual data/evidence
const EVIDENCE_PATTERNS = [
  /\b(show|list|find|fetch|get|display|what are the)\b/i,
  /\b(signal|post|mention|article|source|link|url|cite|citation)\b/i,
  /\b(top|best|most (popular|viewed|upvoted|engaged|mentioned))\b/i,
  /\b(who (is|are|said|mentioned|talked|wrote|posted))\b/i,
  /\bwhere (did|does|is|are|can)\b/i,
  /\b(when did|when was|timeline|history|first|started|began|date)\b/i,
  /\b(how many|count|number of|volume|frequency)\b/i,
  /\b(platform|website|forum|community|subreddit|hacker news|github|reddit)\b/i,
  /\bwhat (people|users|developers|creators) (are|say|said|think)\b/i,
  /\bwhat does the (data|evidence|signal|source) say\b/i,
]

// Patterns that suggest the user wants creative ideas or recommendations
const IDEA_PATTERNS = [
  /\b(what (should|could|would|if i|can i)|how (could|would|should|can) i)\b/i,
  /\b(suggest|recommend|recommend(ation)?|advice|advise)\b/i,
  /\b(idea|approach|strategy|plan|angle|direction|variation|alternative)\b/i,
  /\b(build|create|make|launch|ship|develop|design)\b.*\b(for|that|which|to)\b/i,
  /\bbrainstorm\b/i,
  /\b(is this a good|any other|what else|more ideas|other suggestions)\b/i,
  /\bhow (do|would|could|should) (i|you|we|someone)\b/i,
  /\bwhat (would you|do you) recommend\b/i,
  /\b(best way|best approach|best strategy|best angle) to\b/i,
  /\bif (i|you|we|someone) (were|was) to\b/i,
]

// Questions about the future — cannot be answered from existing signals
const TEMPORAL_PATTERNS =
  /\b(will (this|it|they)|going to (be|become|happen)|is it going to|predict|forecast|future|projection|by (2025|2026|2027|2028|2029|2030)|next year|in the future|eventually)\b/i

// Questions asking for subjective opinions — we don't have those
const OPINION_PATTERNS =
  /\b(what do you (think|believe|feel|reckon)|do you (like|prefer|think)|your (opinion|view|take|thoughts?)|are you (sure|confident)|would you (say|recommend))\b/i

export function classifyQuery(message: string): QueryType {
  // Guard checks first (highest priority)
  if (TEMPORAL_PATTERNS.test(message)) return 'temporal_guard'
  if (OPINION_PATTERNS.test(message)) return 'opinion_guard'

  const evidenceScore = EVIDENCE_PATTERNS.filter(p => p.test(message)).length
  const ideaScore = IDEA_PATTERNS.filter(p => p.test(message)).length

  // Need idea score to clearly dominate (prefer evidence when tied)
  if (ideaScore > evidenceScore && ideaScore >= 1) return 'idea'

  return 'evidence' // safe default
}
