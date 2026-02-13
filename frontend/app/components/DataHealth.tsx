'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export function DataHealth() {
  const params = useSearchParams()
  const debug = params.get('debug') === '1'
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!debug) return
    fetch('/api/debug/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({ error: 'Failed to fetch health data' }))
  }, [debug])

  if (!debug || !health) return null

  return (
    <div className="mx-auto max-w-3xl px-6 mb-6">
      <details open className="border border-amber-300 bg-amber-50 rounded-lg p-4 text-xs font-mono">
        <summary className="font-semibold text-amber-800 cursor-pointer mb-2">
          Data Health Diagnostic
        </summary>
        <pre className="whitespace-pre-wrap text-amber-900 overflow-auto max-h-96">
          {JSON.stringify(health, null, 2)}
        </pre>
      </details>
    </div>
  )
}
