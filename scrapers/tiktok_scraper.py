"""
TikTok Scraper — STUB.
Requires TikTok Research API access (apply at developers.tiktok.com/products/research-api/).
Needs: TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET env vars.

Once approved:
- POST https://open.tiktokapis.com/v2/oauth/token/ (client credentials)
- GET  https://open.tiktokapis.com/v2/video/query/ for trending content
- Collect: video_id, title, create_time, like_count, view_count, share_count, comment_count, hashtag_names
"""
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TIKTOK_CLIENT_KEY = os.getenv("TIKTOK_CLIENT_KEY")
TIKTOK_CLIENT_SECRET = os.getenv("TIKTOK_CLIENT_SECRET")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def main():
    saved_count = 0
    error = None
    try:
        if not TIKTOK_CLIENT_KEY or not TIKTOK_CLIENT_SECRET:
            raise ValueError(
                "TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET not set. "
                "Apply for TikTok Research API at developers.tiktok.com/products/research-api/ "
                "then add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET as GitHub Actions secrets."
            )
        raise NotImplementedError(
            "TikTok scraper not yet implemented. "
            "Implement using the Research API video query endpoint once credentials are approved."
        )
    except Exception as e:
        error = e
        print(f"TikTok scraper unavailable: {e}")
    finally:
        update_scraper_health(
            "tiktok", success=(error is None), signal_count=saved_count, error=error
        )


if __name__ == "__main__":
    main()
