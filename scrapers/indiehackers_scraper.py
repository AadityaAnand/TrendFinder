import os
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from bs4 import BeautifulSoup
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

IH_URL = "https://www.indiehackers.com/posts?sortBy=trending"
MAX_POSTS = 25
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def fetch_posts() -> list[dict]:
    """Scrape trending posts from IndieHackers. Returns empty list on failure."""
    try:
        resp = requests.get(IH_URL, headers=HEADERS, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        print(f"Warning: failed to fetch IndieHackers page: {e}")
        return []

    try:
        soup = BeautifulSoup(resp.text, "html.parser")
        posts = []

        # IndieHackers uses data-testid or class-based structure for post listings.
        # Posts appear as <div class="post-preview"> or similar; we look for anchors
        # with links to /post/ paths as a stable selector.
        post_links = soup.select("a[href*='/post/']")

        seen_hrefs: set[str] = set()
        for link in post_links:
            href = link.get("href", "")
            if not href or href in seen_hrefs:
                continue
            seen_hrefs.add(href)

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            # Build absolute URL
            url = f"https://www.indiehackers.com{href}" if href.startswith("/") else href

            posts.append({
                "title": title,
                "url": url,
            })

            if len(posts) >= MAX_POSTS:
                break

        return posts

    except Exception as e:
        print(f"Warning: failed to parse IndieHackers HTML: {e}")
        return []


def save_signal(post_data: dict) -> bool:
    try:
        supabase.table('raw_signals').insert(post_data).execute()
        return True
    except Exception as e:
        err = str(e).lower()
        if 'duplicate' in err or 'unique' in err:
            return False
        print(f"Error saving indiehackers signal: {e}")
        return False


def main():
    saved_count = 0
    error = None
    try:
        print("Fetching IndieHackers trending posts...")
        posts = fetch_posts()
        print(f"Found {len(posts)} posts")

        now_utc = datetime.now(timezone.utc).isoformat()

        for post in posts:
            data = {
                'source': 'indiehackers',
                'title': post['title'],
                'url': post['url'],
                'score': 0,
                'content': None,
                'comments_count': 0,
                'created_at': now_utc,
            }

            if save_signal(data):
                saved_count += 1
                print(f"  Saved: {post['title'][:70]}...")

        print(f"\nIndieHackers scraping complete. Saved {saved_count} posts.")
    except Exception as e:
        error = e
        print(f"Scraper error: {e}")
    finally:
        update_scraper_health('indiehackers', success=(error is None), signal_count=saved_count, error=error)


if __name__ == "__main__":
    main()
