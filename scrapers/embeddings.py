"""
Day 6: Signal Embedding Generation
Generates semantic embeddings for raw signals using sentence-transformers.
"""

import os
import logging
from typing import Optional
from datetime import datetime, timedelta, timezone
import numpy as np

from dotenv import load_dotenv
from supabase import create_client, Client

# Lazy load sentence-transformers (heavy import)
_model = None

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
EMBEDDING_MODEL = 'all-MiniLM-L6-v2'
EMBEDDING_DIM = 384
BATCH_SIZE = 64  # Process signals in batches


def get_supabase() -> Client:
    """Get Supabase client."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def get_model():
    """Lazy load the embedding model."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
        _model = SentenceTransformer(EMBEDDING_MODEL)
        logger.info("Model loaded successfully")
    return _model


def generate_embedding(text: str) -> np.ndarray:
    """Generate embedding for a single text."""
    model = get_model()
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding


def generate_embeddings_batch(texts: list[str]) -> np.ndarray:
    """Generate embeddings for a batch of texts."""
    model = get_model()
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        batch_size=BATCH_SIZE,
        show_progress_bar=len(texts) > 100
    )
    return embeddings


def get_signals_without_embeddings(
    supabase: Client,
    lookback_days: int = 14,
    limit: int = 1000
) -> list[dict]:
    """
    Get signals that don't have embeddings yet.

    Args:
        supabase: Supabase client
        lookback_days: Only consider signals from the last N days
        limit: Maximum number of signals to return

    Returns:
        List of signals needing embeddings
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    # Get signals without embeddings using a left join pattern
    # Supabase doesn't support LEFT JOIN directly, so we'll do it differently
    response = supabase.rpc(
        'get_signals_without_embeddings',
        {
            'cutoff_date': cutoff.isoformat(),
            'model_name': EMBEDDING_MODEL,
            'max_count': limit
        }
    ).execute()

    if response.data:
        return response.data

    # Fallback: Get all recent signals and filter in Python
    logger.info("Using fallback method to find signals without embeddings")

    # Get recent signals
    signals_resp = supabase.table('raw_signals') \
        .select('id, title') \
        .gte('created_at', cutoff.isoformat()) \
        .order('created_at', desc=True) \
        .limit(limit * 2) \
        .execute()

    if not signals_resp.data:
        return []

    signal_ids = [s['id'] for s in signals_resp.data]

    # Get existing embeddings
    embeddings_resp = supabase.table('signal_embeddings') \
        .select('signal_id') \
        .eq('embedding_model', EMBEDDING_MODEL) \
        .in_('signal_id', signal_ids) \
        .execute()

    existing_ids = set(e['signal_id'] for e in (embeddings_resp.data or []))

    # Filter to signals without embeddings
    signals_needing_embeddings = [
        s for s in signals_resp.data
        if s['id'] not in existing_ids
    ]

    return signals_needing_embeddings[:limit]


def save_embeddings(
    supabase: Client,
    signal_ids: list[str],
    embeddings: np.ndarray
) -> int:
    """
    Save embeddings to the database.

    Args:
        supabase: Supabase client
        signal_ids: List of signal IDs
        embeddings: Numpy array of embeddings (N x EMBEDDING_DIM)

    Returns:
        Number of embeddings saved
    """
    if len(signal_ids) != len(embeddings):
        raise ValueError("signal_ids and embeddings must have same length")

    records = []
    for signal_id, embedding in zip(signal_ids, embeddings):
        # Convert numpy array to list for JSON serialization
        embedding_list = embedding.tolist()
        records.append({
            'signal_id': signal_id,
            'embedding_model': EMBEDDING_MODEL,
            'embedding': embedding_list
        })

    # Insert in batches
    saved = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            supabase.table('signal_embeddings') \
                .upsert(batch, on_conflict='signal_id,embedding_model') \
                .execute()
            saved += len(batch)
        except Exception as e:
            logger.error(f"Error saving batch {i//BATCH_SIZE}: {e}")

    return saved


def generate_and_save_embeddings(
    lookback_days: int = 14,
    limit: int = 1000
) -> dict:
    """
    Main function: Find signals without embeddings and generate them.

    Args:
        lookback_days: Only process signals from the last N days
        limit: Maximum number of signals to process

    Returns:
        Stats dict with counts
    """
    supabase = get_supabase()

    # Find signals needing embeddings
    logger.info(f"Finding signals without embeddings (last {lookback_days} days)...")
    signals = get_signals_without_embeddings(supabase, lookback_days, limit)

    if not signals:
        logger.info("No signals need embeddings")
        return {'processed': 0, 'saved': 0}

    logger.info(f"Found {len(signals)} signals needing embeddings")

    # Extract titles for embedding
    signal_ids = [s['id'] for s in signals]
    titles = [s['title'] for s in signals]

    # Generate embeddings
    logger.info(f"Generating embeddings for {len(titles)} signals...")
    embeddings = generate_embeddings_batch(titles)

    # Save to database
    logger.info("Saving embeddings to database...")
    saved = save_embeddings(supabase, signal_ids, embeddings)

    logger.info(f"Saved {saved} embeddings")

    return {
        'processed': len(signals),
        'saved': saved
    }


def get_signal_embeddings(
    supabase: Client,
    signal_ids: list[str]
) -> dict[str, np.ndarray]:
    """
    Retrieve embeddings for a list of signal IDs.

    Args:
        supabase: Supabase client
        signal_ids: List of signal IDs to fetch

    Returns:
        Dict mapping signal_id -> embedding numpy array
    """
    if not signal_ids:
        return {}

    response = supabase.table('signal_embeddings') \
        .select('signal_id, embedding') \
        .eq('embedding_model', EMBEDDING_MODEL) \
        .in_('signal_id', signal_ids) \
        .execute()

    result = {}
    for row in (response.data or []):
        embedding = np.array(row['embedding'])
        result[row['signal_id']] = embedding

    return result


# SQL function to get signals without embeddings (create this in Supabase)
CREATE_RPC_SQL = """
-- Create RPC function for efficient embedding lookup
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
"""


if __name__ == '__main__':
    print("=== Signal Embedding Generator ===")
    print(f"Model: {EMBEDDING_MODEL}")
    print(f"Dimensions: {EMBEDDING_DIM}")
    print()

    stats = generate_and_save_embeddings(lookback_days=14, limit=500)

    print()
    print("=== Results ===")
    print(f"Signals processed: {stats['processed']}")
    print(f"Embeddings saved: {stats['saved']}")
