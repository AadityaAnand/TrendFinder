/**
 * POST /api/chat/completion
 * Streaming SSE endpoint for chat AI responses.
 * Routes to evidence handler (DB queries) or idea handler (Groq LLM).
 * Applies hallucination guards throughout.
 *
 * SSE event format:
 *   data: {"type":"token","content":"..."}
 *   data: {"type":"citations","citations":[...],"confidence":0.9,"query_type":"..."}
 *   data: {"type":"done"}
 *   data: {"type":"error","message":"..."}
 */

import { getServerSupabase } from '@/lib/supabase-server'
import { classifyQuery } from '@/lib/chat-router'
import { assembleTrendContext } from '@/lib/chat-context'
import { handleEvidenceQuery } from '@/lib/chat-evidence'
import {
  temporalGuardMessage,
  opinionGuardMessage,
  checkFeasibility,
  checkResponseGrounding,
  outOfKnowledgeMessage,
} from '@/lib/chat-guards'
import type { Citation } from '@/lib/chat-context'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// SSE helpers
function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function sseToken(content: string): string {
  return sseEvent({ type: 'token', content })
}

function sseCitations(citations: Citation[], confidence: number, queryType: string): string {
  return sseEvent({ type: 'citations', citations, confidence, query_type: queryType })
}

function sseDone(): string {
  return sseEvent({ type: 'done' })
}

function sseError(message: string): string {
  return sseEvent({ type: 'error', message })
}

// Prompt builder
function buildPrompt(
  variant: string,
  trendName: string,
  contextString: string,
  conversationHistory: { role: string; content: string }[],
  userMessage: string
): { role: string; content: string }[] {
  const systemBase = `You are an assistant helping users explore a market opportunity called "${trendName}".
You ONLY know what is in the context below. Do not make up information that isn't there.

=== CONTEXT ===
${contextString}
=== END CONTEXT ===

Rules:
1. Only use facts from the context above. Never invent signals, statistics, companies, or URLs.
2. Cite the signal that supports each claim using [Source: signal title].
3. If asked about something not in context, say: "I don't have data on that in the signals. Here's what I do know: ..."
4. Keep responses under 300 words unless the user asks for more detail.
5. Use bullet points when listing multiple ideas.
6. Never make predictions about the future.`

  // prompt_v2 adds few-shot examples
  const systemPrompt = variant === 'prompt_v2'
    ? systemBase + `\n\nExample of a good response:
User: What are the top signals?
Assistant: Here are the strongest signals for this trend:
• [Source: "Developers struggling with X on HN"] — This post got 320 points and 89 comments, showing strong developer interest.
• [Source: "New GitHub repo for Y"] — 1.2k stars in 2 weeks indicates rapid adoption.
Always cite like this.`
    : systemBase

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-8), // last 8 turns for context window efficiency
    { role: 'user', content: userMessage },
  ]

  return messages
}

// Store a message in the DB and update session counts
async function storeMessage(
  db: ReturnType<typeof getServerSupabase>,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  opts: {
    evidence_citations?: Citation[]
    confidence_score?: number
    query_type?: string
    metadata?: Record<string, unknown>
  } = {}
) {
  await db.from('opportunity_chat_messages').insert({
    session_id: sessionId,
    role,
    content,
    evidence_citations: opts.evidence_citations || null,
    confidence_score: opts.confidence_score ?? null,
    query_type: opts.query_type || null,
    metadata: opts.metadata || null,
  })

  // Increment session message_count and update updated_at
  await db.rpc('increment_chat_session_count', { session_id_param: sessionId }).catch(() => {
    // RPC may not exist yet — fall back to a manual update
    db.from('opportunity_chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)
  })
}

export async function POST(request: Request) {
  const db = getServerSupabase()
  const body = await request.json()
  const { session_id, user_id, trend_id, message } = body

  // ── Validation ──────────────────────────────────────────────────────────
  if (!session_id || !user_id || !trend_id || !message) {
    return Response.json({ error: 'session_id, user_id, trend_id, and message are required' }, { status: 400 })
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    return Response.json({ error: 'message must be a non-empty string' }, { status: 400 })
  }

  if (message.length > 2000) {
    return Response.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
  }

  // Content / injection check
  const injectionPatterns = [/ignore previous (instructions|prompt)/i, /system:/i, /<\|im_start\|>/i, /\[INST\]/i]
  if (injectionPatterns.some(p => p.test(message))) {
    return Response.json({ error: 'Invalid message content' }, { status: 400 })
  }

  // ── Verify session ownership ─────────────────────────────────────────────
  const { data: session } = await db
    .from('opportunity_chat_sessions')
    .select('id, user_id, message_count, variant')
    .eq('id', session_id)
    .single()

  if (!session) return Response.json({ error: 'Session not found' }, { status: 404 })
  if (session.user_id !== user_id) return Response.json({ error: 'Unauthorized' }, { status: 403 })

  // ── Rate limiting ────────────────────────────────────────────────────────
  if (session.message_count >= 50) {
    return Response.json({ error: 'Session message limit reached. Start a new chat.' }, { status: 429 })
  }

  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  const { count: hourCount } = await db
    .from('opportunity_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .in('session_id',
      db.from('opportunity_chat_sessions').select('id').eq('user_id', user_id)
    )
    .gte('created_at', oneHourAgo)

  if ((hourCount || 0) >= 30) {
    return Response.json({ error: 'Rate limit: 30 messages per hour. Please try again later.' }, { status: 429 })
  }

  // ── Store user message ───────────────────────────────────────────────────
  await storeMessage(db, session_id, 'user', message.trim())

  // ── Set up SSE stream ────────────────────────────────────────────────────
  const encoder = new TextEncoder()
  const startTime = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(data))

      try {
        const queryType = classifyQuery(message)

        // ── Guard routes (no LLM call needed) ───────────────────────────────
        if (queryType === 'temporal_guard') {
          const content = temporalGuardMessage()
          send(sseToken(content))
          send(sseCitations([], 0, 'temporal_guard'))
          send(sseDone())
          await storeMessage(db, session_id, 'assistant', content, {
            query_type: 'temporal_guard',
            confidence_score: 0,
            metadata: { guard_triggered: 'temporal', latency_ms: Date.now() - startTime },
          })
          controller.close()
          return
        }

        if (queryType === 'opinion_guard') {
          const content = opinionGuardMessage()
          send(sseToken(content))
          send(sseCitations([], 0, 'opinion_guard'))
          send(sseDone())
          await storeMessage(db, session_id, 'assistant', content, {
            query_type: 'opinion_guard',
            confidence_score: 0,
            metadata: { guard_triggered: 'opinion', latency_ms: Date.now() - startTime },
          })
          controller.close()
          return
        }

        // ── Evidence route ───────────────────────────────────────────────────
        if (queryType === 'evidence') {
          const result = await handleEvidenceQuery(trend_id, message)
          // Stream evidence response as tokens (simulate streaming for UX consistency)
          const words = result.content.split(' ')
          for (let i = 0; i < words.length; i += 3) {
            send(sseToken(words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '')))
            await new Promise(r => setTimeout(r, 15))
          }
          send(sseCitations(result.citations, result.confidence, 'evidence'))
          send(sseDone())
          await storeMessage(db, session_id, 'assistant', result.content, {
            evidence_citations: result.citations,
            confidence_score: result.confidence,
            query_type: 'evidence',
            metadata: { latency_ms: Date.now() - startTime },
          })
          controller.close()
          return
        }

        // ── Idea route (LLM) ─────────────────────────────────────────────────
        const ctx = await assembleTrendContext(trend_id)

        // Guard 3: Feasibility check
        const feasibility = checkFeasibility(message, ctx.contextString)
        if (feasibility.triggered && feasibility.redirectMessage) {
          const content = feasibility.redirectMessage
          send(sseToken(content))
          send(sseCitations([], 0, 'feasibility_guard'))
          send(sseDone())
          await storeMessage(db, session_id, 'assistant', content, {
            query_type: 'feasibility_guard',
            confidence_score: 0,
            metadata: { guard_triggered: 'feasibility', latency_ms: Date.now() - startTime },
          })
          controller.close()
          return
        }

        // Fetch conversation history for context
        const { data: historyRows } = await db
          .from('opportunity_chat_messages')
          .select('role, content')
          .eq('session_id', session_id)
          .order('created_at', { ascending: true })
          .limit(16)

        const history = (historyRows || []).map(r => ({ role: r.role, content: r.content }))

        const groqKey = process.env.GROQ_API_KEY
        if (!groqKey) {
          // Graceful degradation — fall back to evidence mode
          const result = await handleEvidenceQuery(trend_id, message)
          const content = `(AI generation unavailable — showing evidence instead)\n\n${result.content}`
          send(sseToken(content))
          send(sseCitations(result.citations, result.confidence, 'evidence_fallback'))
          send(sseDone())
          await storeMessage(db, session_id, 'assistant', content, {
            evidence_citations: result.citations,
            confidence_score: result.confidence,
            query_type: 'evidence_fallback',
          })
          controller.close()
          return
        }

        // Call Groq streaming API
        const messages = buildPrompt(session.variant, ctx.trendName, ctx.contextString, history, message)
        let llmResponse: Response
        try {
          llmResponse = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${groqKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: GROQ_MODEL,
              messages,
              temperature: 0.3,
              max_tokens: 600,
              stream: true,
            }),
          })
        } catch {
          // Network error — fall back to evidence
          const result = await handleEvidenceQuery(trend_id, message)
          const content = `(AI generation unavailable — showing evidence instead)\n\n${result.content}`
          send(sseToken(content))
          send(sseCitations(result.citations, result.confidence, 'evidence_fallback'))
          send(sseDone())
          await storeMessage(db, session_id, 'assistant', content, {
            evidence_citations: result.citations,
            confidence_score: result.confidence,
            query_type: 'evidence_fallback',
          })
          controller.close()
          return
        }

        if (!llmResponse.ok) {
          // LLM error — fall back to evidence
          const result = await handleEvidenceQuery(trend_id, message)
          const content = `(AI generation temporarily unavailable — showing evidence instead)\n\n${result.content}`
          send(sseToken(content))
          send(sseCitations(result.citations, result.confidence, 'evidence_fallback'))
          send(sseDone())
          await storeMessage(db, session_id, 'assistant', content, {
            evidence_citations: result.citations,
            confidence_score: result.confidence,
            query_type: 'evidence_fallback',
          })
          controller.close()
          return
        }

        // Stream LLM tokens
        const reader = llmResponse.body?.getReader()
        const dec = new TextDecoder()
        let fullContent = ''
        let tokenCount = 0

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = dec.decode(value, { stream: true })
            const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
            for (const line of lines) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') break
              try {
                const parsed = JSON.parse(data)
                const token = parsed.choices?.[0]?.delta?.content || ''
                if (token) {
                  fullContent += token
                  tokenCount++
                  send(sseToken(token))
                }
              } catch { /* skip malformed chunks */ }
            }
          }
        }

        // Guard 4: Post-generation hallucination check
        const groundingCheck = checkResponseGrounding(fullContent, ctx.contextString)
        let finalContent = fullContent
        if (!groundingCheck.isGrounded && groundingCheck.warning) {
          finalContent = groundingCheck.warning + fullContent
          // Re-emit warning prefix
          send(sseToken('\n\n' + groundingCheck.warning))
        }

        // Build citations from signals mentioned in response
        const mentionedCitations: Citation[] = ctx.signals.filter(sig =>
          fullContent.toLowerCase().includes(sig.title.toLowerCase().slice(0, 20))
        ).slice(0, 5)

        const confidence = Math.min(0.9, Math.max(0.3, groundingCheck.supportedRatio * 0.9))

        send(sseCitations(mentionedCitations, confidence, 'idea'))
        send(sseDone())

        await storeMessage(db, session_id, 'assistant', finalContent, {
          evidence_citations: mentionedCitations,
          confidence_score: confidence,
          query_type: 'idea',
          metadata: {
            model: GROQ_MODEL,
            latency_ms: Date.now() - startTime,
            token_count: tokenCount,
            grounding_ratio: groundingCheck.supportedRatio,
            variant: session.variant,
          },
        })

        controller.close()
      } catch (err) {
        send(sseError(err instanceof Error ? err.message : 'An error occurred'))
        // Fall back to out-of-knowledge message
        const fallback = outOfKnowledgeMessage(trend_id)
        await storeMessage(db, session_id, 'assistant', fallback, {
          query_type: 'error_fallback',
          metadata: { error: String(err), latency_ms: Date.now() - startTime },
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
