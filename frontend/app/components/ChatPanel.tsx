'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ChatMessage } from './ChatMessage'

interface Citation {
  signal_id?: string
  title: string
  url?: string
  source?: string
  excerpt?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  confidence?: number
  queryType?: string
  feedbackState?: 'thumbs_up' | 'thumbs_down' | null
}

interface Session {
  id: string
  message_count: number
  updated_at: string
  preview: string | null
}

interface ChatPanelProps {
  trendId: string
  trendName: string
}

const SUGGESTED_QUESTIONS = [
  "What are the top signals?",
  "Who is this opportunity for?",
  "What should I build?",
  "How do I validate this?",
]

export function ChatPanel({ trendId, trendName }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streamingContent, setStreamingContent] = useState('')
  const [showSessionList, setShowSessionList] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auth: get user
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id || null)
    })
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Close panel on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Only close on mobile (panel is overlay)
        if (window.innerWidth < 768) setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Auto-resize textarea
  const resizeTextarea = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const loadSessions = useCallback(async (uid: string) => {
    const res = await fetch(`/api/chat/session?trend_id=${trendId}&user_id=${uid}`)
    if (!res.ok) return
    const data = await res.json()
    setSessions(data.sessions || [])
    return data.sessions as Session[]
  }, [trendId])

  const loadMessages = useCallback(async (sid: string) => {
    const res = await fetch(`/api/chat/session/${sid}/messages`)
    if (!res.ok) return
    const data = await res.json()
    const msgs: Message[] = (data.messages || []).map((m: {
      id: string
      role: 'user' | 'assistant'
      content: string
      evidence_citations?: Citation[]
      confidence_score?: number
      query_type?: string
    }) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      citations: m.evidence_citations || [],
      confidence: m.confidence_score ?? undefined,
      queryType: m.query_type || undefined,
      feedbackState: null,
    }))
    setMessages(msgs)
  }, [])

  const createSession = useCallback(async (uid: string) => {
    const res = await fetch('/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trend_id: trendId, user_id: uid }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.session_id as string
  }, [trendId])

  // Open panel: load sessions or create new
  const handleOpen = useCallback(async () => {
    setIsOpen(true)
    if (!userId) return
    const existing = await loadSessions(userId)
    if (existing && existing.length > 0) {
      const latest = existing[0]
      setSessionId(latest.id)
      await loadMessages(latest.id)
    } else {
      const sid = await createSession(userId)
      if (sid) {
        setSessionId(sid)
        setMessages([])
        await loadSessions(userId)
      }
    }
  }, [userId, loadSessions, loadMessages, createSession])

  const handleNewChat = async () => {
    if (!userId) return
    const sid = await createSession(userId)
    if (sid) {
      setSessionId(sid)
      setMessages([])
      setStreamingContent('')
      setShowSessionList(false)
      await loadSessions(userId)
    }
  }

  const handleSelectSession = async (sid: string) => {
    setSessionId(sid)
    setMessages([])
    setStreamingContent('')
    setShowSessionList(false)
    await loadMessages(sid)
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setIsLoading(false)
    setStreamingContent('')
  }

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || isLoading || !sessionId || !userId) return

    if (!overrideText) {
      setInput('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }
    setError(null)

    // Optimistic user message
    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, { id: tempId, role: 'user', content: text }])
    setIsLoading(true)
    setStreamingContent('')

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat/completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: userId,
          trend_id: trendId,
          message: text,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Request failed')
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let accumulated = ''
      let finalCitations: Citation[] = []
      let finalConfidence: number | undefined
      let finalQueryType: string | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const data = line.slice(6).trim()
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'token') {
              accumulated += parsed.content
              setStreamingContent(accumulated)
            } else if (parsed.type === 'citations') {
              finalCitations = parsed.citations || []
              finalConfidence = parsed.confidence
              finalQueryType = parsed.query_type
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message)
            }
          } catch { /* skip malformed */ }
        }
      }

      // Replace streaming content with final message
      const assistantId = `assistant-${Date.now()}`
      setMessages(prev => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: accumulated,
          citations: finalCitations,
          confidence: finalConfidence,
          queryType: finalQueryType,
          feedbackState: null,
        },
      ])
      setStreamingContent('')

      // Refresh session list for updated preview
      loadSessions(userId)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User stopped generation — not an error
        return
      }
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStreamingContent('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestedQuestion = (q: string) => {
    setInput(q)
    handleSend(q)
  }

  const handleExport = () => {
    const lines: string[] = []
    for (const m of messages) {
      lines.push(m.role === 'user' ? '[You]:' : '[Rishi]:')
      lines.push(m.content)
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rishi-chat-${trendId.slice(0, 8)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFeedback = async (
    messageId: string,
    feedbackType: 'thumbs_up' | 'thumbs_down',
    feedbackText?: string
  ) => {
    if (!userId) return

    // Optimistic update
    setMessages(prev =>
      prev.map(m => m.id === messageId ? { ...m, feedbackState: feedbackType } : m)
    )

    await fetch('/api/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_id: messageId,
        user_id: userId,
        feedback_type: feedbackType,
        feedback_text: feedbackText,
      }),
    }).catch(() => {
      // Revert on failure
      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, feedbackState: null } : m)
      )
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg transition-colors"
        aria-label="Open chat"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        Ask Rishi
      </button>

      {/* Panel */}
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div
            ref={panelRef}
            className="fixed right-0 top-0 bottom-0 z-50 w-full md:w-[400px] bg-white flex flex-col shadow-2xl"
            style={{ maxHeight: '100dvh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">R</div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 leading-none">Ask Rishi</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px]">{trendName}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={handleExport}
                    title="Export conversation"
                    className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
                    aria-label="Export conversation"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setShowSessionList(v => !v)}
                  title="Chat history"
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded transition-colors"
                >
                  History
                </button>
                <button
                  onClick={handleNewChat}
                  title="New chat"
                  className="text-xs text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded transition-colors font-medium"
                >
                  + New
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Session list dropdown */}
            {showSessionList && sessions.length > 0 && (
              <div className="border-b border-slate-100 bg-slate-50 max-h-48 overflow-y-auto shrink-0">
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-slate-100 transition-colors border-b border-slate-100 last:border-0 ${
                      s.id === sessionId ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <p className="text-xs text-slate-600 truncate">{s.preview || 'New conversation'}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.message_count} msgs · {new Date(s.updated_at).toLocaleDateString()}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {messages.length === 0 && !streamingContent && !isLoading && (
                <div className="mt-10 px-2">
                  <div className="text-center mb-5">
                    <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-slate-700">Ask about this opportunity</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTED_QUESTIONS.map(q => (
                      <button
                        key={q}
                        onClick={() => handleSuggestedQuestion(q)}
                        disabled={!userId || !sessionId}
                        className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(m => (
                <ChatMessage
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  citations={m.citations}
                  confidence={m.confidence}
                  queryType={m.queryType}
                  feedbackState={m.feedbackState || null}
                  onThumbsUp={m.role === 'assistant' ? () => handleFeedback(m.id, 'thumbs_up') : undefined}
                  onThumbsDown={m.role === 'assistant' ? (text) => handleFeedback(m.id, 'thumbs_down', text) : undefined}
                />
              ))}

              {/* Streaming message */}
              {streamingContent && (
                <ChatMessage
                  role="assistant"
                  content={streamingContent}
                  isStreaming
                />
              )}

              {/* Typing indicator */}
              {isLoading && !streamingContent && (
                <div className="flex justify-start mb-3">
                  <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex justify-center mb-3">
                  <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">{error}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-slate-100 px-3 py-3 shrink-0">
              {!userId && (
                <p className="text-xs text-slate-400 text-center mb-2">Sign in to chat</p>
              )}
              {isLoading && streamingContent && (
                <div className="flex justify-center mb-2">
                  <button
                    onClick={handleStop}
                    className="text-xs text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1 rounded-full transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                    Stop generating
                  </button>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); resizeTextarea() }}
                  onKeyDown={handleKeyDown}
                  placeholder={userId ? 'Ask about this opportunity…' : 'Sign in to chat'}
                  disabled={!userId || isLoading}
                  rows={1}
                  className="flex-1 resize-none text-sm border border-slate-200 rounded-xl px-3 py-2 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ minHeight: '40px', maxHeight: '120px' }}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!userId || isLoading || !input.trim()}
                  className="shrink-0 w-9 h-9 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white rounded-xl flex items-center justify-center transition-colors"
                  aria-label="Send"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="text-[10px] text-slate-300 mt-1.5 text-center">
                Answers grounded in collected signals · Enter to send
              </p>
            </div>
          </div>
        </>
      )}
    </>
  )
}
