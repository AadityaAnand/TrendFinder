import os
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from scraper_utils import update_scraper_health
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_trending_repos():
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    url = "https://api.github.com/search/repositories"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    params = {
        "q": f"created:>{seven_days_ago}",
        "sort": "stars",
        "order": "desc",
        "per_page": 30
    }
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        return response.json().get('items', [])
    except Exception as e:
        print(f"Error fetching repositories: {e}")
        return []

def save_to_supabase(repo):
    data = {
        'source': 'github',
        'title': repo.get('name', 'Untitled'),
        'url': repo.get('html_url', ''),
        'score': repo.get('stargazers_count', 0),
        'comments_count': repo.get('open_issues_count', 0),
        'created_at': repo.get('created_at', datetime.now().isoformat())
    }

    try:
        supabase.table('raw_signals').insert(data).execute()
        return True
    except Exception as e:
        return False
def main():
    saved_count = 0
    error = None
    try:
        repos = fetch_trending_repos()
        print(f"Found {len(repos)} repositories to process")

        if not repos:
            print("No repositories found!")

        for repo in repos:
            if save_to_supabase(repo):
                saved_count += 1
                print(f"Saved: {repo.get('full_name', 'Untitled')[:60]}... ({repo.get('stargazers_count', 0)})")

        print(f"\nScraping complete! Saved {saved_count} repositories to Supabase")
    except Exception as e:
        error = e
        print(f"Scraper error: {e}")
    finally:
        update_scraper_health('github', success=(error is None), signal_count=saved_count, error=error)

if __name__ == "__main__":
    main()
