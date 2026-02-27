"""
Shared utility functions for all scrapers.
"""
import os
from datetime import datetime, timezone, timedelta

from supabase import create_client, Client


def get_supabase() -> Client:
    url = os.environ['SUPABASE_URL']
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_KEY']
    return create_client(url, key)


def update_scraper_health(
    source: str,
    success: bool,
    signal_count: int = 0,
    error: Exception | str | None = None,
) -> None:
    """
    Upsert the scraper_health row for `source`.
    Call this at the end of every scraper run (success or failure).
    """
    try:
        db = get_supabase()
        now = datetime.now(timezone.utc).isoformat()

        # Fetch existing record to read consecutive_failures
        existing = db.table('scraper_health') \
            .select('consecutive_failures, last_success') \
            .eq('source', source) \
            .maybe_single() \
            .execute()
        row = existing.data or {}

        consecutive_failures = 0 if success else (row.get('consecutive_failures', 0) + 1)

        # Count this source's signals in the last 24 hours
        cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        count_res = db.table('raw_signals') \
            .select('id', count='exact') \
            .eq('source', source) \
            .gte('created_at', cutoff_24h) \
            .execute()
        signals_24h = count_res.count or 0

        if consecutive_failures >= 2:
            status = 'failed'
        elif consecutive_failures == 1:
            status = 'degraded'
        else:
            status = 'healthy'

        db.table('scraper_health').upsert({
            'source': source,
            'last_run': now,
            'last_success': now if success else row.get('last_success'),
            'consecutive_failures': consecutive_failures,
            'total_signals_24h': signals_24h,
            'last_signal_count': signal_count,
            'status': status,
            'last_error': None if success else str(error),
            'updated_at': now,
        }, on_conflict='source').execute()
    except Exception as e:
        # Health tracking must never crash the scraper
        print(f"[scraper_utils] Failed to update scraper_health for {source}: {e}")
