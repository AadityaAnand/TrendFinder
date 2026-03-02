-- Part 2: Creator qualification results and persona extraction storage
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS creator_qualification (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id               TEXT,
  trend_id                 UUID REFERENCES detected_trends(id) ON DELETE CASCADE,
  snapshot_id              UUID,
  engagement_velocity      FLOAT,
  format_replication_count INTEGER,
  audience_pain_signals    INTEGER,
  monetization_potential   FLOAT,
  qualified                BOOLEAN NOT NULL DEFAULT FALSE,
  gate_results             JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trend_id, snapshot_id)
);

CREATE INDEX IF NOT EXISTS creator_qualification_trend_idx    ON creator_qualification(trend_id);
CREATE INDEX IF NOT EXISTS creator_qualification_snapshot_idx ON creator_qualification(snapshot_id);
CREATE INDEX IF NOT EXISTS creator_qualification_qualified_idx ON creator_qualification(qualified);

CREATE TABLE IF NOT EXISTS creator_personas (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id             UUID REFERENCES detected_trends(id) ON DELETE CASCADE,
  snapshot_id          UUID,
  primary_platform     TEXT,
  niches               TEXT[],
  audience_size        TEXT,  -- nano | micro | mid | macro | mega
  content_styles       TEXT[],
  pain_points          JSONB, -- [{pain, evidence, count}]
  monetization_methods TEXT[],
  confidence           JSONB, -- {field: score} confidence per extracted field
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trend_id, snapshot_id)
);

CREATE INDEX IF NOT EXISTS creator_personas_trend_idx    ON creator_personas(trend_id);
CREATE INDEX IF NOT EXISTS creator_personas_snapshot_idx ON creator_personas(snapshot_id);
