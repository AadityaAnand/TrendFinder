import os
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

PRODUCTHUNT_API_TOKEN = os.getenv("PRODUCTHUNT_API_TOKEN")
PRODUCTHUNT_API_URL = "https://api.producthunt.com/v2/api/graphql"

POSTS_LIMIT = 30

QUERY = """
{
  posts(first: %d, order: VOTES) {
    edges {
      node {
        name
        tagline
        url
        votesCount
        commentsCount
        createdAt
      }
    }
  }
}
""" % POSTS_LIMIT


def fetch_posts() -> list[dict]:
    headers = {
        "Authorization": f"Bearer {PRODUCTHUNT_API_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    try:
        response = requests.post(
            PRODUCTHUNT_API_URL,
            json={"query": QUERY},
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        edges = data.get("data", {}).get("posts", {}).get("edges", [])
        return [edge["node"] for edge in edges]
    except Exception as e:
        print(f"Error fetching Product Hunt posts: {e}")
        return []


def save_signal(post_data: dict) -> bool:
    try:
        supabase.table('raw_signals').insert(post_data).execute()
        return True
    except Exception as e:
        err = str(e).lower()
        if 'duplicate' in err or 'unique' in err:
            return False
        print(f"Error saving producthunt signal: {e}")
        return False


def main():
    saved_count = 0
    error = None
    try:
        if not PRODUCTHUNT_API_TOKEN:
            raise ValueError("Missing PRODUCTHUNT_API_TOKEN — skipping Product Hunt scraper")

        print("Fetching Product Hunt posts...")
        posts = fetch_posts()
        print(f"Found {len(posts)} posts")

        for post in posts:
            name = post.get("name", "")
            tagline = post.get("tagline", "")
            url = post.get("url", "")
            votes = post.get("votesCount", 0)
            comments = post.get("commentsCount", 0)
            created_at_raw = post.get("createdAt", "")

            if not url:
                continue

            # Normalise created_at to ISO format
            try:
                created_at = datetime.fromisoformat(
                    created_at_raw.replace("Z", "+00:00")
                ).astimezone(timezone.utc).isoformat()
            except Exception:
                created_at = datetime.now(timezone.utc).isoformat()

            title = f"{name} — {tagline}" if tagline else name

            data = {
                'source': 'producthunt',
                'title': title,
                'url': url,
                'score': votes,
                'content': None,
                'comments_count': comments,
                'created_at': created_at,
            }

            if save_signal(data):
                saved_count += 1
                print(f"  Saved: {title[:70]}...")

        print(f"\nProduct Hunt scraping complete. Saved {saved_count} posts.")
    except Exception as e:
        error = e
        print(f"Scraper error: {e}")
    finally:
        update_scraper_health('producthunt', success=(error is None), signal_count=saved_count, error=error)


if __name__ == "__main__":
    main()
