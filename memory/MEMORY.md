# TrendGenerator Project Memory

## Stack
- Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS, hosted on Vercel
- Backend: Python scrapers, GitHub Actions for scheduling
- DB: Supabase (Postgres + Realtime), `@supabase/supabase-js` only (no `@supabase/ssr`)
- Auth: custom `useAuth()` hook in `frontend/lib/auth.ts`

## Key Patterns
- Server Supabase client: `getServerSupabase()` from `@/lib/supabase-server`
- Browser Supabase client: `import { supabase } from '@/lib/supabase'`
- API routes use `getServerSupabase()`, not `createBrowserClient`
- Feedback API (`/api/feedback`) requires snapshot_id; opportunities API returns `snapshot_id` at response level, not per-item

## Phases Completed
- **Phase 5**: 4 new scrapers (Reddit/PH/IH/Substack), source diversity formula (MAX_SOURCES=7), BOOTSTRAP_P90 extended, SCORING_VERSION=norm-p90-decay7d-div-demand-v3
- **Phase 6**: Independent per-scraper GitHub Actions workflows, Supabase Realtime LiveSignalCounter on /explore, `migrations/enable_raw_signals_realtime.sql`
- **Phase 7**: Save/dismiss buttons on /for-you (snapshotId from API response, feedbackMap/dismissedIds state), confidence_calibration.py adds source_diversity_factor + stability_score factors, learning_engine.py adds exponential decay (half-life 30 days), admin dashboard at /admin, A/B testing (user_experiments + experiment_metrics tables, /api/experiments/assign + /api/experiments/metric routes)

## Important Files
- `scrapers/confidence_calibration.py` — `_confidence_will_qualify()` now reads source_diversity_factor + stability_score from trend_snapshot_items
- `scrapers/learning_engine.py` — feedback items have `weight` field (0.5^(days_old/30)), `compute_dimension_correlation()` uses weighted averages
- `frontend/app/for-you/page.tsx` — `snapshotId` state from API response, `handleFeedback(oppId, type)` POSTs to /api/feedback
- `frontend/app/admin/page.tsx` — server component, reads calibration_metrics + confidence_adjustments + confidence_predictions
- `migrations/add_ab_testing.sql` — must be run in Supabase SQL editor

## DB Tables (key ones)
- `raw_signals` — all scraped signals; has Realtime enabled via migration
- `trend_snapshot_items` — has source_diversity_factor, stability_score, momentum_score, signal_count
- `user_opportunity_feedback` — unique on (user_id, opportunity_id); types: saved/dismissed/acted/not_relevant
- `user_weight_adjustments` — per-user learning engine output
- `confidence_predictions` / `calibration_metrics` / `confidence_adjustments` — calibration system
- `user_experiments` / `experiment_metrics` — A/B testing (Phase 7, needs migration)
