import os
import feedparser
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
import calendar

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Curated newsletters with strong startup/product/dev audience
NEWSLETTERS = [
    "lenny",
    "pragmaticengineer",
    "shreyas",
    "every",
    "thegeneralist",
    "notboring",
    "julian",
    "dvassallo",
    "sweatystartup",
    "trends",
]

ENTRIES_PER_FEED = 5
MAX_AGE_DAYS = 7


def parse_published_utc(entry) -> str | None:
    """Convert feedparser's published_parsed (UTC struct_time) to ISO string."""
    try:
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            ts = calendar.timegm(entry.published_parsed)
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        pass
    return None


def is_recent(published_utc: str | None, max_age_days: int = MAX_AGE_DAYS) -> bool:
    if not published_utc:
        return True  # include if we can't determine age
    try:
        published = datetime.fromisoformat(published_utc)
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        return published >= cutoff
    except Exception:
        return True


def fetch_feed(newsletter_name: str) -> list[dict]:
    url = f"https://{newsletter_name}.substack.com/feed"
    try:
        feed = feedparser.parse(url)
        if feed.bozo and not feed.entries:
            print(f"  Warning: feed parse error for {newsletter_name}: {feed.bozo_exception}")
            return []

        results = []
        for entry in feed.entries[:ENTRIES_PER_FEED]:
            title = getattr(entry, "title", "").strip()
            link = getattr(entry, "link", "").strip()

            if not title or not link:
                continue

            published_utc = parse_published_utc(entry)
            if not is_recent(published_utc):
                continue

            results.append({
                "title": title,
                "url": link,
                "created_at": published_utc or datetime.now(timezone.utc).isoformat(),
            })
        return results

    except Exception as e:
        print(f"  Warning: failed to fetch feed for {newsletter_name}: {e}")
        return []


def save_signal(post_data: dict) -> bool:
    try:
        supabase.table('raw_signals').insert(post_data).execute()
        return True
    except Exception as e:
        err = str(e).lower()
        if 'duplicate' in err or 'unique' in err:
            return False
        print(f"Error saving substack signal: {e}")
        return False


def main():
    print("Fetching Substack newsletter posts...")
    saved_count = 0
    total_fetched = 0

    for name in NEWSLETTERS:
        print(f"  Fetching {name}.substack.com...")
        entries = fetch_feed(name)
        total_fetched += len(entries)

        for entry in entries:
            data = {
                'source': 'substack',
                'title': entry['title'],
                'url': entry['url'],
                'score': 0,
                'content': None,
                'comments_count': 0,
                'created_at': entry['created_at'],
            }
            if save_signal(data):
                saved_count += 1
                print(f"    Saved: {entry['title'][:70]}...")

    print(f"\nSubstack scraping complete. Fetched {total_fetched} entries, saved {saved_count}.")


if __name__ == "__main__":
    main()
