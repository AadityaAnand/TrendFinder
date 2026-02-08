const METRIC_EXPLANATIONS: Record<string, { label: string; explanation: string }> = {
  momentum: {
    label: 'Momentum',
    explanation: 'How much attention this trend is getting right now. Calculated from engagement scores across sources, weighted by recency (newer signals count more). Range: 0 to 1.',
  },
  peak_momentum: {
    label: 'Peak Momentum',
    explanation: 'The highest momentum this trend has ever reached. If current momentum is much lower than peak, the trend may be declining.',
  },
  signal_count: {
    label: 'Signals',
    explanation: 'Number of independent mentions across Hacker News, GitHub, Dev.to, and Reddit. More signals from different sources = higher confidence.',
  },
  stage: {
    label: 'Lifecycle Stage',
    explanation: 'Where this trend is in its lifecycle. Emerging = just appeared. Rising = growing fast. Peaking = at maximum attention. Stable = consistent interest. Declining = losing attention.',
  },
  qualified: {
    label: 'Qualified',
    explanation: 'A trend becomes "qualified" when it passes all evidence gates: 2+ independent sources, demand signals (people asking "how to", "alternative to"), a specific buildable action, and lifecycle confidence above 60%.',
  },
  timing: {
    label: 'Timing',
    explanation: 'Classification of the market window. Early Edge = good time to enter. Crowded = many players. Too Early = not enough data. Late but Monetizable = saturating but revenue paths exist.',
  },
  competition: {
    label: 'Competition',
    explanation: 'Estimated competitive landscape based on existing solutions, GitHub activity, and community discussions. Low = few established players. High = saturated market.',
  },
  confidence: {
    label: 'Confidence',
    explanation: 'How sure the system is about its assessment. Low confidence means limited data — treat predictions with more skepticism.',
  },
}

export function MetricExplainer({ metrics }: { metrics: string[] }) {
  const relevantMetrics = metrics.filter(m => METRIC_EXPLANATIONS[m])

  if (relevantMetrics.length === 0) return null

  return (
    <details className="border border-slate-100 rounded-lg mt-4">
      <summary className="px-4 py-2.5 cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700 transition">
        What do these metrics mean?
      </summary>
      <div className="px-4 pb-3 pt-1 space-y-3 border-t border-slate-100">
        {relevantMetrics.map(key => {
          const metric = METRIC_EXPLANATIONS[key]
          return (
            <div key={key}>
              <p className="text-xs font-semibold text-slate-700">{metric.label}</p>
              <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{metric.explanation}</p>
            </div>
          )
        })}
      </div>
    </details>
  )
}
