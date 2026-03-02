"""
Instagram Scraper — STUB.
Requires Meta Graph API access with Instagram Basic Display or Instagram Graph API.
Needs: INSTAGRAM_ACCESS_TOKEN env var (requires approved Meta app + business account).

Once approved:
- GET https://graph.instagram.com/me/media for recent posts
- GET https://graph.facebook.com/v18.0/ig_hashtag_search for hashtag trends
- GET https://graph.facebook.com/v18.0/{hashtag_id}/top_media for trending content
- Collect: caption, timestamp, like_count, comments_count, media_type, permalink
"""
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
INSTAGRAM_ACCESS_TOKEN = os.getenv("INSTAGRAM_ACCESS_TOKEN")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def main():
    saved_count = 0
    error = None
    try:
        if not INSTAGRAM_ACCESS_TOKEN:
            raise ValueError(
                "INSTAGRAM_ACCESS_TOKEN not set. "
                "Create a Meta Developer app at developers.facebook.com, "
                "enable Instagram Graph API, then add INSTAGRAM_ACCESS_TOKEN as a GitHub Actions secret."
            )
        raise NotImplementedError(
            "Instagram scraper not yet implemented. "
            "Implement using the Instagram Graph API hashtag search endpoint once access is approved."
        )
    except Exception as e:
        error = e
        print(f"Instagram scraper unavailable: {e}")
    finally:
        update_scraper_health(
            "instagram", success=(error is None), signal_count=saved_count, error=error
        )


if __name__ == "__main__":
    main()
