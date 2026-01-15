CREATE TABLE IF NOT EXISTS signal_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL REFERENCES raw_signals(id) ON DELETE CASCADE,
    embedding_model TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    embedding VECTOR(384) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(signal_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_signal_embeddings_vector
ON signal_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_signal_embeddings_signal_id
ON signal_embeddings(signal_id);

CREATE TABLE IF NOT EXISTS trend_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    cluster_label INTEGER NOT NULL,
    cluster_name TEXT,
    centroid VECTOR(384),
    member_count INTEGER NOT NULL DEFAULT 0,
    high_confidence_count INTEGER DEFAULT 0,
    avg_similarity NUMERIC,
    min_cluster_size INTEGER NOT NULL DEFAULT 3,
    min_samples INTEGER DEFAULT 2,
    cluster_selection_epsilon NUMERIC DEFAULT 0.0,
    is_proto_cluster BOOLEAN DEFAULT FALSE,
    representative_signal_ids UUID[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(snapshot_id, cluster_label)
);

CREATE TABLE IF NOT EXISTS cluster_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    cluster_id UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
    signal_id UUID NOT NULL REFERENCES raw_signals(id) ON DELETE CASCADE,
    membership_probability NUMERIC,
    distance_to_centroid NUMERIC,
    is_strong_evidence BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(snapshot_id, signal_id)
);

CREATE INDEX IF NOT EXISTS idx_cluster_memberships_cluster
ON cluster_memberships(cluster_id);

CREATE INDEX IF NOT EXISTS idx_cluster_memberships_snapshot
ON cluster_memberships(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_cluster_memberships_strong_evidence
ON cluster_memberships(cluster_id) WHERE is_strong_evidence = TRUE;

CREATE TABLE IF NOT EXISTS cluster_trend_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    cluster_id UUID NOT NULL REFERENCES trend_clusters(id) ON DELETE CASCADE,
    trend_id UUID NOT NULL REFERENCES detected_trends(id) ON DELETE CASCADE,
    centroid_similarity NUMERIC,
    artifact_overlap_score NUMERIC,
    combined_match_score NUMERIC,
    match_method TEXT NOT NULL DEFAULT 'new_trend',
    is_new_trend BOOLEAN DEFAULT FALSE,
    prev_cluster_id UUID REFERENCES trend_clusters(id),
    prev_trend_id UUID REFERENCES detected_trends(id),
    lineage_event TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(snapshot_id, cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_cluster_trend_mapping_trend
ON cluster_trend_mapping(trend_id);

CREATE INDEX IF NOT EXISTS idx_cluster_trend_mapping_snapshot
ON cluster_trend_mapping(snapshot_id);

CREATE TABLE IF NOT EXISTS trend_lineage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES trend_snapshots(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    parent_trend_ids UUID[] NOT NULL,
    child_trend_ids UUID[] NOT NULL,
    confidence NUMERIC DEFAULT 1.0,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
