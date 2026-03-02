"""
Pinterest Scraper — STUB.
Requires Pinterest Developer API access (apply at developers.pinterest.com).
Needs: PINTEREST_ACCESS_TOKEN env var (OAuth 2.0).

Once approved:
- GET https://api.pinterest.com/v5/boards/{board_id}/pins for trending pins
- GET https://api.pinterest.com/v5/search/pins?query={topic} for topic signals
- Collect: title, description, link, save_count, created_at, dominant_color, media_type
"""
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
PINTEREST_ACCESS_TOKEN = os.getenv("PINTEREST_ACCESS_TOKEN")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def main():
    saved_count = 0
    error = None
    try:
        if not PINTEREST_ACCESS_TOKEN:
            raise ValueError(
                "PINTEREST_ACCESS_TOKEN not set. "
                "Apply for Pinterest API access at developers.pinterest.com, "
                "then add PINTEREST_ACCESS_TOKEN as a GitHub Actions secret."
            )
        raise NotImplementedError(
            "Pinterest scraper not yet implemented. "
            "Implement using Pinterest API v5 pins/search endpoint once access is approved."
        )
    except Exception as e:
        error = e
        print(f"Pinterest scraper unavailable: {e}")
    finally:
        update_scraper_health(
            "pinterest", success=(error is None), signal_count=saved_count, error=error
        )


if __name__ == "__main__":
    main()
