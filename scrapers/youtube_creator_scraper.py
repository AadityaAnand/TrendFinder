"""
YouTube Creator Scraper — trending videos by category.
Needs: YOUTUBE_API_KEY env var (YouTube Data API v3, free tier, 10k units/day).
"""
import os
import time
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import requests
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

# Categories most relevant to the creator economy
CREATOR_CATEGORIES = [
    ("24", "Entertainment"),
    ("26", "Howto & Style"),
    ("22", "People & Blogs"),
    ("20", "Gaming"),
    ("10", "Music"),
]

MAX_RESULTS_PER_CATEGORY = 25


def fetch_trending_videos(category_id: str) -> list[dict]:
    """Fetch most popular videos for a category."""
    try:
        resp = requests.get(
            f"{YOUTUBE_API_BASE}/videos",
            params={
                "part": "snippet,statistics",
                "chart": "mostPopular",
                "regionCode": "US",
                "videoCategoryId": category_id,
                "maxResults": MAX_RESULTS_PER_CATEGORY,
                "key": YOUTUBE_API_KEY,
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("items", [])
    except Exception as e:
        print(f"  Error fetching category {category_id}: {e}")
        return []


def fetch_recent_trending(days_back: int = 7) -> list[dict]:
    """Search for recently uploaded trending videos across creator niches."""
    published_after = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    search_queries = [
        "creator economy tips",
        "how to grow on youtube",
        "content creation tutorial",
        "youtube strategy",
        "newsletter growth",
    ]
    results = []
    for q in search_queries[:2]:  # limit to save quota
        try:
            resp = requests.get(
                f"{YOUTUBE_API_BASE}/search",
                params={
                    "part": "snippet",
                    "type": "video",
                    "order": "viewCount",
                    "publishedAfter": published_after,
                    "q": q,
                    "maxResults": 10,
                    "key": YOUTUBE_API_KEY,
                },
                timeout=15,
            )
            resp.raise_for_status()
            results.extend(resp.json().get("items", []))
            time.sleep(0.3)
        except Exception as e:
            print(f"  Error in search query '{q}': {e}")
    return results


def save_video(video: dict, category_name: str = "") -> bool:
    """Save a YouTube video as a raw_signal."""
    snippet = video.get("snippet", {})
    stats = video.get("statistics", {})

    video_id = video.get("id")
    if isinstance(video_id, dict):
        video_id = video_id.get("videoId", "")

    if not video_id:
        return False

    title = snippet.get("title", "")
    url = f"https://www.youtube.com/watch?v={video_id}"
    view_count = int(stats.get("viewCount", 0)) if stats else 0
    comment_count = int(stats.get("commentCount", 0)) if stats else 0
    like_count = int(stats.get("likeCount", 0)) if stats else 0
    published_at = snippet.get("publishedAt", datetime.now(timezone.utc).isoformat())

    # Normalize score to a manageable int (views in thousands)
    score = max(1, view_count // 1000)

    tags = snippet.get("tags", [])[:10]  # cap tags list

    data = {
        "source": "youtube_creator",
        "source_type": "creator",
        "title": title[:500],
        "url": url,
        "score": score,
        "content": None,
        "comments_count": comment_count,
        "created_at": published_at,
        "platform_data": {
            "category": category_name,
            "tags": tags,
            "like_count": like_count,
            "view_count": view_count,
            "channel_title": snippet.get("channelTitle", ""),
        },
    }

    try:
        supabase.table("raw_signals").insert(data).execute()
        return True
    except Exception as e:
        err = str(e).lower()
        if "duplicate" in err or "unique" in err:
            return False
        print(f"  Error saving video '{title[:60]}': {e}")
        return False


def main():
    saved_count = 0
    error = None
    try:
        if not YOUTUBE_API_KEY:
            raise ValueError("YOUTUBE_API_KEY not set — add it as a GitHub Actions secret")

        print("Fetching trending videos by creator category...")
        seen_ids: set[str] = set()

        for category_id, category_name in CREATOR_CATEGORIES:
            print(f"  Category: {category_name}")
            videos = fetch_trending_videos(category_id)
            for video in videos:
                vid_id = video.get("id", "")
                if vid_id in seen_ids:
                    continue
                seen_ids.add(vid_id)
                if save_video(video, category_name):
                    saved_count += 1
            time.sleep(0.2)

        print("Fetching recent creator-focused search results...")
        search_results = fetch_recent_trending()
        for video in search_results:
            vid_id = video.get("id", {}).get("videoId", "")
            if vid_id and vid_id not in seen_ids:
                seen_ids.add(vid_id)
                if save_video(video, "Creator Economy"):
                    saved_count += 1
            time.sleep(0.1)

        print(f"\nYouTube Creator scraping complete. Saved {saved_count} videos.")
    except Exception as e:
        error = e
        print(f"Scraper error: {e}")
    finally:
        update_scraper_health(
            "youtube_creator",
            success=(error is None),
            signal_count=saved_count,
            error=error,
        )


if __name__ == "__main__":
    main()
