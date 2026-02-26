'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

export function LiveSignalCounter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial)

  useEffect(() => {
    const channel = supabase
      .channel('live-signal-counter')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'raw_signals' },
        () => setCount(c => c + 1)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
      {count} signal{count !== 1 ? 's' : ''} collected today
    </span>
  )
}
