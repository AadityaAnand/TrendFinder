import os
import logging
from datetime import datetime, timedelta, timezone
import numpy as np

from dotenv import load_dotenv
from supabase import create_client, Client

_model = None

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EMBEDDING_MODEL = 'all-MiniLM-L6-v2'
EMBEDDING_DIM = 384
BATCH_SIZE = 64


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
        _model = SentenceTransformer(EMBEDDING_MODEL)
        logger.info("Model loaded successfully")
    return _model


def generate_embedding(text: str) -> np.ndarray:
    model = get_model()
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding


def generate_embeddings_batch(texts: list[str]) -> np.ndarray:
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
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)

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

    logger.info("Using fallback method to find signals without embeddings")

    signals_resp = supabase.table('raw_signals') \
        .select('id, title') \
        .gte('created_at', cutoff.isoformat()) \
        .order('created_at', desc=True) \
        .limit(limit * 2) \
        .execute()

    if not signals_resp.data:
        return []

    signal_ids = [s['id'] for s in signals_resp.data]

    embeddings_resp = supabase.table('signal_embeddings') \
        .select('signal_id') \
        .eq('embedding_model', EMBEDDING_MODEL) \
        .in_('signal_id', signal_ids) \
        .execute()

    existing_ids = set(e['signal_id'] for e in (embeddings_resp.data or []))

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
    if len(signal_ids) != len(embeddings):
        raise ValueError("signal_ids and embeddings must have same length")

    records = []
    for signal_id, embedding in zip(signal_ids, embeddings):
        embedding_list = embedding.tolist()
        records.append({
            'signal_id': signal_id,
            'embedding_model': EMBEDDING_MODEL,
            'embedding': embedding_list
        })

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
    supabase = get_supabase()

    logger.info(f"Finding signals without embeddings (last {lookback_days} days)...")
    signals = get_signals_without_embeddings(supabase, lookback_days, limit)

    if not signals:
        logger.info("No signals need embeddings")
        return {'processed': 0, 'saved': 0}

    logger.info(f"Found {len(signals)} signals needing embeddings")

    signal_ids = [s['id'] for s in signals]
    titles = [s['title'] for s in signals]

    logger.info(f"Generating embeddings for {len(titles)} signals...")
    embeddings = generate_embeddings_batch(titles)

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
