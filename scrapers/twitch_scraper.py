"""
Twitch Scraper — top categories and live stream trends via Twitch Helix API.
Needs: TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET env vars (Twitch Developer app).
"""
import os
import time
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import requests
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TWITCH_CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TWITCH_API_BASE = "https://api.twitch.tv/helix"
TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"

MAX_CATEGORIES = 50


def get_twitch_token() -> str:
    """Get app access token via client credentials."""
    resp = requests.post(
        TWITCH_TOKEN_URL,
        data={
            "client_id": TWITCH_CLIENT_ID,
            "client_secret": TWITCH_CLIENT_SECRET,
            "grant_type": "client_credentials",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def twitch_get(token: str, endpoint: str, params: dict = None) -> dict:
    """Make an authenticated Twitch Helix API GET request."""
    resp = requests.get(
        f"{TWITCH_API_BASE}{endpoint}",
        params=params or {},
        headers={
            "Authorization": f"Bearer {token}",
            "Client-Id": TWITCH_CLIENT_ID,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def save_signal(
    title: str, url: str, score: int, comments_count: int, game_id: str, viewer_count: int, stream_count: int, tags: list
) -> bool:
    """Save a Twitch category as a raw_signal."""
    if not title:
        return False
    data = {
        "source": "twitch",
        "source_type": "creator",
        "title": title[:500],
        "url": url,
        "score": score,
        "content": None,
        "comments_count": comments_count,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "platform_data": {
            "game_id": game_id,
            "viewer_count": viewer_count,
            "stream_count": stream_count,
            "tags": tags[:10],
        },
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


def scrape_top_categories(token: str) -> int:
    """Scrape top Twitch categories by viewer count."""
    saved = 0
    try:
        data = twitch_get(token, "/games/top", {"first": MAX_CATEGORIES})
        categories = data.get("data", [])
        print(f"  Found {len(categories)} top categories")
        for cat in categories:
            name = cat.get("name", "")
            game_id = cat.get("id", "")
            # URL-encode the game name for Twitch directory link
            slug = name.replace(" ", "%20").replace("&", "%26")
            url = f"https://www.twitch.tv/directory/game/{slug}"
            if save_signal(name, url, 1, 0, game_id, 0, 0, []):
                saved += 1
        print(f"  Top categories: {saved} saved")
    except Exception as e:
        print(f"  Error fetching top categories: {e}")
    return saved


def scrape_live_streams_by_category(token: str) -> int:
    """Fetch live streams and aggregate viewer+stream count per game."""
    saved = 0
    try:
        # Fetch a sample of live streams (first 100)
        data = twitch_get(token, "/streams", {"first": 100})
        streams = data.get("data", [])

        # Aggregate by game_id
        game_agg: dict[str, dict] = {}
        for stream in streams:
            gid = stream.get("game_id", "")
            gname = stream.get("game_name", "")
            viewers = stream.get("viewer_count", 0)
            tags = stream.get("tags", [])
            if not gid or not gname:
                continue
            if gid not in game_agg:
                game_agg[gid] = {
                    "name": gname,
                    "viewer_count": 0,
                    "stream_count": 0,
                    "tags": tags,
                }
            game_agg[gid]["viewer_count"] += viewers
            game_agg[gid]["stream_count"] += 1

        for gid, agg in game_agg.items():
            name = agg["name"]
            viewer_count = agg["viewer_count"]
            stream_count = agg["stream_count"]
            slug = name.replace(" ", "%20").replace("&", "%26")
            url = f"https://www.twitch.tv/directory/game/{slug}"
            # Score = viewer_count // 100 (similar scale to other sources)
            score = max(1, viewer_count // 100)
            if save_signal(name, url, score, stream_count, gid, viewer_count, stream_count, agg["tags"]):
                saved += 1

        print(f"  Live stream aggregates: {saved} categories saved")
    except Exception as e:
        print(f"  Error fetching live streams: {e}")
    return saved


def main():
    saved_count = 0
    error = None
    try:
        if not TWITCH_CLIENT_ID or not TWITCH_CLIENT_SECRET:
            raise ValueError(
                "TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not set — add as GitHub Actions secrets"
            )

        print("Authenticating with Twitch...")
        token = get_twitch_token()
        print("Token obtained. Scraping...")

        saved_count += scrape_top_categories(token)
        time.sleep(0.5)
        saved_count += scrape_live_streams_by_category(token)

        print(f"\nTwitch scraping complete. Saved {saved_count} items.")
    except Exception as e:
        error = e
        print(f"Scraper error: {e}")
    finally:
        update_scraper_health(
            "twitch", success=(error is None), signal_count=saved_count, error=error
        )


if __name__ == "__main__":
    main()
