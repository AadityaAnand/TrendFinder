import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import praw
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "rishi-trend-scraper/1.0")

SUBREDDITS = [
    "startups",
    "Entrepreneur",
    "SaaS",
    "SomebodyMakeThis",
    "indiebiz",
    "EntrepreneurRideAlong",
    "growmybusiness",
    "BusinessIdeas",
    "StartupIdeas",
    "alphaandbetausers",
]

POSTS_PER_SUBREDDIT = 30
MIN_SCORE = 5


def get_reddit_client() -> praw.Reddit:
    return praw.Reddit(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_CLIENT_SECRET,
        user_agent=REDDIT_USER_AGENT,
    )


def save_signal(post_data: dict) -> bool:
    try:
        supabase.table('raw_signals').insert(post_data).execute()
        return True
    except Exception as e:
        err = str(e).lower()
        if 'duplicate' in err or 'unique' in err:
            return False
        print(f"Error saving reddit signal: {e}")
        return False


def main():
    saved_count = 0
    error = None
    try:
        if not REDDIT_CLIENT_ID or not REDDIT_CLIENT_SECRET:
            raise ValueError("Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET — skipping Reddit scraper")

        reddit = get_reddit_client()

        seen_urls: set[str] = set()
        skipped_count = 0

        for subreddit_name in SUBREDDITS:
            print(f"Scraping r/{subreddit_name}...")
            try:
                subreddit = reddit.subreddit(subreddit_name)
                for post in subreddit.hot(limit=POSTS_PER_SUBREDDIT):
                    if post.score < MIN_SCORE:
                        skipped_count += 1
                        continue

                    url = f"https://reddit.com{post.permalink}"

                    # Deduplicate within this run (same post can appear in multiple subreddits)
                    if url in seen_urls:
                        skipped_count += 1
                        continue
                    seen_urls.add(url)

                    created_at = datetime.fromtimestamp(
                        post.created_utc, tz=timezone.utc
                    ).isoformat()

                    data = {
                        'source': 'reddit',
                        'title': post.title,
                        'url': url,
                        'score': post.score,
                        'content': None,
                        'comments_count': post.num_comments,
                        'created_at': created_at,
                    }

                    if save_signal(data):
                        saved_count += 1
                        print(f"  Saved: {post.title[:70]}...")

            except Exception as e:
                print(f"  Warning: failed to scrape r/{subreddit_name}: {e}")
                continue

        print(f"\nReddit scraping complete. Saved {saved_count} posts ({skipped_count} skipped).")
    except Exception as e:
        error = e
        print(f"Scraper error: {e}")
    finally:
        update_scraper_health('reddit', success=(error is None), signal_count=saved_count, error=error)


if __name__ == "__main__":
    main()
