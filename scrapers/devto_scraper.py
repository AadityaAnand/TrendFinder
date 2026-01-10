import os
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
import re

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_devto_articles():
    url = "https://dev.to/api/articles?top=7"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching articles: {e}")
        return []

def is_recent(published_timestamp):
    try:
        published_date = datetime.fromisoformat(published_timestamp.replace("Z", "+00:00"))
        seven_days_ago = datetime.now(published_date.tzinfo) - timedelta(days=7)
        return published_date >= seven_days_ago
    except Exception as e:
        print(f"Error parsing date: {e}")
        return False

def save_to_supabase(article):
    data = {
        'source': 'devto',
        'title': article.get('title', 'Untitled'),
        'url': article.get('url', ''),
        'score': article.get('public_reactions_count', 0),
        'comments_count': article.get('comments_count', 0),
        'created_at': article.get('published_at', datetime.now().isoformat())
    }

    try:
        supabase.table('raw_signals').insert(data).execute()
        return True
    except Exception as e:
        print(f"Error saving article to Supabase: {e}")
        return False

def main():
    print("Fetching Dev.to articles...")
    articles = fetch_devto_articles()
    print(f"Found {len(articles)} articles to process")

    if not articles:
        print("No articles found!")
        return

    saved_count = 0

    for article in articles:
        if 'published_at' not in article:
            continue

        if not is_recent(article.get('published_at', '')):
            continue

        if save_to_supabase(article):
            saved_count += 1
            print(f"Saved: {article.get('title', 'Untitled')[:60]}...")

    print(f"\nScraping complete! Saved {saved_count} articles to Supabase")

if __name__ == "__main__":
    main()