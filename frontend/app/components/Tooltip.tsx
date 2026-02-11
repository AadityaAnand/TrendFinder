'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  position?: 'top' | 'bottom'
  maxWidth?: string
}

export function Tooltip({ content, children, position = 'top', maxWidth = 'max-w-xs' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return

    const trigger = triggerRef.current.getBoundingClientRect()
    const tooltip = tooltipRef.current.getBoundingClientRect()

    let top: number
    if (position === 'top') {
      top = trigger.top - tooltip.height - 8
      if (top < 4) top = trigger.bottom + 8 // flip if off-screen
    } else {
      top = trigger.bottom + 8
      if (top + tooltip.height > window.innerHeight - 4) top = trigger.top - tooltip.height - 8
    }

    let left = trigger.left + trigger.width / 2 - tooltip.width / 2
    if (left < 4) left = 4
    if (left + tooltip.width > window.innerWidth - 4) left = window.innerWidth - tooltip.width - 4

    setCoords({ top, left })
  }, [visible, position])

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        tabIndex={0}
        className="inline-flex cursor-help"
        role="button"
        aria-describedby={visible ? 'tooltip' : undefined}
      >
        {children}
      </span>
      {visible && (
        <div
          ref={tooltipRef}
          id="tooltip"
          role="tooltip"
          className={`fixed z-50 px-3 py-2 text-xs leading-relaxed text-[var(--text-primary)] bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg ${maxWidth} transition-opacity duration-150 ${coords ? 'opacity-100' : 'opacity-0'}`}
          style={coords ? { top: coords.top, left: coords.left } : { top: -9999, left: -9999 }}
        >
          {content}
        </div>
      )}
    </>
  )
}
