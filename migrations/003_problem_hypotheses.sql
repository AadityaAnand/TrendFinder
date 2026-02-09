CREATE TABLE IF NOT EXISTS problem_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id),
  trend_id UUID NOT NULL REFERENCES detected_trends(id),
  detector_version TEXT NOT NULL DEFAULT 'hypothesis-v1',
  evidence_hash TEXT NOT NULL,
  hypothesis_title TEXT NOT NULL,
  hypothesis_summary TEXT,
  who_it_affects JSONB DEFAULT '[]'::jsonb,
  pain_signals JSONB DEFAULT '[]'::jsonb,
  demand_evidence JSONB DEFAULT '[]'::jsonb,
  confidence REAL NOT NULL DEFAULT 0,
  confidence_reasons JSONB DEFAULT '[]'::jsonb,
  hypothesis_status TEXT NOT NULL DEFAULT 'uncertain'
    CHECK (hypothesis_status IN ('valid', 'topic_only', 'uncertain', 'rejected')),
  model_used TEXT,
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snapshot_id, trend_id)
);

CREATE INDEX IF NOT EXISTS idx_hypotheses_snapshot ON problem_hypotheses(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_trend ON problem_hypotheses(trend_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON problem_hypotheses(hypothesis_status);
