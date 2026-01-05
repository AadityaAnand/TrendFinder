import { supabase } from '@/lib/supabase'

export default async function TrendsPage() {
  
  const { data: signals, error } = await supabase
    .from('raw_signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return <div>Error loading trends: {error.message}</div>
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Trend Signals</h1>

      <div className="space-y-4">
        {signals?.map((signal) => (
          <div key={signal.id} className="border p-4 rounded-lg hover:shadow-lg transition-shadow">
            <h2 className="text-xl font-semibold mb-2">
              {signal.url ? (
                <a href={signal.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {signal.title}
                </a>
              ) : (
                signal.title
              )}
            </h2>

            <div className="flex gap-4 text-sm text-gray-600">
              <span className="font-medium capitalize">{signal.source}</span>
              <span>Score: {signal.score}</span>
              <span>Comments: {signal.comments_count}</span>
              <span>{new Date(signal.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {signals?.length === 0 && (
        <p className="text-gray-500 text-center mt-8">No signals found. Run the scraper first!</p>
      )}
    </div>
  )
}
