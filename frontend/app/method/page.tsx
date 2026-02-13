'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useEffect } from 'react'

interface AccordionItem {
  title: string
  content: React.ReactNode
}

function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isOpen = openIndex === i
        return (
          <div key={i} className="bg-white border border-slate-200 rounded-xl">
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="text-sm font-semibold text-slate-900">{item.title}</span>
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isOpen && (
              <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed">
                {item.content}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function GlossaryEntry({ term, definition }: { term: string; definition: string }) {
  return (
    <div className="flex gap-4 py-3 border-b border-slate-200 last:border-0">
      <span className="text-sm font-semibold text-indigo-600 shrink-0 w-40">{term}</span>
      <span className="text-sm text-slate-600">{definition}</span>
    </div>
  )
}

export default function MethodPage() {
  const router = useRouter()
  const { isLoggedIn, ready } = useAuth()

  useEffect(() => {
    if (ready && !isLoggedIn) router.replace('/sign-in')
  }, [ready, isLoggedIn, router])

  if (!ready) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  const pipelineSteps: AccordionItem[] = [
    {
      title: 'What is a "signal"?',
      content: (
        <div className="space-y-3">
          <p>
            A signal is any individual piece of evidence from the developer ecosystem: a Hacker News post,
            a trending GitHub repository, a Dev.to article, or a Reddit discussion.
          </p>
          <p>
            Each signal carries metadata: its source, title, URL, engagement score, and the date it was collected.
            On its own, a single signal is just noise. Rishi needs multiple signals pointing in the same direction
            before it pays attention.
          </p>
          <div className="bg-slate-50 rounded-lg p-3 mt-2">
            <p className="text-xs text-slate-500 font-medium mb-1">Example</p>
            <p className="text-xs text-slate-500">
              A Hacker News post titled &ldquo;Show HN: Open-source alternative to Notion&rdquo; with 150 points
              is one signal. A GitHub repo trending in the same space is another. Together, they start forming a trend.
            </p>
          </div>
        </div>
      )
    },
    {
      title: 'How signals become trends',
      content: (
        <div className="space-y-3">
          <p>
            Every day, Rishi collects signals from Hacker News, GitHub Trending, Dev.to, and Reddit. Duplicate URLs
            are detected and linked. Similar titles across sources are matched using fuzzy comparison.
          </p>
          <p>
            Related signals are then grouped into coherent trends using topic extraction and keyword clustering.
            Each trend gets a <strong>momentum score</strong> based on signal volume with recency weighting &mdash;
            newer signals count more than older ones (7-day exponential decay).
          </p>
          <p>
            A trend must have at least 2 independent artifacts (not the same link reposted) to be recognized.
            Single-headline items are filtered out as noise.
          </p>
        </div>
      )
    },
    {
      title: 'How signals become problem hypotheses',
      content: (
        <div className="space-y-3">
          <p>
            After trends are detected, Rishi runs a <strong>hypothesis generator</strong> that tries to identify
            the real <em>problem</em> behind the signals &mdash; not just the topic.
          </p>
          <p>
            Each trend goes through a three-tier classification:
          </p>
          <div className="space-y-2 mt-2">
            <div className="flex items-start gap-3">
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-medium">Valid</span>
              <p className="text-slate-600">Evidence is strong enough to form a problem statement. Multiple independent sources,
                demand signals, and sufficient history. An LLM synthesizes the evidence into a hypothesis title,
                summary, affected personas, and pain signals.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">Uncertain</span>
              <p className="text-slate-600">The topic shows promise but doesn&apos;t have enough independent evidence or demand signals
                to confidently say it represents a real problem. Rishi keeps watching it.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium">Topic only</span>
              <p className="text-slate-600">Signals are mostly narrative, opinion, or from a single source. This is a topic people
                are discussing, not a problem people need solved. Filtered from the default Explore view.</p>
            </div>
          </div>
          <p>
            The hypothesis classification uses deterministic gates first (source diversity, demand regex matching,
            narrative detection) and only calls the LLM when evidence passes a minimum quality bar. This avoids
            generating confident-sounding hypotheses from thin evidence.
          </p>
        </div>
      )
    },
    {
      title: 'How hypotheses become qualified opportunities',
      content: (
        <div className="space-y-3">
          <p>
            A hypothesis must pass all evidence gates to become a <strong>qualified opportunity</strong>:
          </p>
          <div className="space-y-2 mt-2">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium text-slate-900">Demand detection</p>
                <p className="text-slate-600 mt-0.5">People are asking &ldquo;how to&rdquo;, &ldquo;alternative to&rdquo;, or &ldquo;problem with&rdquo; &mdash; indicating real unmet need.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium text-slate-900">Independent evidence</p>
                <p className="text-slate-600 mt-0.5">2+ sources confirm the trend independently (not the same link shared across platforms).</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium text-slate-900">Valid hypothesis</p>
                <p className="text-slate-600 mt-0.5">The hypothesis generator must classify this as &ldquo;valid&rdquo; with confidence above 40%. Topic-only and uncertain signals are held back.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <p className="font-medium text-slate-900">Actionability</p>
                <p className="text-slate-600 mt-0.5">A specific, buildable product or feature can be suggested &mdash; not just &ldquo;this topic is popular&rdquo;.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">5</span>
              <div>
                <p className="font-medium text-slate-900">Confidence gate</p>
                <p className="text-slate-600 mt-0.5">Lifecycle stage classification confidence must exceed 60%. Below that, the data is too uncertain to recommend.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'Why some items appear in "Watching"',
      content: (
        <div className="space-y-3">
          <p>
            Trends that look promising but haven&apos;t passed all four gates yet appear in the <strong>Watching</strong> section.
            Rishi tells you exactly what&apos;s missing:
          </p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex items-start gap-2">
              <span className="text-slate-400 shrink-0">&bull;</span>
              <span>&ldquo;Needs more evidence&rdquo; &mdash; only one source so far</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 shrink-0">&bull;</span>
              <span>&ldquo;No demand signals yet&rdquo; &mdash; people are discussing it, but nobody is asking for solutions</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 shrink-0">&bull;</span>
              <span>&ldquo;Low confidence&rdquo; &mdash; not enough data to classify the lifecycle stage</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 shrink-0">&bull;</span>
              <span>&ldquo;No buildable action&rdquo; &mdash; interesting discussion, but no clear product opportunity yet</span>
            </li>
          </ul>
          <p>
            As more signals arrive in future pipeline runs, Watching trends may graduate to qualified opportunities.
          </p>
        </div>
      )
    },
    {
      title: 'What "momentum" means',
      content: (
        <div className="space-y-3">
          <p>
            Momentum is a composite score reflecting how much attention a trend is getting right now,
            weighted toward recent activity. It&apos;s calculated as:
          </p>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-mono text-slate-500">
              momentum = sum(signal_weights &times; exponential_decay) / p90_baseline
            </p>
          </div>
          <p>
            Each signal contributes a weight based on its engagement score. Older signals decay exponentially over 7 days.
            The result is normalized against the 90th percentile baseline, so a momentum of 1.0 means the trend is performing
            at the top 10% of all detected trends.
          </p>
          <p>
            <strong>Peak momentum</strong> records the highest momentum this trend has ever reached.
            Current momentum as a percentage of peak tells you whether the trend is accelerating or cooling off.
          </p>
        </div>
      )
    },
    {
      title: 'For You vs. Explore',
      content: (
        <div className="space-y-3">
          <p>
            <strong>For You</strong> shows problem hypotheses personalized to your profile. Your roles, domains,
            tech stack, time horizon, team size, and risk tolerance are used to rank hypotheses by relevance.
            The ranking formula: 60% quality score + 40% relevance to your preferences.
          </p>
          <p>
            Personalization only changes the <em>order</em> of results &mdash; it never hides qualified hypotheses.
            If no hypotheses have passed all evidence gates, Rishi shows top emerging signals still gathering evidence.
          </p>
          <p>
            <strong>Explore</strong> shows every hypothesis, regardless of qualification status or your preferences.
            You can filter by hypothesis status (valid, uncertain, topic-only) and lifecycle stage.
            Topic-only items are shown with muted styling but visible by default.
          </p>
        </div>
      )
    },
    {
      title: 'How hypothesis titles are generated',
      content: (
        <div className="space-y-3">
          <p>
            When Rishi has enough evidence to form a valid hypothesis, the LLM generates a <strong>problem statement</strong>
            as the title &mdash; e.g., &ldquo;Teams can&apos;t track AI tool usage costs&rdquo; instead of just &ldquo;AI cost tracking&rdquo;.
          </p>
          <p>
            For uncertain or topic-only signals, you&apos;ll see the trend&apos;s topic name as a fallback. As more
            evidence arrives, Rishi may upgrade the classification and generate a proper hypothesis title.
          </p>
          <p>
            This is intentional: Rishi prefers showing you uncertain-but-honest labels over making up confident-sounding
            problem statements that might mislead you.
          </p>
        </div>
      )
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">How Rishi works</h1>
          <p className="text-base text-slate-500 mt-2 max-w-2xl leading-relaxed">
            Rishi watches signals, forms problem hypotheses, and surfaces what&apos;s actionable.
            Here&apos;s exactly how it works, from raw data to personalized recommendations.
          </p>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-6 text-xs text-slate-400 mb-6">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              4 sources scraped daily
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              5 evidence gates
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Deterministic scoring
            </span>
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">The pipeline</h2>
          <Accordion items={pipelineSteps} />
        </div>

        <div className="mb-12">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Glossary</h2>
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-2">
            <GlossaryEntry
              term="Signal"
              definition="A single piece of evidence: an HN post, GitHub repo, Dev.to article, or Reddit thread. Raw input to the pipeline."
            />
            <GlossaryEntry
              term="Trend"
              definition="A cluster of related signals pointing to the same topic. Requires 2+ independent artifacts to be recognized."
            />
            <GlossaryEntry
              term="Momentum"
              definition="A recency-weighted score of how much attention a trend is getting. Higher = more recent activity. Normalized against the 90th percentile."
            />
            <GlossaryEntry
              term="Lifecycle stage"
              definition="Where a trend sits in its lifecycle: emerging, rising, peaking, stable, or declining. Derived from momentum acceleration patterns."
            />
            <GlossaryEntry
              term="Problem hypothesis"
              definition="A problem statement synthesized from evidence signals. Valid hypotheses identify who is affected, what pain they feel, and what demand exists."
            />
            <GlossaryEntry
              term="Hypothesis status"
              definition="Valid = strong evidence for a real problem. Uncertain = promising but needs more data. Topic only = discussion without a clear problem to solve."
            />
            <GlossaryEntry
              term="Qualified opportunity"
              definition="A hypothesis that has passed all five evidence gates: demand, independence, valid hypothesis, actionability, and confidence. Ready for action."
            />
            <GlossaryEntry
              term="Watching"
              definition="A signal that hasn't formed a valid hypothesis yet. Rishi tracks it and will promote it when evidence strengthens."
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
          <p className="text-sm text-slate-600 mb-1">
            Every score is a weighted formula. Every uncertainty is flagged.
          </p>
          <p className="text-xs text-slate-400">
            Rishi is built on guardrails, not hype. If you see something that seems wrong, that&apos;s a bug &mdash; not a feature.
          </p>
        </div>
      </div>
    </div>
  )
}
