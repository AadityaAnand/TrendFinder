import { ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-[var(--surface)] text-[var(--text-secondary)]',
  success: 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/40',
  warning: 'bg-amber-900/20 text-amber-400 border border-amber-800/40',
  danger: 'bg-red-900/20 text-red-400 border border-red-800/40',
  info: 'bg-sky-900/20 text-sky-400 border border-sky-800/40',
  muted: 'bg-[var(--bg-1)] text-[var(--text-tertiary)] border border-[var(--border)]',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium leading-tight ${VARIANT_STYLES[variant]} ${className}`}>
      {children}
    </span>
  )
}
