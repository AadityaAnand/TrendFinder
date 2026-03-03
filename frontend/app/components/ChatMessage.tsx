'use client'

import { useState } from 'react'

interface Citation {
  signal_id?: string
  title: string
  url?: string
  source?: string
  excerpt?: string
}

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  confidence?: number
  queryType?: string
  feedbackState?: 'thumbs_up' | 'thumbs_down' | null
  onThumbsUp?: () => void
  onThumbsDown?: (text?: string) => void
  isStreaming?: boolean
}

function ConfidenceDot({ score }: { score: number }) {
  const color =
    score >= 0.8
      ? 'bg-emerald-400'
      : score >= 0.5
      ? 'bg-yellow-400'
      : 'bg-orange-400'

  const label =
    score >= 0.8 ? 'High confidence' : score >= 0.5 ? 'Medium confidence' : 'Lower confidence'

  const pct = Math.round(score * 100)

  return (
    <span title={`${label} (${pct}%)`} className="inline-flex items-center gap-1 ml-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
    </span>
  )
}

export function ChatMessage({
  role,
  content,
  citations = [],
  confidence,
  queryType,
  feedbackState,
  onThumbsUp,
  onThumbsDown,
  isStreaming = false,
}: ChatMessageProps) {
  const [showFeedbackInput, setShowFeedbackInput] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')

  const isUser = role === 'user'

  const handleThumbsDown = () => {
    if (feedbackState === 'thumbs_down') return
    setShowFeedbackInput(true)
  }

  const submitNegativeFeedback = () => {
    onThumbsDown?.(feedbackText.trim() || undefined)
    setShowFeedbackInput(false)
    setFeedbackText('')
  }

  // Guard type labels
  const guardLabels: Record<string, string> = {
    temporal_guard: 'Scope limit',
    opinion_guard: 'Scope limit',
    feasibility_guard: 'Redirected',
    evidence_fallback: 'Evidence mode',
    error_fallback: 'Fallback',
  }
  const guardLabel = queryType ? guardLabels[queryType] : null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Message bubble */}
        <div
          className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-indigo-50 text-slate-800'
              : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          {content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </div>

        {/* Assistant metadata row */}
        {!isUser && !isStreaming && (
          <div className="flex items-center gap-2 mt-1 px-0.5">
            {/* Confidence dot */}
            {typeof confidence === 'number' && (
              <ConfidenceDot score={confidence} />
            )}

            {/* Guard label */}
            {guardLabel && (
              <span className="text-[10px] text-slate-400">{guardLabel}</span>
            )}

            {/* Spacer */}
            <span className="flex-1" />

            {/* Thumbs feedback */}
            {(onThumbsUp || onThumbsDown) && (
              <div className="flex items-center gap-1">
                <button
                  onClick={onThumbsUp}
                  disabled={!!feedbackState}
                  title="Helpful"
                  className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                    feedbackState === 'thumbs_up'
                      ? 'text-emerald-600'
                      : 'text-slate-300 hover:text-slate-500'
                  }`}
                >
                  ↑
                </button>
                <button
                  onClick={handleThumbsDown}
                  disabled={feedbackState === 'thumbs_down'}
                  title="Not helpful"
                  className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                    feedbackState === 'thumbs_down'
                      ? 'text-red-500'
                      : 'text-slate-300 hover:text-slate-500'
                  }`}
                >
                  ↓
                </button>
              </div>
            )}
          </div>
        )}

        {/* Thumbs-down text input */}
        {showFeedbackInput && (
          <div className="mt-1.5 px-0.5">
            <input
              type="text"
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="What was wrong? (optional)"
              maxLength={200}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-300"
              onKeyDown={e => {
                if (e.key === 'Enter') submitNegativeFeedback()
                if (e.key === 'Escape') { setShowFeedbackInput(false); setFeedbackText('') }
              }}
              autoFocus
            />
            <div className="flex gap-1.5 mt-1">
              <button
                onClick={submitNegativeFeedback}
                className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
              >
                Send
              </button>
              <button
                onClick={() => { setShowFeedbackInput(false); setFeedbackText('') }}
                className="text-[10px] px-2 py-0.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Citations */}
        {!isUser && citations.length > 0 && (
          <div className="mt-1.5 px-0.5 flex flex-wrap gap-1">
            {citations.map((c, i) => (
              c.url ? (
                <a
                  key={i}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c.excerpt || c.title}
                  className="inline-flex items-center text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition-colors max-w-[180px] truncate"
                >
                  ↗ {c.title}
                </a>
              ) : (
                <span
                  key={i}
                  title={c.excerpt || c.title}
                  className="inline-flex items-center text-[10px] px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded max-w-[180px] truncate"
                >
                  {c.title}
                </span>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
