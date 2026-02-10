# TrendSignal

TrendSignal is an evidence-gated trend intelligence tool for developers and founders that scrapes developer communities daily, groups signals into trends, qualifies them through deterministic gates, and surfaces actionable build opportunities — with every score auditable and every uncertainty visible.

---

## Table of Contents

- [Core Promise](#core-promise)
- [What You Get](#what-you-get)
- [Architecture](#architecture)
- [Pipeline Stages](#pipeline-stages)
- [How Scoring Works](#how-scoring-works)
- [Getting Started](#getting-started)
- [Database & Migrations](#database--migrations)
- [Operational Workflow](#operational-workflow)
- [Trust & Safety](#trust--safety)
- [Roadmap](#roadmap)
- [Project Structure](#project-structure)

---

## Core Promise

- **Evidence-gated.** Every opportunity requires 2+ independent artifacts and real demand signals. Trends without sufficient evidence stay in "watching" — they never get promoted.
- **Deterministic scoring.** Scores come from weighted formulas with named components (`norm-p90-decay7d-v1`), not black-box neural nets. Every number traces back to raw signals.
- **Visible uncertainty.** Low-confidence data is flagged, not hidden. Lifecycle stages show confidence scores. Acceleration arrows only appear when `acceleration_comparable` is true.
- **Auditable.** Every snapshot stores its scoring version, normalization parameters, and pipeline metadata. You can reconstruct any score from its inputs.

---

## What You Get

| Page | What it does |
|------|-------------|
| **For You** | Personalized opportunity feed ranked by your role, domains, tech stack, and risk tolerance. Falls back to near-miss trends when nothing qualifies. |
| **Explore** | Full ecosystem radar — all tracked trends with search, domain category filters, and lifecycle stage filters. |
| **Trend Detail** | Per-trend deep dive: narrative summary, qualification status with suggested build action, evidence grouped by source, and collapsible analytics (momentum chart, stage timeline, snapshot history). |
| **Settings** | Onboarding wizard (3-step) and preference editor. Selections persist across sessions and drive For You personalization. Shows save confirmation and last-updated timestamp. |
| **Alerts** | Rules-based alerts for timing events: `became_eligible`, `entered_early_edge`, `momentum_breakout`, `stage_transition`, `expiry_risk_high`, and more. |
| **API** | 18 API routes covering opportunities, trends, timing, competition, feasibility, confidence, outcomes, and user profiles. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Data Sources                        │
│  Hacker News (Firebase API)                             │
│  GitHub Trending (REST API)                             │
│  Dev.to (Forem API)                                     │
└────────────────────┬────────────────────────────────────┘
                     │ daily cron (6 AM UTC)
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Python Pipeline  (scrapers/)                │
│                                                         │
│  scrape → dedup → detect → lifecycle → qualify →        │
│  explain → trajectory → timing → competition →          │
│  execution → confidence → alerts                        │
└────────────────────┬────────────────────────────────────┘
                     │ writes to
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Supabase  (PostgreSQL + pgvector)              │
│                                                         │
│  raw_signals, detected_trends, trend_snapshots,         │
│  trend_opportunities, trend_lifecycle_history,           │
│  trend_timing_signals, trend_competitive_intelligence,   │
│  execution_verdicts, confidence_predictions,             │
│  user_profiles, user_preferences, signal_embeddings     │
└────────────────────┬────────────────────────────────────┘
                     │ reads from
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Next.js Frontend  (frontend/)                  │
│                                                         │
│  App Router pages + 18 API routes                       │
│  Server components query Supabase directly              │
│  Client components use API routes                       │
│  Supabase Auth for user sessions                        │
└─────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Python 3.11, Supabase Python SDK |
| Database | Supabase (PostgreSQL + pgvector for embeddings) |
| Auth | Supabase Auth |
| AI APIs | Gemini (opportunity explanations), Groq (fast inference) |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` (384-dim) |
| Deployment | Vercel (frontend, root dir = `frontend`), GitHub Actions (pipeline cron) |

---

## Pipeline Stages

The daily pipeline (`scrapers/daily_pipeline.py`) runs these stages in order:

| # | Stage | Script | What it does |
|---|-------|--------|-------------|
| 1 | **Scrape** | `hackernews_scraper.py`, `github_scraper.py`, `devto_scraper.py` | Pull top items from 3 sources (~30 items each, 7-day lookback) |
| 2 | **Deduplicate** | `deduplication.py` | URL canonicalization + fuzzy title matching via RapidFuzz |
| 3 | **Detect trends** | `trend_detector.py` | Phrase-based topic extraction, group signals into trends, compute momentum |
| 4 | **Lifecycle** | (inside `trend_detector.py`) | Classify stage (emerging → rising → peaking → stable → declining → fading) with confidence and guards |
| 5 | **Qualify** | `opportunity_detector.py` | Check evidence gates: 2+ artifacts, demand signals, buildable action, lifecycle confidence >= 0.6 |
| 6 | **Explain** | `opportunity_explainer.py` | Generate human-readable explanations for qualified opportunities via Gemini/Groq |
| 7 | **Trajectory** | `trajectory_updater.py` | Append snapshot to each trend's trajectory history |

After the core pipeline, intelligence modules run independently (failures are non-blocking):

| Module | Script | Output |
|--------|--------|--------|
| **Timing** | `timing_intelligence.py` | Labels: `too_early`, `early_edge`, `crowded`, `late_but_monetizable`, `timing_uncertain` |
| **Competition** | `competitive_intelligence.py` | Saturation score (0-1) from 5 weighted signals, plus wedge analysis |
| **Execution** | `execution_feasibility.py` | Execution type, sales motion, moat analysis, risk flags |
| **Confidence** | `confidence_calibration.py` | Calibrated prediction intervals with Brier score tracking |
| **Alerts** | `alerts_engine.py` | Rules-based alerts for timing transitions, breakouts, expiry risks |

---

## How Scoring Works

### Normalization

Each raw signal gets an engagement score from its source:

| Source | Engagement metric |
|--------|------------------|
| Hacker News | `score + comments_count` |
| Dev.to | `score + comments_count` |
| GitHub | `stargazers_count` |

Scores are normalized against the **p90 percentile per source** (rolling 14-day window or bootstrap baseline):

```
normalized = min(engagement / p90_for_source, 1.0)
```

A score of 1.0 means "top 10% engagement for this source." Normalization params are saved per snapshot for reproducibility.

### Decay

Signals lose weight over time with a **7-day exponential half-life**:

```
decay = 0.5 ^ (age_days / 7.0)
```

A 7-day-old signal contributes half as much as a fresh one. A 14-day-old signal contributes 25%.

### Momentum

Per-trend momentum is the mean of weighted scores across all signals in that trend:

```
momentum = sum(normalized_score * decay) / signal_count
```

Also tracked: `top3_mean` (mean of top 3 weighted scores per trend) for quality-over-volume comparison.

### Lifecycle

Trends are classified into stages based on momentum change and signal growth between snapshots:

| Stage | Typical signal |
|-------|---------------|
| `emerging` | Low momentum, positive acceleration, few signals |
| `rising` | Medium momentum, strong positive acceleration |
| `peaking` | High momentum, flattening acceleration |
| `stable` | Moderate momentum, near-zero acceleration |
| `declining` | Falling momentum, negative acceleration |
| `fading` | Very low momentum, sustained decline |

**Acceleration** is a normalized [-1, 1] composite:
- 70% weight: momentum change (percent change vs previous snapshot, capped at +/-100%)
- 30% weight: signal count change (absolute delta / 10, capped at +/-1)

### Guards

Acceleration is marked **not comparable** (and the UI hides direction indicators) when:

- Scoring version changed between snapshots
- Previous momentum was near-zero (< 0.01), making percent-change unstable
- Time gap between snapshots was < 12 hours

Stage confidence is capped at 0.7 with fewer than 3 snapshots and 0.6 with only a single day of data.

### Versioning

All scores carry a version string so the system can detect methodology changes:

| Component | Version string |
|-----------|---------------|
| Scoring | `norm-p90-decay7d-v1` |
| Pipeline | `pipeline-v1` |
| Lifecycle | `lifecycle-v1` |
| Detector | `phrase-topic-v1` |

---

## Getting Started

### Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.11+
- A **Supabase** project (free tier works) with the pgvector extension enabled
- API keys: **Gemini**, **Groq**, **GitHub** personal access token

### Environment Variables

Create `scrapers/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key
GITHUB_TOKEN=your-github-pat
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> The scrapers need the **service role key** (not the anon key) for server-side database writes. The frontend uses the **anon key** for client-side reads via RLS. Find both in Supabase Dashboard -> Project Settings -> API.

### Install & Run

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Pipeline (manual run):**

```bash
cd scrapers
pip install -r requirements.txt
python daily_pipeline.py
```

This runs all scrapers, deduplication, trend detection, opportunity qualification, and trajectory updates. Intelligence modules can be run separately:

```bash
python timing_intelligence.py
python competitive_intelligence.py
python execution_feasibility.py
python confidence_calibration.py
python alerts_engine.py
```

### GitHub Actions (automated daily)

The pipeline runs daily at 6 AM UTC via `.github/workflows/daily-pipeline.yml`. Set these as repository secrets in GitHub:

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Service role key (not anon) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key |
| `GH_PAT` | GitHub personal access token |

---

## Database & Migrations

Migrations live in `scrapers/migrations/` (25 SQL files). They are applied against Supabase PostgreSQL.

### Applying Migrations

**Option A — Supabase SQL Editor:**

1. Go to [app.supabase.com](https://app.supabase.com) -> your project -> SQL Editor
2. Paste and run each migration file in order

**Option B — apply_migration.py:**

```bash
cd scrapers
python apply_migration.py migrations/create_opportunities_table.sql
```

### pgvector Requirement

The embeddings system requires the `pgvector` extension. Enable it in Supabase SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Used by `signal_embeddings` (384-dimensional vectors from `all-MiniLM-L6-v2`) with an IVFFlat index for similarity search.

### Key Tables

| Table | Purpose |
|-------|---------|
| `raw_signals` | Scraped items from all sources |
| `detected_trends` | Grouped trends with themes and descriptions |
| `trend_snapshots` | Daily pipeline snapshots with scoring version metadata |
| `trend_snapshot_items` | Per-trend per-snapshot metrics (momentum, signal count) |
| `trend_lifecycle_history` | Stage, confidence, acceleration per snapshot with guards |
| `trend_opportunities` | Qualified and unqualified opportunity records |
| `trend_trajectories` | Full trajectory history per trend (JSON array of points) |
| `trend_timing_signals` | Timing intelligence results |
| `trend_competitive_intelligence` | Saturation and competition analysis |
| `execution_verdicts` | Feasibility assessments per user per opportunity |
| `confidence_predictions` | Calibrated confidence intervals |
| `user_profiles` / `user_preferences` | User accounts and preference storage |
| `signal_embeddings` | Vector embeddings for clustering |
| `pipeline_runs` | Pipeline execution logs with health checks and drift data |

---

## Operational Workflow

### Running the Daily Pipeline

The pipeline is idempotent per day — it checks `pipeline_runs` for existing successful runs and skips if one already exists for today. To re-run, delete the existing record for today from `pipeline_runs`.

**Expected data flow:**

1. Scrapers collect ~30 signals per source (~90 total)
2. Deduplication merges duplicates across sources via URL and fuzzy title matching
3. Trend detector groups signals into up to 30 trends via phrase extraction
4. Opportunity detector qualifies trends that pass all evidence gates
5. Intelligence modules annotate qualified trends with timing, competition, execution data

### Troubleshooting "No Data Yet"

If the frontend shows empty states:

| Check | How |
|-------|-----|
| Pipeline ran? | Query `pipeline_runs` for today's date |
| Snapshot exists? | Query `trend_snapshots` — frontend requires `scoring_version = 'norm-p90-decay7d-v1'` |
| Raw signals populated? | If `raw_signals` is empty, scrapers aren't working (check API keys) |
| Trends detected? | If `detected_trends` has rows but `trend_snapshot_items` is empty for the latest snapshot, the detector didn't find enough signal overlap |
| Opportunities qualified? | For You requires `trend_opportunities` with `qualified = true`. If none qualify, it falls back to showing unqualified trends with amber "Collecting evidence" badges |

### Health Checks

The pipeline runs automatic health checks after each execution and stores results in `pipeline_runs.health_check`:

- `has_trends` — at least 1 trend detected
- `has_signals` — at least 1 signal collected
- `momentum_valid` — all momentum values are within 0-1
- `scoring_version` — matches expected version string
- `evidence_canonical_coverage` — percentage of signals linked to trends
- `opportunity_stats` — counts of qualified vs total opportunities

### Drift Detection

The pipeline compares metrics between consecutive snapshots and fires alerts when absolute percent change exceeds thresholds:

| Metric | Alert threshold |
|--------|----------------|
| `momentum_mean_change` | > 30% |
| `momentum_std_change` | > 50% |
| `signal_count_change` | > 40% |
| `trend_count_change` | > 50% |

---

## Trust & Safety

### What the System Refuses to Claim

- No "this will succeed" predictions — only evidence-backed qualification
- No certainty when confidence is low — uncertainty badges are always visible
- No acceleration arrows when data is insufficient (`acceleration_comparable = false`)
- No lifecycle stage badges when confidence is below 0.5
- No timing labels with fewer than 2 days of data (`MIN_DAYS_FOR_TIMING = 2`)

### How Uncertainty is Displayed

- **Confidence scores** (0-1) appear on every prediction
- **Stage confidence** is shown and capped (0.7 for < 3 snapshots, 0.6 for 1 day)
- **"Collecting data"** replaces stage badges when conditions aren't met
- **"New — 1 snapshot"** badge appears on newly detected trends
- **Missing-day gaps** are flagged in momentum charts with a count
- **"Not qualified yet"** cards explain what's missing, not just that it failed

### Why It Avoids Hype

The pipeline is entirely deterministic and rule-based. Intelligence modules use keyword matching and threshold logic — not LLM-generated confidence claims. When Gemini/Groq are used (for opportunity explanations), they annotate in plain language rather than produce scores. Every score can be recomputed from the raw signals and the versioned formula.

---

## Roadmap

> These are reasonable next steps. None are currently implemented.

- **Reddit scraper** — a fourth data source for broader developer community coverage
- **Email digests** — daily or weekly summary of alerts and new opportunities sent to users
- **Feedback loop** — user actions (saved, dismissed, started) feeding back into scoring weights via `learning_engine.py` (infrastructure exists, not yet active)
- **Trend lineage UI** — visualizing merges and splits as trends evolve (tables exist in DB, no frontend)
- **Embedding-based clustering** — using pgvector embeddings as an alternative to phrase-based grouping (infrastructure exists, not yet the primary method)
- **Confidence calibration dashboard** — visualizing Brier scores and ECE over time (API route exists at `/api/analytics/confidence`, no dedicated UI)
- **Outcome tracking UI** — allowing users to log what they built and how it went (API exists at `/api/outcomes`)

---

## Project Structure

```
TrendGenerator/
├── frontend/                     # Next.js 16 application
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── for-you/page.tsx      # Personalized feed
│   │   ├── explore/page.tsx      # Trend discovery
│   │   ├── trends/[id]/page.tsx  # Trend detail
│   │   ├── settings/page.tsx     # Preferences
│   │   ├── sign-in/page.tsx      # Auth
│   │   ├── sign-up/page.tsx      # Auth
│   │   ├── learn/page.tsx        # Educational content
│   │   ├── components/           # Nav, Badge, SourceBadge, ConfidenceBadge
│   │   └── api/                  # 18 API routes
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client
│   │   └── auth.ts               # useAuth() hook
│   └── package.json
├── scrapers/                     # Python pipeline
│   ├── daily_pipeline.py         # Orchestrator (idempotent, with health checks)
│   ├── hackernews_scraper.py     # HN scraper
│   ├── github_scraper.py         # GitHub trending scraper
│   ├── devto_scraper.py          # Dev.to scraper
│   ├── deduplication.py          # Fuzzy matching (RapidFuzz)
│   ├── trend_detector.py         # Detection + scoring + lifecycle (~900 lines)
│   ├── opportunity_detector.py   # Evidence gate qualification
│   ├── opportunity_explainer.py  # Gemini/Groq explanation generation
│   ├── trajectory_updater.py     # Trend history tracking
│   ├── timing_intelligence.py    # Timing window classification
│   ├── competitive_intelligence.py # Saturation analysis (5 components)
│   ├── execution_feasibility.py  # Execution type + moat + risk
│   ├── confidence_calibration.py # Brier score calibration
│   ├── alerts_engine.py          # Rules-based alert firing
│   ├── embeddings.py             # sentence-transformers + pgvector
│   ├── relevance_scorer.py       # User preference matching
│   ├── apply_migration.py        # Migration runner
│   ├── migrations/               # 25 SQL migration files
│   └── requirements.txt
└── .github/workflows/
    └── daily-pipeline.yml        # Cron: daily at 6 AM UTC
```
