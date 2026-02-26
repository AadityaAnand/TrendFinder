export default function FAQPage() {
  const faqs = [
    {
      q: 'What is Rishi?',
      a: 'Rishi is an early opportunity radar for builders. It continuously monitors developer communities — Hacker News, GitHub, Reddit, Product Hunt, Dev.to, IndieHackers, and Substack — to surface emerging builder needs before they become obvious. Each opportunity comes as a narrative brief with evidence, personas, and concrete build ideas.',
    },
    {
      q: 'Where does the data come from?',
      a: 'Rishi ingests signals from 7 public sources: Hacker News (top stories and "Ask HN" threads), GitHub (trending repositories), Reddit (r/startups, r/SaaS, r/SomebodyMakeThis, and more), Product Hunt (new launches), Dev.to (developer articles), IndieHackers (trending posts), and Substack newsletters. All data is publicly available.',
    },
    {
      q: 'How do you detect real demand vs. hype?',
      a: 'Every opportunity must pass a multi-stage evidence pipeline: signals are clustered by semantic similarity, then scored for "demand density" (how many signals express a genuine need vs. just mentioning a topic), then checked against an evidence gate requiring at least 2 independent canonical artifacts. Reddit-only signals don\'t pass — you need corroboration from a distinct source like GitHub or HN.',
    },
    {
      q: 'What\'s the "evidence gate"?',
      a: 'The evidence gate is a hard requirement that at least 2 independent sources (GitHub repos, HN posts, Dev.to articles, Product Hunt launches, IndieHackers posts, or Substack articles) confirm a trend before it qualifies. This filters out single-thread spikes and ensures what you see has real, cross-community validation.',
    },
    {
      q: 'How is this different from following trends on Twitter or Reddit?',
      a: 'Manual scanning is noisy, time-consuming, and biased toward what\'s loudest rather than what\'s genuinely needed. Rishi runs 24/7, normalizes engagement across sources (a 5-upvote GitHub issue is weighted differently than a 500-upvote Reddit post), applies demand classification to separate real problems from casual mentions, and delivers pre-synthesized briefs so you can act without doing the research yourself.',
    },
    {
      q: 'How often is the feed updated?',
      a: 'Scrapers run on independent schedules: Hacker News every 2 hours, Reddit every 4 hours, GitHub every 6 hours, Dev.to every 8 hours, IndieHackers every 8 hours, Substack twice daily, and Product Hunt once daily. The detection and qualification pipeline runs once each morning at 6 AM UTC and publishes new briefs.',
    },
    {
      q: 'How does personalization work?',
      a: 'Your goal, experience level, domains of interest, tech stack, time horizon, team size, and risk tolerance are used to re-rank opportunities. Rishi scores each opportunity against your preferences using relevance dimensions (domain match, stack match, effort fit, risk fit) and ranks your feed accordingly. Saving or dismissing opportunities feeds a learning engine that adjusts these weights over time.',
    },
    {
      q: 'How much does it cost?',
      a: 'Rishi is free during beta. Pricing for later phases hasn\'t been decided yet. Early users will be grandfathered in.',
    },
    {
      q: 'Can I request new sources or topics?',
      a: 'Yes. Use the feedback widget (bottom-right corner when logged in) to suggest sources or topics you\'d like covered. High-demand requests will be prioritized.',
    },
    {
      q: 'What happens to my data?',
      a: 'Your preferences and feedback are stored to improve your personalized feed. None of your data is sold or shared with third parties. Rishi only reads publicly available content from the sources it monitors.',
    },
  ]

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-3">
          Frequently asked questions
        </h1>
        <p className="text-base text-slate-500">
          Everything you need to know about how Rishi works.
        </p>
      </div>

      <div className="space-y-0 divide-y divide-slate-100">
        {faqs.map((faq, i) => (
          <details key={i} className="group py-5">
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <span className="text-base font-medium text-slate-900 pr-8">{faq.q}</span>
              <span className="shrink-0 text-slate-400 group-open:rotate-180 transition-transform">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </summary>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              {faq.a}
            </p>
          </details>
        ))}
      </div>

      <div className="mt-16 p-6 bg-slate-50 rounded-xl">
        <p className="text-sm font-medium text-slate-900 mb-1">Still have questions?</p>
        <p className="text-sm text-slate-500">
          Use the feedback widget (bottom-right when logged in) or{' '}
          <a
            href="https://github.com/anthropics/claude-code/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            reach out directly
          </a>
          .
        </p>
      </div>
    </div>
  )
}
