"""
Spotify Scraper — featured playlists, podcast trends, new releases.
Needs: SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET env vars.
Uses client credentials OAuth (no user login required).
"""
import os
import time
from datetime import datetime, timezone
from base64 import b64encode
from dotenv import load_dotenv
from supabase import create_client, Client
import requests
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

SPOTIFY_API_BASE = "https://api.spotify.com/v1"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"


def get_spotify_token() -> str:
    """Get access token via client credentials flow."""
    credentials = b64encode(
        f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()
    ).decode()
    resp = requests.post(
        SPOTIFY_TOKEN_URL,
        data={"grant_type": "client_credentials"},
        headers={"Authorization": f"Basic {credentials}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def spotify_get(token: str, endpoint: str, params: dict = None) -> dict:
    """Make an authenticated Spotify API GET request."""
    resp = requests.get(
        f"{SPOTIFY_API_BASE}{endpoint}",
        params=params or {},
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def save_signal(title: str, url: str, score: int, signal_type: str, extra: dict) -> bool:
    """Save a Spotify item as a raw_signal."""
    if not title or not url:
        return False
    data = {
        "source": "spotify",
        "source_type": "creator",
        "title": title[:500],
        "url": url,
        "score": score,
        "content": None,
        "comments_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "platform_data": {"type": signal_type, **extra},
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


def scrape_featured_playlists(token: str) -> int:
    """Scrape Spotify's featured playlists."""
    saved = 0
    try:
        data = spotify_get(token, "/browse/featured-playlists", {"limit": 50, "country": "US"})
        playlists = data.get("playlists", {}).get("items", [])
        for pl in playlists:
            if not pl:
                continue
            title = pl.get("name", "")
            url = pl.get("external_urls", {}).get("spotify", "")
            followers = pl.get("followers", {}).get("total", 0) if pl.get("followers") else 0
            score = max(1, followers // 1000) if followers else 1
            desc = pl.get("description", "")
            if save_signal(title, url, score, "featured_playlist", {"description": desc[:200]}):
                saved += 1
        print(f"  Featured playlists: {saved} saved")
    except Exception as e:
        print(f"  Error fetching featured playlists: {e}")
    return saved


def scrape_podcast_trends(token: str) -> int:
    """Scrape trending podcast playlists."""
    saved = 0
    try:
        data = spotify_get(
            token,
            "/browse/categories/podcasts/playlists",
            {"limit": 50, "country": "US"},
        )
        playlists = data.get("playlists", {}).get("items", [])
        for pl in playlists:
            if not pl:
                continue
            title = pl.get("name", "")
            url = pl.get("external_urls", {}).get("spotify", "")
            if save_signal(title, url, 1, "podcast_playlist", {}):
                saved += 1
        print(f"  Podcast playlists: {saved} saved")
    except Exception as e:
        print(f"  Error fetching podcast trends: {e}")
    return saved


def scrape_new_releases(token: str) -> int:
    """Scrape new album/EP releases."""
    saved = 0
    try:
        data = spotify_get(token, "/browse/new-releases", {"limit": 50, "country": "US"})
        albums = data.get("albums", {}).get("items", [])
        for album in albums:
            if not album:
                continue
            title = album.get("name", "")
            artists = ", ".join(a.get("name", "") for a in album.get("artists", [])[:3])
            display = f"{title} — {artists}" if artists else title
            url = album.get("external_urls", {}).get("spotify", "")
            total_tracks = album.get("total_tracks", 0)
            if save_signal(
                display,
                url,
                total_tracks,
                "new_release",
                {"album_type": album.get("album_type", ""), "artists": artists},
            ):
                saved += 1
        print(f"  New releases: {saved} saved")
    except Exception as e:
        print(f"  Error fetching new releases: {e}")
    return saved


def main():
    saved_count = 0
    error = None
    try:
        if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
            raise ValueError(
                "SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not set — add as GitHub Actions secrets"
            )

        print("Authenticating with Spotify...")
        token = get_spotify_token()
        print("Token obtained. Scraping...")

        saved_count += scrape_featured_playlists(token)
        time.sleep(0.5)
        saved_count += scrape_podcast_trends(token)
        time.sleep(0.5)
        saved_count += scrape_new_releases(token)

        print(f"\nSpotify scraping complete. Saved {saved_count} items.")
    except Exception as e:
        error = e
        print(f"Scraper error: {e}")
    finally:
        update_scraper_health(
            "spotify", success=(error is None), signal_count=saved_count, error=error
        )


if __name__ == "__main__":
    main()
