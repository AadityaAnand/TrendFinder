CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION get_signals_without_embeddings(
    cutoff_date TIMESTAMP WITH TIME ZONE,
    model_name TEXT,
    max_count INTEGER
)
RETURNS TABLE(id UUID, title TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT rs.id, rs.title
    FROM raw_signals rs
    LEFT JOIN signal_embeddings se
        ON rs.id = se.signal_id
        AND se.embedding_model = model_name
    WHERE rs.created_at >= cutoff_date
        AND se.id IS NULL
    ORDER BY rs.created_at DESC
    LIMIT max_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION find_similar_signals(
    query_embedding VECTOR(384),
    similarity_threshold NUMERIC DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
    signal_id UUID,
    title TEXT,
    similarity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        se.signal_id,
        rs.title,
        (1 - (se.embedding <=> query_embedding))::NUMERIC as similarity
    FROM signal_embeddings se
    JOIN raw_signals rs ON rs.id = se.signal_id
    WHERE (1 - (se.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY se.embedding <=> query_embedding
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_cluster_with_embeddings(
    p_cluster_id UUID
)
RETURNS TABLE(
    signal_id UUID,
    title TEXT,
    source TEXT,
    score INTEGER,
    embedding VECTOR(384),
    membership_probability NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cm.signal_id,
        rs.title,
        rs.source,
        rs.score,
        se.embedding,
        cm.membership_probability
    FROM cluster_memberships cm
    JOIN raw_signals rs ON rs.id = cm.signal_id
    JOIN signal_embeddings se ON se.signal_id = cm.signal_id
    WHERE cm.cluster_id = p_cluster_id
    ORDER BY cm.membership_probability DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_signals_without_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION get_signals_without_embeddings TO service_role;
GRANT EXECUTE ON FUNCTION find_similar_signals TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_signals TO service_role;
GRANT EXECUTE ON FUNCTION get_cluster_with_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION get_cluster_with_embeddings TO service_role;
