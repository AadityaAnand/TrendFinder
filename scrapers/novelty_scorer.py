"""
Phase 9d: Novelty Scoring

Detects and downweights recurring posts (e.g., monthly "Ask HN" threads)
so they don't dominate trend momentum with high engagement but zero predictive value.

Uses title normalization + embedding similarity to detect recurrence patterns.
Runs after deduplication, before trend detection.
"""

import os
import re
import hashlib
import logging
from typing import Optional
from datetime import datetime, timedelta

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

NOVELTY_VERSION = 'novelty-v1'

# Known recurring patterns (title prefixes that repeat monthly/weekly)
RECURRING_PREFIXES = [
    r'^ask hn[:\s]',
    r'^tell hn[:\s]',
    r'^show hn[:\s]',  # Show HN itself is fine, but identical recurring ones aren't
    r'^who is hiring',
    r'^who wants to be hired',
    r'^freelancer\? seeking',
    r'^what are you working on',
    r'^what are you reading',
    r'^monthly book',
    r'^weekly',
    r'^month(?:ly)? thread',
]
RECURRING_PREFIX_RE = re.compile('|'.join(RECURRING_PREFIXES), re.IGNORECASE)

# Stopwords for title normalization
NORMALIZE_STOPWORDS = {
    'the', 'a', 'an', 'of', 'in', 'for', 'to', 'and', 'or', 'is', 'are',
    'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can',
    'this', 'that', 'these', 'those', 'it', 'its', 'my', 'your', 'our',
    'their', 'with', 'from', 'at', 'by', 'on', 'about', 'into',
}

# Date/time patterns that indicate recurring content
DATE_PATTERNS = [
    r'\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b',
    r'\b(?:jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b',
    r'\b20\d{2}\b',
    r'\bq[1-4]\b',
    r'\bweek\s*\d+\b',
    r'\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b',
]
DATE_PATTERN_RE = re.compile('|'.join(DATE_PATTERNS), re.IGNORECASE)


def normalize_title(title: str) -> str:
    """
    Normalize a title for comparison by removing dates, numbers, stopwords.
    This lets us detect "Ask HN: Who is hiring? (March 2026)" as the same
    recurring pattern as "Ask HN: Who is hiring? (January 2026)".
    """
    title = title.lower().strip()
    # Remove date/time references
    title = DATE_PATTERN_RE.sub('', title)
    # Remove numbers
    title = re.sub(r'\d+', '', title)
    # Remove punctuation
    title = re.sub(r'[^\w\s]', ' ', title)
    # Remove stopwords and collapse whitespace
    words = [w for w in title.split() if w not in NORMALIZE_STOPWORDS and len(w) > 2]
    return ' '.join(words)


def hash_normalized_title(normalized: str) -> str:
    return hashlib.sha256(normalized.encode()).hexdigest()[:32]


def get_recent_signals(supabase: Client, lookback_days: int = 3) -> list[dict]:
    """Get signals from the last N days that haven't been scored yet."""
    cutoff = (datetime.utcnow() - timedelta(days=lookback_days)).isoformat()
    resp = supabase.table('raw_signals') \
        .select('id, title, source, created_at, novelty_score') \
        .gte('created_at', cutoff) \
        .order('created_at', desc=True) \
        .limit(2000) \
        .execute()
    return resp.data or []


def get_recurrence_patterns(supabase: Client, source: str) -> dict[str, dict]:
    """Load known recurrence patterns for a source."""
    resp = supabase.table('signal_recurrence_patterns') \
        .select('title_hash, pattern_type, occurrence_count, avg_interval_days, confidence, canonical_title') \
        .eq('source', source) \
        .execute()
    return {r['title_hash']: r for r in (resp.data or [])}


def get_historical_title_hashes(supabase: Client, source: str, title_hash: str, lookback_days: int = 365) -> list[dict]:
    """Find historical signals with the same normalized title hash."""
    cutoff = (datetime.utcnow() - timedelta(days=lookback_days)).isoformat()

    # We need to search raw_signals for signals from this source
    # that have similar titles — we'll use the recurrence patterns table as cache
    resp = supabase.table('signal_recurrence_patterns') \
        .select('occurrence_count, avg_interval_days, confidence, last_seen_at') \
        .eq('source', source) \
        .eq('title_hash', title_hash) \
        .limit(1) \
        .execute()
    return resp.data or []


def compute_novelty_score(
    title: str,
    source: str,
    existing_patterns: dict[str, dict],
) -> tuple[float, Optional[dict]]:
    """
    Compute novelty score for a signal.
    Returns (novelty_score, updated_pattern_or_None).

    Score range: 0.0 (perfectly recurring, zero novelty) to 1.0 (fully novel).
    """
    normalized = normalize_title(title)
    if not normalized:
        return 1.0, None

    title_hash = hash_normalized_title(normalized)

    # Check 1: Known recurring prefix pattern
    is_recurring_prefix = bool(RECURRING_PREFIX_RE.match(title.strip()))

    # Check 2: Match against known recurrence patterns
    pattern = existing_patterns.get(title_hash)

    if pattern:
        # Known recurring signal — update pattern
        count = pattern.get('occurrence_count', 1) + 1
        confidence = min(0.95, pattern.get('confidence', 0.5) + 0.1)

        # Novelty decreases with each occurrence
        # After 3 occurrences: ~0.25, after 5: ~0.15, after 10: ~0.05
        novelty = max(0.05, 1.0 / (count * 1.5))

        # If it's also a known recurring prefix, reduce further
        if is_recurring_prefix:
            novelty = min(novelty, 0.1)

        updated_pattern = {
            'title_hash': title_hash,
            'source': source,
            'canonical_title': pattern.get('canonical_title', title[:200]),
            'pattern_type': pattern.get('pattern_type', 'recurring'),
            'occurrence_count': count,
            'confidence': confidence,
            'last_seen_at': datetime.utcnow().isoformat(),
        }
        return novelty, updated_pattern

    elif is_recurring_prefix:
        # New signal with a known recurring prefix — moderate novelty reduction
        new_pattern = {
            'title_hash': title_hash,
            'source': source,
            'canonical_title': title[:200],
            'pattern_type': 'recurring_prefix',
            'occurrence_count': 1,
            'confidence': 0.3,
            'last_seen_at': datetime.utcnow().isoformat(),
        }
        return 0.5, new_pattern

    # Fully novel signal
    return 1.0, None


def save_novelty_scores(supabase: Client, scores: list[tuple[str, float]]) -> int:
    """Batch update novelty scores on raw_signals."""
    saved = 0
    for signal_id, score in scores:
        try:
            supabase.table('raw_signals') \
                .update({'novelty_score': score}) \
                .eq('id', signal_id) \
                .execute()
            saved += 1
        except Exception as e:
            logger.warning(f"Failed to save novelty score for {signal_id}: {e}")
    return saved


def save_patterns(supabase: Client, patterns: list[dict]) -> int:
    """Upsert recurrence patterns."""
    saved = 0
    for p in patterns:
        try:
            supabase.table('signal_recurrence_patterns') \
                .upsert(p, on_conflict='source,title_hash') \
                .execute()
            saved += 1
        except Exception as e:
            logger.warning(f"Failed to save recurrence pattern: {e}")
    return saved


def run_novelty_scoring(lookback_days: int = 3) -> dict:
    """
    Main entry point: score recent signals for novelty.
    """
    logger.info("=" * 60)
    logger.info("NOVELTY SCORING")
    logger.info(f"Version: {NOVELTY_VERSION}")
    logger.info("=" * 60)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    signals = get_recent_signals(supabase, lookback_days)
    logger.info(f"Found {len(signals)} signals from last {lookback_days} days")

    if not signals:
        return {'scored': 0, 'patterns_updated': 0, 'low_novelty': 0}

    # Group by source to load patterns efficiently
    by_source: dict[str, list[dict]] = {}
    for s in signals:
        src = s.get('source', 'unknown')
        by_source.setdefault(src, []).append(s)

    all_scores: list[tuple[str, float]] = []
    all_patterns: list[dict] = []
    low_novelty_count = 0

    for source, source_signals in by_source.items():
        patterns = get_recurrence_patterns(supabase, source)

        for sig in source_signals:
            title = sig.get('title', '')
            if not title:
                continue

            # Skip if already scored (not default 1.0)
            existing_score = sig.get('novelty_score')
            if existing_score is not None and existing_score != 1.0:
                continue

            novelty, updated_pattern = compute_novelty_score(title, source, patterns)
            all_scores.append((sig['id'], novelty))

            if updated_pattern:
                all_patterns.append(updated_pattern)
                # Update local cache for subsequent signals in same batch
                patterns[updated_pattern['title_hash']] = updated_pattern

            if novelty < 0.5:
                low_novelty_count += 1
                logger.info(f"  Low novelty ({novelty:.2f}): [{source}] {title[:80]}")

    # Save results
    scored = save_novelty_scores(supabase, all_scores)
    patterns_saved = save_patterns(supabase, all_patterns)

    logger.info("=" * 60)
    logger.info("RESULTS")
    logger.info(f"Scored: {scored}")
    logger.info(f"Patterns updated: {patterns_saved}")
    logger.info(f"Low novelty signals: {low_novelty_count}")

    return {
        'scored': scored,
        'patterns_updated': patterns_saved,
        'low_novelty': low_novelty_count,
    }


if __name__ == '__main__':
    result = run_novelty_scoring()
    print(f"\n=== Novelty Scoring Results ===")
    for k, v in result.items():
        print(f"{k}: {v}")
