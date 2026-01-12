import requests
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
import time

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
HN_API_URL = "https://hacker-news.firebaseio.com/v0"

def fetch_top_story_ids(limit=30):
    url = f"{HN_API_URL}/topstories.json"
    try:
        response = requests.get(url)
        story_ids = response.json()
        return story_ids[:limit]
    except Exception as e:
        print(f"Error fetching top story IDs: {e}")
        return []

def fetch_story_details(story_id):
    url = f"{HN_API_URL}/item/{story_id}.json"
    try:
        response = requests.get(url)
        story = response.json()
        time.sleep(0.1)
        return story
    except Exception as e:
        print(f"Error fetching story details for ID {story_id}: {e}")
        return None

def is_recent(timestamp, days=7):
    story_date = datetime.fromtimestamp(timestamp)
    cutoff_date = datetime.now() - timedelta(days=days)
    return story_date >= cutoff_date

def save_to_supabase(story):
    title = story.get("title", "")
    url = story.get("url", "")
    score = story.get("score", 0)
    comments_count = story.get("descendants", 0)
    timestamp = story.get("time", 0)

    data = {
        'source': 'hackernews',
        'title': title,
        'url': url,
        'score': score,
        'content': None,
        'comments_count': comments_count,
        'created_at': datetime.fromtimestamp(timestamp).isoformat()
    }
    try:
        supabase.table('raw_signals').insert(data).execute()
        return True
    except Exception as e:
        print(f"Error saving story to Supabase: {e}")
        return False
def main():
    top_story_ids = fetch_top_story_ids()
    print(f"Found {len(top_story_ids)} stories to process")

    saved_count = 0

    for story_id in top_story_ids:
        story = fetch_story_details(story_id)

        if not story:
            continue

        if 'time' not in story:
            continue

        if not is_recent(story.get("time", 0)):
            continue

        if save_to_supabase(story):
            saved_count += 1
            print(f"Saved: {story.get('title', 'Untitled')[:60]}...")

    print(f"\nScraping complete! Saved {saved_count} stories to Supabase")

if __name__ == "__main__":
    main()