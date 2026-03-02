"""
Medium Scraper — creator economy and content creation articles via RSS.
No API key needed — uses public RSS feeds.
"""
import os
import time
from datetime import datetime, timedelta, timezone
import feedparser
from dotenv import load_dotenv
from supabase import create_client, Client
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Creator-focused Medium tag feeds
CREATOR_FEEDS = [
    ("https://medium.com/feed/tag/creator-economy", "creator-economy"),
    ("https://medium.com/feed/tag/content-creation", "content-creation"),
    ("https://medium.com/feed/tag/youtube", "youtube"),
    ("https://medium.com/feed/tag/newsletter", "newsletter"),
    ("https://medium.com/feed/tag/podcasting", "podcasting"),
    ("https://medium.com/feed/tag/influencer-marketing", "influencer-marketing"),
    ("https://medium.com/feed/tag/tiktok", "tiktok"),
    ("https://medium.com/feed/tag/substack", "substack"),
    ("https://medium.com/feed/tag/personal-branding", "personal-branding"),
]

ENTRIES_PER_FEED = 8
RECENCY_DAYS = 14


def is_recent(entry) -> bool:
    """Check if the entry was published within RECENCY_DAYS."""
    published = entry.get("published_parsed") or entry.get("updated_parsed")
    if not published:
        return True  # if no date, include it
    pub_dt = datetime(*published[:6], tzinfo=timezone.utc)
    cutoff = datetime.now(timezone.utc) - timedelta(days=RECENCY_DAYS)
    return pub_dt >= cutoff


def save_signal(title: str, url: str, tag: str) -> bool:
    """Save a Medium article as a raw_signal."""
    if not title or not url:
        return False
    data = {
        "source": "medium",
        "source_type": "creator",
        "title": title[:500],
        "url": url,
        "score": 0,
        "content": None,
        "comments_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "platform_data": {"tag": tag},
    }
    try:
        supabase.table("raw_signals").insert(data).execute()
        return True
    except Exception as e:
        err = str(e).lower()
        if "duplicate" in err or "unique" in err:
            return False
        print(f"  Error saving '{title[:60]}': {e}")
        return False


def main():
    saved_count = 0
    error = None
    try:
        print(f"Scraping {len(CREATOR_FEEDS)} Medium creator feeds...")

        for feed_url, tag in CREATOR_FEEDS:
            print(f"  Feed: {tag}")
            try:
                feed = feedparser.parse(feed_url)
                entries = feed.entries[:ENTRIES_PER_FEED]
                for entry in entries:
                    if not is_recent(entry):
                        continue
                    title = entry.get("title", "")
                    url = entry.get("link", "")
                    if save_signal(title, url, tag):
                        saved_count += 1
            except Exception as e:
                print(f"  Warning: failed to parse feed {feed_url}: {e}")
                continue
            time.sleep(0.5)

        print(f"\nMedium scraping complete. Saved {saved_count} articles.")
    except Exception as e:
        error = e
        print(f"Scraper error: {e}")
    finally:
        update_scraper_health(
            "medium", success=(error is None), signal_count=saved_count, error=error
        )


if __name__ == "__main__":
    main()
