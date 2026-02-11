import Link from 'next/link'

export default function LearnPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">How Rishi Works</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-2 leading-relaxed">
            Every number on this platform is computed from raw data, not guessed.
            This page explains what each metric means, how it is calculated, and what it tells you about a trend.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Current Momentum</h2>
          <div className="text-sm text-[var(--text-secondary)] space-y-2 leading-relaxed">
            <p>
              Momentum measures how fast a trend is growing right now. It is calculated from the volume
              of signals (Hacker News stories, GitHub repos, Reddit posts, Dev.to articles) mentioning
              a trend, weighted by recency using a 7-day exponential decay function.
            </p>
            <p>
              Raw scores are normalized using p90 (90th percentile) normalization against all active trends.
              A momentum of <strong>1.0</strong> means this trend is at the 90th percentile of activity.
              Values above 1.0 indicate exceptional activity; values near 0 indicate low or stale activity.
            </p>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mt-3">
              <p className="text-xs font-mono text-[var(--text-tertiary)]">
                momentum = sum(signal_weight * decay(age_days)) / p90_baseline
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Scoring version: norm-p90-decay7d-v1
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Peak Momentum</h2>
          <div className="text-sm text-[var(--text-secondary)] space-y-2 leading-relaxed">
            <p>
              The highest momentum score this trend has ever reached across all daily snapshots.
              Comparing current momentum to peak momentum tells you where a trend stands relative
              to its own history.
            </p>
            <p>
              The percentage shown next to peak momentum (e.g., <span className="font-mono text-[var(--text-tertiary)]">72%</span>)
              indicates what fraction of its peak the trend is currently at. A trend at 100% of its peak
              is at its all-time high. A trend at 30% has lost significant momentum from its peak.
            </p>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mt-3">
              <p className="text-xs text-[var(--text-tertiary)]">
                <strong>At peak:</strong> Current = Peak. Trend is at its strongest observed activity.
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                <strong>Below peak:</strong> Activity has declined from its historical high. Could mean the trend is maturing, seasonal, or losing interest.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Lifecycle Stage</h2>
          <div className="text-sm text-[var(--text-secondary)] space-y-2 leading-relaxed">
            <p>
              Every trend moves through a lifecycle. The stage is determined by analyzing
              momentum acceleration patterns across consecutive daily snapshots. A trend needs
              at least 2 snapshots before a stage can be computed (otherwise it shows &quot;Gathering data&quot;).
            </p>
          </div>

          <div className="grid gap-3 mt-4">
            <div className="flex items-start gap-3 p-3 border border-[var(--border)] rounded-lg">
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-blue-900/30 text-blue-400">Emerging</span>
              <p className="text-sm text-[var(--text-secondary)]">
                New trend with low but growing signal count. First signs of community interest.
                Acceleration is positive but total volume is still small.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 border border-[var(--border)] rounded-lg">
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/30 text-emerald-400">Rising</span>
              <p className="text-sm text-[var(--text-secondary)]">
                Strong positive acceleration. Signal volume is increasing at a meaningful rate.
                This is typically the best window for early movers.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 border border-[var(--border)] rounded-lg">
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-amber-900/30 text-amber-400">Peaking</span>
              <p className="text-sm text-[var(--text-secondary)]">
                Momentum is high but acceleration is flattening or turning negative.
                The trend has reached or is near its maximum activity level.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 border border-[var(--border)] rounded-lg">
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-[var(--surface)] text-[var(--text-secondary)]">Stable</span>
              <p className="text-sm text-[var(--text-secondary)]">
                Consistent signal volume with low acceleration in either direction.
                The trend has settled into a steady state of community interest.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 border border-[var(--border)] rounded-lg">
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-red-900/30 text-red-400">Declining</span>
              <p className="text-sm text-[var(--text-secondary)]">
                Negative acceleration with falling signal volume. Community interest is waning.
                This does not mean the technology is bad — it may have matured past the hype cycle.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 border border-[var(--border)] rounded-lg">
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-[var(--bg-1)] text-[var(--text-tertiary)]">Fading</span>
              <p className="text-sm text-[var(--text-secondary)]">
                Very low momentum and declining signals. The trend is falling off community radar.
                May still be relevant for niche use cases.
              </p>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mt-4">
            <p className="text-xs text-[var(--text-tertiary)]">
              <strong>Stage confidence</strong> ranges from 0% to 100%. Stages below 50% confidence
              are suppressed and shown as &quot;Gathering data&quot; to avoid misleading classifications.
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Qualified Status</h2>
          <div className="text-sm text-[var(--text-secondary)] space-y-2 leading-relaxed">
            <p>
              A trend becomes a &quot;qualified opportunity&quot; when it passes all evidence gates.
              Not every trend qualifies — most do not. Qualification means there is enough evidence
              to suggest a real, actionable opportunity.
            </p>
            <p>The four evidence gates are:</p>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded bg-[var(--accent)] text-white flex items-center justify-center text-[11px] font-bold">1</span>
              <p><strong>Demand signals</strong> — People are actively asking &quot;how to&quot;, &quot;alternative to&quot;, or &quot;problem with&quot; in community discussions. At least 1 demand hit required.</p>
            </div>
            <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded bg-[var(--accent)] text-white flex items-center justify-center text-[11px] font-bold">2</span>
              <p><strong>Independent evidence</strong> — The trend has 2 or more independent source artifacts (e.g., a HN post and a GitHub repo, not just the same link reposted).</p>
            </div>
            <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded bg-[var(--accent)] text-white flex items-center justify-center text-[11px] font-bold">3</span>
              <p><strong>Actionability</strong> — The system can suggest a specific, buildable action (not just &quot;this is popular&quot;).</p>
            </div>
            <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded bg-[var(--accent)] text-white flex items-center justify-center text-[11px] font-bold">4</span>
              <p><strong>Lifecycle confidence</strong> — Stage classification confidence is above 60%, ensuring the trend&apos;s position in its lifecycle is reasonably understood.</p>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mt-4">
            <p className="text-xs text-[var(--text-tertiary)]">
              The <strong>opportunity score</strong> shown next to qualified trends is a composite of
              momentum, demand signal strength, evidence quality, and action specificity.
              Higher scores indicate stronger opportunities. Trends that fail any gate are not scored.
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Signals</h2>
          <div className="text-sm text-[var(--text-secondary)] space-y-2 leading-relaxed">
            <p>
              A signal is a single data point from one of our four sources: a Hacker News story,
              a GitHub Trending repository, a Dev.to article, or a Reddit post. The signal count
              shown on each trend is the number of distinct signals associated with that trend
              in the most recent daily snapshot.
            </p>
            <p>
              More signals generally mean broader community interest, but signal quality matters more
              than quantity. A trend with 3 high-quality signals from independent sources is stronger
              evidence than 10 signals from the same thread.
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">Timing & Competition</h2>
          <div className="text-sm text-[var(--text-secondary)] space-y-2 leading-relaxed">
            <p>
              Qualified opportunities get two additional intelligence layers, visible on the
              trend detail page:
            </p>
          </div>

          <div className="grid gap-4 mt-4 md:grid-cols-2">
            <div className="p-4 border border-[var(--border)] rounded-lg">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Timing Intelligence</h3>
              <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
                Classifies the opportunity window:
                <strong> Too Early</strong> (not enough data),
                <strong> Early Edge</strong> (good entry window),
                <strong> Crowded</strong> (many players),
                <strong> Late but Monetizable</strong> (saturating, revenue paths remain).
              </p>
            </div>
            <div className="p-4 border border-[var(--border)] rounded-lg">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Competition Analysis</h3>
              <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
                Estimates market saturation and competition level:
                <strong> Low</strong>,
                <strong> Moderate</strong>, or
                <strong> High</strong>.
                Identifies wedge opportunities where differentiation is possible.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">The Pipeline</h2>
          <div className="text-sm text-[var(--text-secondary)] space-y-2 leading-relaxed">
            <p>
              Every day, Rishi runs a 6-stage pipeline that transforms raw community data
              into qualified opportunities:
            </p>
          </div>

          <ol className="mt-4 space-y-3">
            {[
              { title: 'Signal Collection', desc: 'Scrapers pull from HN, GitHub Trending, Dev.to, and Reddit.' },
              { title: 'Deduplication', desc: 'URL canonicalization and fuzzy title matching remove duplicates while preserving the evidence chain.' },
              { title: 'Trend Detection', desc: 'Embedding-based clustering groups signals into coherent trends. Momentum scores are computed with p90 normalization.' },
              { title: 'Opportunity Qualification', desc: 'Each trend is tested against 4 evidence gates. Only those that pass all gates become qualified.' },
              { title: 'Intelligence Layers', desc: 'Timing classification and competition analysis are added to qualified opportunities.' },
              { title: 'Snapshot & Trajectory', desc: 'Results are stored as an immutable snapshot. Trajectory data is computed to track lifecycle and peak momentum over time.' },
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="shrink-0 w-6 h-6 rounded bg-[var(--accent)] text-white flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <div>
                  <span className="font-medium text-[var(--text-primary)]">{step.title}</span>
                  <span className="text-[var(--text-tertiary)]"> — {step.desc}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="border-t border-[var(--border)] pt-8 text-center">
          <Link
            href="/explore"
            className="rishi-btn-primary inline-flex px-5 py-2.5 text-sm font-semibold rounded-lg transition"
          >
            Explore trends
          </Link>
        </div>
      </div>
    </div>
  )
}
