-- Phase 2: Momentum & Qualification Upgrade
-- All schema changes for source diversity, stability, negative evidence, and competition entities

-- Task 1: Source diversity factor on snapshot items
ALTER TABLE trend_snapshot_items ADD COLUMN IF NOT EXISTS source_diversity_factor FLOAT;

-- Task 3: Stability/volatility modeling
ALTER TABLE trend_snapshot_items ADD COLUMN IF NOT EXISTS stability_score FLOAT;
ALTER TABLE trend_snapshot_items ADD COLUMN IF NOT EXISTS volatility_label TEXT;

-- Task 4: Negative evidence tracking
ALTER TABLE trend_snapshot_items ADD COLUMN IF NOT EXISTS negative_signal_ratio FLOAT;
ALTER TABLE trend_snapshot_items ADD COLUMN IF NOT EXISTS negative_signal_count INTEGER;

-- Task 5: Competition entity extraction
ALTER TABLE trend_competitive_intelligence
    ADD COLUMN IF NOT EXISTS existing_solutions_count INTEGER,
    ADD COLUMN IF NOT EXISTS open_source_repos JSONB,
    ADD COLUMN IF NOT EXISTS mentioned_tools JSONB,
    ADD COLUMN IF NOT EXISTS funding_mentions JSONB,
    ADD COLUMN IF NOT EXISTS entity_confidence TEXT;
