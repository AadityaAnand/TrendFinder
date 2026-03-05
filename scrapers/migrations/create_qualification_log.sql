-- Pipeline Qualification Log
-- Stores per-gate decisions for every trend evaluated in each pipeline run.
-- Used by /admin/pipeline to show which gates are blocking qualification.

CREATE TABLE IF NOT EXISTS pipeline_qualification_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  UUID        NOT NULL,
  trend_id     UUID        NOT NULL,
  trend_keyword TEXT,
  gate_name    TEXT        NOT NULL,
  -- 'persistence' | 'artifact' | 'hypothesis' | 'confidence' | 'demand' | 'actionability'
  -- 'creator_engagement_velocity' | 'creator_format_replication' | 'creator_audience_pain' | 'creator_monetization'
  passed       BOOLEAN     NOT NULL,
  calculated_value FLOAT,   -- e.g. days_seen=1, artifact_count=3, stage_confidence=0.42
  threshold    FLOAT,        -- the threshold compared against
  details      JSONB,        -- extra context: rejection_reason, matched patterns, etc.
  signal_type  TEXT    DEFAULT 'developer',  -- 'developer' | 'creator' | 'mixed'
  diagnostic_mode BOOLEAN DEFAULT FALSE,     -- TRUE when run with --diagnostic-mode
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qual_log_snapshot ON pipeline_qualification_log(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_qual_log_trend    ON pipeline_qualification_log(trend_id);
CREATE INDEX IF NOT EXISTS idx_qual_log_gate     ON pipeline_qualification_log(gate_name, passed);
CREATE INDEX IF NOT EXISTS idx_qual_log_created  ON pipeline_qualification_log(created_at DESC);
