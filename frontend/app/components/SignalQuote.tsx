export function SignalQuote({
  phrase,
  quote,
  source,
}: {
  phrase: string
  quote?: string
  source?: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-800 font-medium">{phrase}</p>
      {quote && (
        <p className="text-sm text-slate-500 italic pl-3 border-l-2 border-slate-200 mt-1">
          {quote}
        </p>
      )}
      {source && <p className="text-xs text-slate-400">{source}</p>}
    </div>
  )
}
