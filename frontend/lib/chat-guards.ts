/**
 * Hallucination guard system — 5 layers of protection.
 *
 * Guards 1-3 run before LLM calls (prevent unnecessary API calls).
 * Guard 4 runs after LLM response (check output quality).
 * Guard 5 is a fallback when all else fails.
 */

export interface GuardResult {
  triggered: boolean
  guardName: string
  redirectMessage?: string
}

// ── Guard 1: Temporal ──────────────────────────────────────────────────────
// Detected upstream by chat-router.ts (returns 'temporal_guard')
export function temporalGuardMessage(): string {
  return "I can only tell you about signals and patterns that have already happened — I don't predict the future. What I can do is show you the current trajectory of this trend and let you draw your own conclusions."
}

// ── Guard 2: Opinion ───────────────────────────────────────────────────────
// Detected upstream by chat-router.ts (returns 'opinion_guard')
export function opinionGuardMessage(): string {
  return "I don't have opinions — I'm grounded in the actual signals collected for this trend. What I can show you is what the data says: the top signals, who is talking about it, and what patterns exist."
}

// ── Guard 3: Feasibility ───────────────────────────────────────────────────
// Checks if the question can be answered from the available context
export function checkFeasibility(message: string, contextString: string): GuardResult {
  const lowerContext = contextString.toLowerCase()

  // Extract meaningful nouns/topics from the question (words ≥4 chars, not stopwords)
  const stopwords = new Set(['what', 'when', 'where', 'which', 'this', 'that', 'there', 'their', 'about', 'would', 'could', 'should', 'have', 'with', 'from', 'into', 'tell', 'show', 'find', 'list', 'give', 'does', 'will', 'does', 'more', 'some', 'than', 'them', 'they', 'been', 'were', 'also', 'said', 'like', 'just', 'make', 'your', 'know', 'want'])
  const words = message
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopwords.has(w))

  if (words.length === 0) {
    // Very short question — can't evaluate, let it through
    return { triggered: false, guardName: 'feasibility' }
  }

  const matchCount = words.filter(word => lowerContext.includes(word)).length
  const matchRatio = matchCount / words.length

  // If fewer than 15% of key words appear in context AND message is substantive
  if (matchRatio < 0.15 && words.length >= 3) {
    const topicExample = words.slice(0, 2).join(' and ')
    return {
      triggered: true,
      guardName: 'feasibility',
      redirectMessage: `I don't have information about "${topicExample}" in the signals collected for this trend. I can tell you about: the top signals, who is affected, what to build, competition level, and timing. What would you like to explore?`,
    }
  }

  return { triggered: false, guardName: 'feasibility' }
}

// ── Guard 4: Post-generation hallucination check ────────────────────────────
// Checks LLM response for unsupported factual claims
export function checkResponseGrounding(
  response: string,
  contextString: string
): { isGrounded: boolean; supportedRatio: number; warning?: string } {
  const lowerContext = contextString.toLowerCase()

  // Extract candidate factual claims (sentences that assert something)
  const sentences = response
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20)

  if (sentences.length === 0) return { isGrounded: true, supportedRatio: 1 }

  const assertionWords = /\b(is|are|was|were|has|have|had|will|shows?|indicates?|suggests?|reveals?|found|discovered|reported|stated|said|launched|released|created|built|developed|raised|earned|generated|reached|achieved)\b/i

  const claims = sentences.filter(s => assertionWords.test(s))
  if (claims.length === 0) return { isGrounded: true, supportedRatio: 1 }

  let supported = 0
  for (const claim of claims) {
    const claimWords = claim
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4)

    const matchCount = claimWords.filter(w => lowerContext.includes(w)).length
    if (claimWords.length === 0 || matchCount / claimWords.length >= 0.2) {
      supported++
    }
  }

  const ratio = supported / claims.length

  if (ratio < 0.6) {
    return {
      isGrounded: false,
      supportedRatio: ratio,
      warning: `Note: Parts of this response may extend beyond what the signals directly show. The following is based on the collected evidence — treat speculative parts with caution.\n\n`,
    }
  }

  return { isGrounded: true, supportedRatio: ratio }
}

// ── Guard 5: Out-of-knowledge redirect ────────────────────────────────────
// When all else fails, return a helpful redirect
export function outOfKnowledgeMessage(trendName: string): string {
  return `I don't have enough information to answer that specifically for "${trendName}". Here's what I do have in the signals: top signals by engagement, source breakdown, timeline of activity, who is affected, and competition level. Which of these would be most helpful to explore?`
}
