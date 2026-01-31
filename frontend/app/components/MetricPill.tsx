import { ReactNode } from 'react'

interface MetricPillProps {
  label: string
  value: ReactNode
  className?: string
}

export function MetricPill({ label, value, className = '' }: MetricPillProps) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${className}`}>
      <span className="text-slate-400 font-medium">{label}</span>
      <span className="text-slate-700 font-semibold">{value}</span>
    </div>
  )
}

interface EvidenceDotsProps {
  sourceCount: number
  signalQuality: number
}

export function EvidenceDots({ sourceCount, signalQuality }: EvidenceDotsProps) {
  const level = sourceCount >= 4 && signalQuality >= 0.6 ? 3 :
                sourceCount >= 2 ? 2 : 1

  const labels = ['Weak', 'Moderate', 'Strong']
  const colors = ['bg-red-400', 'bg-amber-400', 'bg-emerald-400']

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-slate-400 font-medium">Evidence</span>
      <span className="flex gap-0.5">
        {[1, 2, 3].map(i => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${i <= level ? colors[level - 1] : 'bg-slate-200'}`}
          />
        ))}
      </span>
      <span className="text-slate-500">{labels[level - 1]}</span>
    </div>
  )
}
