"""
Phase 9d: Pain Phrase Extraction

Extracts specific pain phrases, needs, and wishes from signals in each cluster.
These are used to generate better "What to build" ideas.

Runs after hypothesis generation, before brief generation.
"""

import os
import re
import json
import logging
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

PAIN_VERSION = 'pain-v1'

# Pain phrase patterns with type classification
PAIN_PATTERNS = [
    # Wishes and needs
    (r'(?:i |we )?wish(?:ed)? (?:there was|someone would|i could)', 'wish'),
    (r"(?:i |we )?need\s+(?:a |an |some )", 'need'),
    (r"(?:i |we )?want\s+(?:a |an |some |to )", 'need'),
    (r"if only (?:there was|someone|i could)", 'wish'),
    (r"(?:i'm |we're )?looking for\s+(?:a |an |some )", 'need'),
    (r"anyone know(?:s)? (?:of )?(?:a |an )", 'need'),
    (r"recommend(?:ation)?(?:s)? for", 'need'),

    # Frustrations
    (r"(?:it's |its |this is )?(?:so |really |incredibly )?(?:hard|difficult|painful|tedious|annoying) to", 'frustration'),
    (r"(?:i'm |we're )?(?:frustrated|struggling|tired of|sick of|fed up)", 'frustration'),
    (r"(?:this |it )?(?:doesn't|does not|won't|will not|can't|cannot) (?:work|scale|handle)", 'frustration'),
    (r"(?:too |extremely )?(?:slow|expensive|complex|complicated|buggy|unreliable)", 'frustration'),
    (r"broken|breaking change|deprecated|buggy|unreliable", 'frustration'),
    (r"pain[- ]?point", 'frustration'),
    (r"(?:keeps? |constantly |always )?(?:breaking|crashing|failing)", 'frustration'),

    # Questions indicating gaps
    (r"why (?:doesn't|isn't|can't|won't) (?:anyone|somebody|someone)", 'question'),
    (r"(?:has |is )?(?:anyone|somebody) (?:built|made|created|found)", 'question'),
    (r"what(?:'s| is) the best (?:way|tool|approach|solution) (?:to|for)", 'question'),
    (r"how (?:do|can|should) (?:i|we|you) (?:handle|deal with|solve|fix)", 'question'),
    (r"any (?:good )?(?:alternative|replacement|substitute)(?:s)? (?:to|for)", 'question'),

    # Gaps in existing solutions
    (r"existing (?:tools?|solutions?|options?) (?:don't|doesn't|can't|lack)", 'gap'),
    (r"no (?:good |decent )?(?:solution|tool|option|way) for", 'gap'),
    (r"(?:missing|lacks?|no support for)\s+\w+", 'gap'),
    (r"(?:current|existing) (?:tools?|solutions?) (?:are )?(?:too |not )", 'gap'),

    # Creator-specific patterns
    (r"my (?:audience|followers|subscribers) (?:keep|want|ask|need)", 'need'),
    (r"(?:no |lack of )?(?:good )?(?:monetization|revenue|income) (?:option|strategy|model)", 'gap'),
    (r"(?:algorithm|reach|views|impressions) (?:dropped|decreased|tanked)", 'frustration'),
]

# Compile patterns
COMPILED_PATTERNS = [(re.compile(p, re.IGNORECASE), ptype) for p, ptype in PAIN_PATTERNS]


def extract_phrases_from_signal(title: str, content: str = '') -> list[dict]:
    """
    Extract pain phrases from a signal's title and content.
    Returns list of {phrase, phrase_type, matched_pattern}.
    """
    results = []
    text = f"{title}. {content}" if content else title

    for regex, phrase_type in COMPILED_PATTERNS:
        matches = regex.finditer(text)
        for match in matches:
            # Get surrounding context (up to 120 chars around the match)
            start = max(0, match.start() - 30)
            end = min(len(text), match.end() + 90)
            context = text[start:end].strip()

            # Clean up the phrase
            if start > 0:
                context = '...' + context
            if end < len(text):
                context = context + '...'

            results.append({
                'phrase': context[:200],
                'phrase_type': phrase_type,
                'matched_text': match.group()[:100],
            })

    return results


def get_latest_snapshot(supabase: Client) -> Optional[dict]:
    resp = supabase.table('trend_snapshots') \
        .select('id, run_at') \
        .order('run_at', desc=True) \
        .limit(1) \
        .execute()
    return resp.data[0] if resp.data else None


def get_snapshot_trends(supabase: Client, snapshot_id: str) -> list[dict]:
    resp = supabase.table('trend_snapshot_items') \
        .select('trend_id, signal_count, trend_keyword') \
        .eq('snapshot_id', snapshot_id) \
        .execute()
    return resp.data or []


def get_trend_signals(supabase: Client, snapshot_id: str, trend_id: str, limit: int = 20) -> list[dict]:
    sig_resp = supabase.table('trend_signals') \
        .select('signal_id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .execute()

    if not sig_resp.data:
        return []

    signal_ids = [s['signal_id'] for s in sig_resp.data][:limit * 2]

    details = supabase.table('raw_signals') \
        .select('id, title, url, source, content') \
        .in_('id', signal_ids) \
        .order('score', desc=True) \
        .limit(limit) \
        .execute()

    return details.data or []


def get_existing_phrases(supabase: Client, snapshot_id: str, trend_id: str) -> bool:
    """Check if we already extracted phrases for this trend+snapshot."""
    resp = supabase.table('cluster_pain_phrases') \
        .select('id') \
        .eq('snapshot_id', snapshot_id) \
        .eq('trend_id', trend_id) \
        .limit(1) \
        .execute()
    return bool(resp.data)


def save_pain_phrases(supabase: Client, snapshot_id: str, trend_id: str, phrases: list[dict]) -> int:
    """Save extracted pain phrases to DB."""
    saved = 0
    for p in phrases:
        try:
            supabase.table('cluster_pain_phrases') \
                .upsert({
                    'trend_id': trend_id,
                    'snapshot_id': snapshot_id,
                    'phrase': p['phrase'],
                    'phrase_type': p['phrase_type'],
                    'signal_ids': p.get('signal_ids', []),
                    'frequency': p.get('frequency', 1),
                    'source_signals': json.dumps(p.get('source_signals', [])),
                }, on_conflict='trend_id,snapshot_id,phrase') \
                .execute()
            saved += 1
        except Exception as e:
            logger.warning(f"Failed to save phrase: {e}")
    return saved


def run_pain_phrase_extraction(snapshot_id: str = None) -> dict:
    """
    Main entry point: extract pain phrases from all trends in latest snapshot.
    """
    logger.info("=" * 60)
    logger.info("PAIN PHRASE EXTRACTION")
    logger.info(f"Version: {PAIN_VERSION}")
    logger.info("=" * 60)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    if not snapshot_id:
        snapshot = get_latest_snapshot(supabase)
        if not snapshot:
            logger.error("No snapshot found")
            return {'trends_processed': 0, 'phrases_found': 0, 'skipped': 0}
        snapshot_id = snapshot['id']

    logger.info(f"Using snapshot: {snapshot_id}")

    trends = get_snapshot_trends(supabase, snapshot_id)
    logger.info(f"Found {len(trends)} trends")

    stats = {'trends_processed': 0, 'phrases_found': 0, 'skipped': 0}

    for trend in trends:
        trend_id = trend['trend_id']

        # Skip if already extracted
        if get_existing_phrases(supabase, snapshot_id, trend_id):
            stats['skipped'] += 1
            continue

        signals = get_trend_signals(supabase, snapshot_id, trend_id)
        if not signals:
            continue

        # Extract phrases from all signals
        phrase_map: dict[str, dict] = {}  # dedupe by phrase text

        for sig in signals:
            title = sig.get('title', '')
            content = sig.get('content', '') or ''
            extracted = extract_phrases_from_signal(title, content)

            for phrase_data in extracted:
                phrase_key = phrase_data['phrase'][:100].lower()

                if phrase_key in phrase_map:
                    # Increment frequency, add signal reference
                    phrase_map[phrase_key]['frequency'] += 1
                    if sig['id'] not in phrase_map[phrase_key]['signal_ids']:
                        phrase_map[phrase_key]['signal_ids'].append(sig['id'])
                        phrase_map[phrase_key]['source_signals'].append({
                            'title': title[:150],
                            'source': sig.get('source', ''),
                            'url': sig.get('url', ''),
                        })
                else:
                    phrase_map[phrase_key] = {
                        'phrase': phrase_data['phrase'],
                        'phrase_type': phrase_data['phrase_type'],
                        'frequency': 1,
                        'signal_ids': [sig['id']],
                        'source_signals': [{
                            'title': title[:150],
                            'source': sig.get('source', ''),
                            'url': sig.get('url', ''),
                        }],
                    }

        phrases = list(phrase_map.values())

        if phrases:
            saved = save_pain_phrases(supabase, snapshot_id, trend_id, phrases)
            stats['phrases_found'] += saved
            keyword = trend.get('trend_keyword', 'unknown')[:40]
            logger.info(f"  {keyword}: {saved} phrase(s) ({', '.join(set(p['phrase_type'] for p in phrases))})")

        stats['trends_processed'] += 1

    logger.info("=" * 60)
    logger.info("RESULTS")
    logger.info(f"Trends processed: {stats['trends_processed']}")
    logger.info(f"Phrases found: {stats['phrases_found']}")
    logger.info(f"Skipped (already done): {stats['skipped']}")

    return stats


if __name__ == '__main__':
    result = run_pain_phrase_extraction()
    print(f"\n=== Pain Phrase Extraction Results ===")
    for k, v in result.items():
        print(f"{k}: {v}")
