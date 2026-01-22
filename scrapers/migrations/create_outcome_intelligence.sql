-- Phase 6: Outcome-Verified Intelligence
-- Tracks real-world outcomes to calibrate system trust

-- 6.1: Enhanced outcome tracking with quality metrics
ALTER TABLE opportunity_outcomes
ADD COLUMN IF NOT EXISTS quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
ADD COLUMN IF NOT EXISTS time_to_first_action INTEGER,  -- days from seeing to starting
ADD COLUMN IF NOT EXISTS time_to_completion INTEGER,    -- days from starting to completing
ADD COLUMN IF NOT EXISTS drop_off_stage TEXT CHECK (drop_off_stage IN ('explored', 'started', 'midway', 'near_complete')),
ADD COLUMN IF NOT EXISTS success_factors TEXT[],        -- what helped
ADD COLUMN IF NOT EXISTS failure_factors TEXT[];        -- what blocked

-- 6.2: Opportunity predictions ledger (what we predicted vs what happened)
CREATE TABLE IF NOT EXISTS opportunity_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES trend_opportunities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,

    -- What we predicted
    predicted_score NUMERIC NOT NULL,
    predicted_stage TEXT,
    predicted_confidence NUMERIC,
    qualification_reasons TEXT[],

    -- Snapshot of key metrics at prediction time
    momentum_at_prediction NUMERIC,
    signal_count_at_prediction INTEGER,
    demand_hits_at_prediction INTEGER,

    predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(opportunity_id, snapshot_id)
);

-- 6.3: Outcome aggregates per opportunity (for fast lookup)
CREATE TABLE IF NOT EXISTS opportunity_outcome_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES trend_opportunities(id) ON DELETE CASCADE,

    -- Aggregate stats across all users
    total_views INTEGER DEFAULT 0,
    total_starts INTEGER DEFAULT 0,
    total_completions INTEGER DEFAULT 0,
    total_abandonments INTEGER DEFAULT 0,

    -- Quality metrics
    avg_quality_score NUMERIC,
    avg_time_to_start NUMERIC,
    avg_time_to_complete NUMERIC,

    -- Derived trust indicators
    start_rate NUMERIC,           -- starts / views
    completion_rate NUMERIC,      -- completions / starts
    success_rate NUMERIC,         -- (completions with quality >= 3) / completions

    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(opportunity_id)
);

-- 6.4: Trend outcome aggregates (roll up from opportunities)
CREATE TABLE IF NOT EXISTS trend_outcome_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,

    -- Aggregate across all opportunities for this trend
    total_opportunities INTEGER DEFAULT 0,
    total_qualified INTEGER DEFAULT 0,
    total_user_starts INTEGER DEFAULT 0,
    total_user_completions INTEGER DEFAULT 0,

    -- Trust calibration
    avg_completion_rate NUMERIC,
    avg_quality_score NUMERIC,
    execution_difficulty_score NUMERIC,  -- higher = harder to execute

    -- Classification
    trend_archetype TEXT,  -- 'fast_mvp', 'infra_bet', 'content_wedge', etc.

    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(trend_id)
);

-- 6.5: Misclassification registry (false positives / negatives)
CREATE TABLE IF NOT EXISTS trend_misclassifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    -- What we predicted
    predicted_qualified BOOLEAN NOT NULL,
    predicted_score NUMERIC,
    predicted_stage TEXT,

    -- What actually happened
    actual_outcome TEXT NOT NULL CHECK (actual_outcome IN (
        'successful',           -- users completed and rated highly
        'moderate_success',     -- some completions, mixed ratings
        'execution_trap',       -- many starts, few completions
        'low_interest',         -- qualified but few views/starts
        'missed_opportunity',   -- rejected but users found it anyway
        'correct_rejection'     -- rejected and stayed quiet
    )),

    -- Classification
    misclassification_type TEXT CHECK (misclassification_type IN (
        'false_positive',       -- qualified but failed
        'false_negative',       -- rejected but succeeded
        'calibration_error',    -- score was off
        'timing_error',         -- right trend, wrong timing
        'none'                  -- correctly classified
    )),

    -- Evidence
    evidence_summary JSONB,
    user_count INTEGER,
    completion_count INTEGER,
    avg_quality NUMERIC,

    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(trend_id, snapshot_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opportunity_predictions_opp
ON opportunity_predictions(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_predictions_trend
ON opportunity_predictions(trend_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_outcome_stats_opp
ON opportunity_outcome_stats(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_trend_outcome_stats_trend
ON trend_outcome_stats(trend_id);

CREATE INDEX IF NOT EXISTS idx_misclassifications_trend
ON trend_misclassifications(trend_id);

CREATE INDEX IF NOT EXISTS idx_misclassifications_type
ON trend_misclassifications(misclassification_type)
WHERE misclassification_type != 'none';
