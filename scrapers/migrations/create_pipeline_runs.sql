CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    snapshot_id UUID REFERENCES trend_snapshots(id),

    pipeline_version TEXT NOT NULL,
    stages_completed TEXT[] DEFAULT '{}',

    health_check JSONB,
    drift_metrics JSONB,
    alerts JSONB DEFAULT '[]',

    success BOOLEAN NOT NULL DEFAULT FALSE,
    error TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_run_at
ON pipeline_runs(run_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_success
ON pipeline_runs(success);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_snapshot
ON pipeline_runs(snapshot_id);
