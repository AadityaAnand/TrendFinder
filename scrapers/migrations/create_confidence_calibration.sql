-- Phase 7: Confidence-Calibrated Predictions
-- Goal: Every prediction comes with a calibrated confidence interval
-- "We're 70% confident this opportunity will succeed" should mean 70% actually do

-- 7.1: Store predictions with explicit confidence levels
CREATE TABLE IF NOT EXISTS confidence_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What we're predicting about
    entity_type TEXT NOT NULL CHECK (entity_type IN ('opportunity', 'trend')),
    entity_id UUID NOT NULL,
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,

    -- The prediction
    prediction_type TEXT NOT NULL CHECK (prediction_type IN (
        'will_qualify',           -- Will this trend produce qualified opportunities?
        'will_be_started',        -- Will users start working on this?
        'will_be_completed',      -- Will users complete this?
        'will_succeed',           -- Will completions be high quality?
        'momentum_direction',     -- Will momentum increase/decrease?
        'lifecycle_transition'    -- Will stage change?
    )),

    -- Confidence and prediction
    predicted_outcome BOOLEAN,           -- For binary predictions
    predicted_value NUMERIC,             -- For continuous predictions
    confidence_score NUMERIC NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    confidence_interval_low NUMERIC,     -- Lower bound of CI
    confidence_interval_high NUMERIC,    -- Upper bound of CI

    -- What factors drove this confidence?
    confidence_factors JSONB DEFAULT '{}',
    -- e.g., {"sample_size": 15, "historical_accuracy": 0.72, "signal_strength": 0.8}

    -- Resolution (filled in later when we know the outcome)
    actual_outcome BOOLEAN,
    actual_value NUMERIC,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_note TEXT,

    -- Tracking
    predicted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    model_version TEXT DEFAULT 'confidence-v1',

    UNIQUE(entity_type, entity_id, snapshot_id, prediction_type)
);

-- 7.2: Calibration buckets for tracking accuracy by confidence level
CREATE TABLE IF NOT EXISTS calibration_buckets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which prediction type and time window
    prediction_type TEXT NOT NULL,
    bucket_start NUMERIC NOT NULL,  -- e.g., 0.6 for 60-70% bucket
    bucket_end NUMERIC NOT NULL,    -- e.g., 0.7

    -- Counts
    total_predictions INTEGER DEFAULT 0,
    correct_predictions INTEGER DEFAULT 0,

    -- Derived accuracy (should match bucket midpoint if well-calibrated)
    observed_accuracy NUMERIC,

    -- Time window
    window_start TIMESTAMP WITH TIME ZONE,
    window_end TIMESTAMP WITH TIME ZONE,

    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(prediction_type, bucket_start, bucket_end, window_start)
);

-- 7.3: Overall calibration metrics over time
CREATE TABLE IF NOT EXISTS calibration_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    prediction_type TEXT NOT NULL,

    -- Brier score (lower is better, 0 = perfect)
    brier_score NUMERIC,

    -- Calibration error (how far off are our confidence levels?)
    expected_calibration_error NUMERIC,  -- ECE
    maximum_calibration_error NUMERIC,   -- MCE

    -- Sharpness (are we making confident predictions?)
    avg_confidence NUMERIC,
    confidence_std NUMERIC,

    -- Resolution (can we distinguish outcomes?)
    resolution_score NUMERIC,

    -- Sample info
    total_resolved INTEGER,
    window_start TIMESTAMP WITH TIME ZONE,
    window_end TIMESTAMP WITH TIME ZONE,

    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(prediction_type, window_start)
);

-- 7.4: Confidence adjustment factors (learned corrections)
CREATE TABLE IF NOT EXISTS confidence_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    prediction_type TEXT NOT NULL,

    -- What raw confidence range does this apply to?
    raw_confidence_min NUMERIC NOT NULL,
    raw_confidence_max NUMERIC NOT NULL,

    -- How should we adjust?
    adjustment_multiplier NUMERIC DEFAULT 1.0,  -- multiply raw confidence
    adjustment_offset NUMERIC DEFAULT 0.0,      -- then add offset

    -- Resulting calibrated range
    calibrated_confidence_min NUMERIC,
    calibrated_confidence_max NUMERIC,

    -- Evidence
    based_on_samples INTEGER,
    observed_accuracy NUMERIC,

    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,

    UNIQUE(prediction_type, raw_confidence_min, raw_confidence_max)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_confidence_predictions_entity
ON confidence_predictions(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_confidence_predictions_unresolved
ON confidence_predictions(prediction_type, predicted_at)
WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_confidence_predictions_resolved
ON confidence_predictions(prediction_type, resolved_at)
WHERE resolved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calibration_buckets_type
ON calibration_buckets(prediction_type);

CREATE INDEX IF NOT EXISTS idx_calibration_metrics_type
ON calibration_metrics(prediction_type, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_confidence_adjustments_active
ON confidence_adjustments(prediction_type)
WHERE active = TRUE;
