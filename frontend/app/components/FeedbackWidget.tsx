'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'

export function FeedbackWidget() {
  const { isLoggedIn, profileId } = useAuth()
  const [open, setOpen] = useState(false)
  const [workingWell, setWorkingWell] = useState('')
  const [couldBeBetter, setCouldBeBetter] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (!isLoggedIn) return null

  const handleSubmit = async () => {
    if (!workingWell && !couldBeBetter) return
    try {
      setSubmitting(true)
      await fetch('/api/feedback/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: profileId,
          working_well: workingWell || null,
          could_be_better: couldBeBetter || null,
        }),
      })
      setSubmitted(true)
    } catch {
      /* silent */
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    // Reset after closing so they can submit again later
    if (submitted) {
      setTimeout(() => {
        setSubmitted(false)
        setWorkingWell('')
        setCouldBeBetter('')
      }, 300)
    }
  }

  return (
    <div className="fixed right-0 bottom-24 z-40 flex items-end">
      {/* Rotated tab button */}
      <button
        onClick={() => setOpen(!open)}
        className="origin-bottom-right rotate-[-90deg] translate-y-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-t-md transition-colors select-none"
        style={{ marginBottom: '-1px' }}
      >
        Feedback
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="absolute right-8 bottom-0 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-900">Quick feedback</p>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {submitted ? (
            <div className="py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-slate-600">Thanks — your feedback helps a lot.</p>
            </div>
          ) : (
            <>
              <label className="block text-xs text-slate-500 mb-1">What&apos;s working well?</label>
              <textarea
                value={workingWell}
                onChange={e => setWorkingWell(e.target.value)}
                rows={2}
                placeholder="Something you like about Rishi..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none transition mb-3"
              />
              <label className="block text-xs text-slate-500 mb-1">What could be better?</label>
              <textarea
                value={couldBeBetter}
                onChange={e => setCouldBeBetter(e.target.value)}
                rows={2}
                placeholder="Something confusing or missing..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none transition mb-3"
              />
              <button
                onClick={handleSubmit}
                disabled={submitting || (!workingWell && !couldBeBetter)}
                className={`w-full py-2 rounded-lg text-xs font-semibold transition ${
                  submitting || (!workingWell && !couldBeBetter)
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {submitting ? 'Sending...' : 'Send feedback'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
