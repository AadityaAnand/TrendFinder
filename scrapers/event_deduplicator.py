"""
Event-based deduplication: groups signals that reference the same real-world event
(e.g., same news story, court ruling, product launch posted across multiple platforms).

Runs after URL/title dedup and before novelty scoring + clustering.
Does NOT delete signals — marks them with an event_group_id and stores
group metadata so downstream stages can adjust weight.
"""

import os
import re
import json
import hashlib
import logging
from math import log
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from dotenv import load_dotenv
from supabase import create_client, Client
from rapidfuzz import fuzz

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Thresholds ──────────────────────────────────────────────────────────────

ENTITY_SIMILARITY_THRESHOLD = 0.75   # Jaccard overlap of key entities
TITLE_SIMILARITY_THRESHOLD = 0.70    # Lower than dedup (0.90) — catches same-event rewrites
MIN_GROUP_SIZE = 2                   # Need at least 2 signals to form a group
LOOKBACK_DAYS = 3                    # Only group signals within this window

# ── URL normalization (reuses deduplication patterns) ────────────────────────

# Domains that host external links (wrapper sites)
WRAPPER_DOMAINS = {'news.ycombinator.com', 'reddit.com', 'twitter.com', 'x.com',
                   'facebook.com', 'linkedin.com'}

TRACKING_PARAMS = {'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                   'ref', 'source', 'share', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'}


def _extract_external_url(signal: dict) -> str | None:
    """Extract the canonical external URL a signal points to (not the wrapper URL)."""
    url = signal.get('url', '')
    if not url:
        return None

    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

    parsed = urlparse(url)
    domain = parsed.netloc.lower().replace('www.', '')

    # For wrapper sites, look for the actual link in platform_data
    if any(w in domain for w in WRAPPER_DOMAINS):
        pd = signal.get('platform_data') or {}
        if isinstance(pd, str):
            try:
                pd = json.loads(pd)
            except (json.JSONDecodeError, TypeError):
                pd = {}
        ext_url = pd.get('external_url') or pd.get('link') or pd.get('url')
        if ext_url:
            url = ext_url
            parsed = urlparse(url)

    # Strip tracking params and normalize
    parsed = parsed._replace(fragment='', scheme='https')
    if parsed.query:
        params = parse_qs(parsed.query, keep_blank_values=True)
        clean = {k: v for k, v in params.items() if k not in TRACKING_PARAMS}
        parsed = parsed._replace(query=urlencode(clean, doseq=True) if clean else '')

    normalized = urlunparse(parsed).rstrip('/')
    return normalized if normalized and len(normalized) > 15 else None


# ── Entity extraction (lightweight, no spaCy dependency) ─────────────────────

# Patterns for key entities in signal titles
_PROPER_NOUN = re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b')
_QUOTED = re.compile(r'["""]([^"""]+)["""]')
_ACRONYM = re.compile(r'\b([A-Z]{2,6})\b')
_VERSION = re.compile(r'\b(v?\d+\.\d+(?:\.\d+)?)\b')

# Common stop words to filter out from entity matching
_STOP_ENTITIES = {
    'The', 'This', 'That', 'These', 'Those', 'What', 'Why', 'How', 'When',
    'Where', 'Who', 'Show', 'Ask', 'New', 'First', 'Last', 'Update',
    'Launch', 'Release', 'Breaking', 'Just', 'Now', 'Today', 'Yesterday',
}


def extract_key_entities(title: str) -> set[str]:
    """Extract proper nouns, quoted terms, acronyms, and versions from a title."""
    if not title:
        return set()

    entities = set()

    for m in _PROPER_NOUN.finditer(title):
        name = m.group(1)
        if name not in _STOP_ENTITIES and len(name) > 2:
            entities.add(name.lower())

    for m in _QUOTED.finditer(title):
        entities.add(m.group(1).lower().strip())

    for m in _ACRONYM.finditer(title):
        acr = m.group(1)
        if acr not in {'HN', 'TL', 'DR', 'AI', 'ML', 'US', 'UK', 'EU'}:
            entities.add(acr.lower())

    for m in _VERSION.finditer(title):
        entities.add(m.group(1).lower())

    return entities


def jaccard_similarity(set_a: set, set_b: set) -> float:
    """Jaccard similarity between two sets."""
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


# ── Grouping logic ───────────────────────────────────────────────────────────

def _group_by_external_url(signals: list[dict]) -> tuple[list[list[dict]], list[dict]]:
    """
    Pass 1: Group signals that share the same external canonical URL.
    Returns (groups, ungrouped_signals).
    """
    url_map: dict[str, list[dict]] = defaultdict(list)
    no_url: list[dict] = []

    for sig in signals:
        ext_url = _extract_external_url(sig)
        if ext_url:
            url_map[ext_url].append(sig)
        else:
            no_url.append(sig)

    groups = []
    ungrouped = list(no_url)

    for url, sigs in url_map.items():
        if len(sigs) >= MIN_GROUP_SIZE:
            groups.append(sigs)
        else:
            ungrouped.extend(sigs)

    return groups, ungrouped


def _group_by_entities(signals: list[dict]) -> tuple[list[list[dict]], list[dict]]:
    """
    Pass 2: Group remaining signals by key entity overlap + title similarity.
    Uses a union-find approach: if A matches B and B matches C, all three are grouped.
    """
    if len(signals) < MIN_GROUP_SIZE:
        return [], signals

    # Precompute entities and normalized titles
    sig_data = []
    for sig in signals:
        title = sig.get('title', '')
        entities = extract_key_entities(title)
        sig_data.append({
            'signal': sig,
            'entities': entities,
            'title_lower': title.lower().strip(),
        })

    # Union-Find
    parent = list(range(len(sig_data)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    # Compare pairs
    for i in range(len(sig_data)):
        for j in range(i + 1, len(sig_data)):
            # Skip if already in same group
            if find(i) == find(j):
                continue

            si, sj = sig_data[i], sig_data[j]

            # Entity overlap check (primary)
            entity_sim = jaccard_similarity(si['entities'], sj['entities'])

            # Title similarity check (secondary, uses fuzzy matching)
            title_sim = fuzz.token_sort_ratio(si['title_lower'], sj['title_lower']) / 100.0

            # Combined score: entity overlap is stronger signal
            if si['entities'] and sj['entities'] and len(si['entities']) >= 2 and len(sj['entities']) >= 2:
                # Both have meaningful entities — entity overlap dominates
                if entity_sim >= ENTITY_SIMILARITY_THRESHOLD:
                    union(i, j)
                elif entity_sim >= 0.5 and title_sim >= TITLE_SIMILARITY_THRESHOLD:
                    union(i, j)
            else:
                # Sparse entities — rely more on title similarity
                if title_sim >= 0.80:
                    union(i, j)

    # Collect groups
    group_map: dict[int, list[dict]] = defaultdict(list)
    for idx, sd in enumerate(sig_data):
        root = find(idx)
        group_map[root].append(sd['signal'])

    groups = []
    ungrouped = []
    for sigs in group_map.values():
        if len(sigs) >= MIN_GROUP_SIZE:
            groups.append(sigs)
        else:
            ungrouped.extend(sigs)

    return groups, ungrouped


# ── Weight adjustment ────────────────────────────────────────────────────────

def compute_adjusted_weight(group: list[dict]) -> float:
    """
    Weight for an event group: base_weight * log(1 + group_size) * source_diversity_factor
    - base_weight = max engagement in group
    - source_diversity = 0.5 + 0.5 * (unique_sources / total)
    """
    group_size = len(group)
    engagements = [
        (s.get('score', 0) or 0) + (s.get('comments_count', 0) or 0)
        for s in group
    ]
    base_weight = max(engagements) if engagements else 0

    unique_sources = len(set(s.get('source', '') for s in group))
    source_diversity = 0.5 + 0.5 * (unique_sources / group_size)

    return base_weight * log(1 + group_size) * source_diversity


def _make_event_id(group: list[dict]) -> str:
    """Deterministic event ID from sorted signal IDs."""
    sorted_ids = sorted(str(s['id']) for s in group)
    content = '|'.join(sorted_ids)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


# ── Main ─────────────────────────────────────────────────────────────────────

def run_event_deduplication(lookback_days: int = LOOKBACK_DAYS) -> dict:
    """
    Run event-based deduplication on recent signals.
    Returns summary stats.
    """
    logger.info("=== Event-Based Deduplication ===")

    cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()

    # Fetch recent non-duplicate signals
    response = supabase.table('raw_signals') \
        .select('id, title, url, source, score, comments_count, created_at, platform_data') \
        .gte('created_at', cutoff) \
        .order('created_at', desc=True) \
        .execute()

    signals = response.data or []
    logger.info(f"Fetched {len(signals)} signals from last {lookback_days} days")

    if len(signals) < MIN_GROUP_SIZE:
        logger.info("Not enough signals for event grouping")
        return {'signals_processed': len(signals), 'groups_found': 0}

    # Exclude already-duplicate signals
    dup_response = supabase.table('signal_duplicates') \
        .select('duplicate_signal_id') \
        .execute()
    duplicate_ids = set(d['duplicate_signal_id'] for d in (dup_response.data or []))
    signals = [s for s in signals if s['id'] not in duplicate_ids]
    logger.info(f"After excluding duplicates: {len(signals)} signals")

    # Pass 1: Group by external URL
    url_groups, remaining = _group_by_external_url(signals)
    logger.info(f"Pass 1 (URL): {len(url_groups)} groups, {len(remaining)} remaining")

    # Pass 2: Group by entity overlap
    entity_groups, ungrouped = _group_by_entities(remaining)
    logger.info(f"Pass 2 (entity): {len(entity_groups)} groups, {len(ungrouped)} ungrouped")

    all_groups = url_groups + entity_groups

    if not all_groups:
        logger.info("No event groups found")
        return {'signals_processed': len(signals), 'groups_found': 0}

    # Save event groups and update signals
    saved = 0
    total_grouped_signals = 0

    for group in all_groups:
        event_id = _make_event_id(group)
        signal_ids = [s['id'] for s in group]
        unique_sources = list(set(s.get('source', '') for s in group))
        adjusted_weight = compute_adjusted_weight(group)

        timestamps = [s.get('created_at', '') for s in group if s.get('created_at')]
        first_seen = min(timestamps) if timestamps else None
        last_seen = max(timestamps) if timestamps else None

        # Representative title: pick the one with highest engagement
        representative = max(group, key=lambda s: (s.get('score', 0) or 0) + (s.get('comments_count', 0) or 0))

        group_data = {
            'event_id': event_id,
            'representative_title': representative.get('title', '')[:300],
            'signal_ids': signal_ids,
            'group_size': len(group),
            'source_diversity': len(unique_sources),
            'sources': unique_sources,
            'adjusted_weight': round(adjusted_weight, 2),
            'first_seen': first_seen,
            'last_seen': last_seen,
        }

        try:
            # Upsert event group
            supabase.table('event_groups').upsert(
                group_data,
                on_conflict='event_id'
            ).execute()

            # Tag signals with their event group
            for sid in signal_ids:
                supabase.table('raw_signals').update(
                    {'event_group_id': event_id}
                ).eq('id', sid).execute()

            saved += 1
            total_grouped_signals += len(group)
        except Exception as e:
            logger.error(f"Error saving event group {event_id}: {e}")

    stats = {
        'signals_processed': len(signals),
        'groups_found': len(all_groups),
        'groups_saved': saved,
        'signals_grouped': total_grouped_signals,
        'signals_ungrouped': len(ungrouped),
        'url_groups': len(url_groups),
        'entity_groups': len(entity_groups),
    }

    logger.info(f"=== Event Dedup Summary ===")
    logger.info(f"  Groups found: {stats['groups_found']} ({stats['url_groups']} URL, {stats['entity_groups']} entity)")
    logger.info(f"  Signals grouped: {stats['signals_grouped']}/{stats['signals_processed']}")
    logger.info(f"  Reduction: {stats['signals_grouped'] - stats['groups_found']} fewer effective signals")

    return stats


if __name__ == '__main__':
    try:
        result = run_event_deduplication()
        print(f"\n=== Result ===")
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
