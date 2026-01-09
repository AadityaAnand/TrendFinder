import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client
from collections import Counter
import re

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")    
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
STOP_WORDS = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
    'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where',
    'why', 'how', 'show', 'hn', 'ask'}

def extract_keywords(text):
    cleaned = re.sub(r'[^a-z0-9\s]', '', text.lower())
    words = cleaned.split()
    keywords = [word for word in words if len(word) > 2 and word not in STOP_WORDS]
    return keywords

def fetch_all_signals():
    try:
        response = supabase.table('raw_signals').select('*').order('created_at', desc=True).execute()
        return response.data
    except Exception as e:
        print(f"Error fetching signals: {e}")
        return []

def group_signals_into_trends(signals):
    signal_keywords = {}
    for signal in signals:
        signal_id = signal['id']
        title = signal.get('title', '')
        keywords = extract_keywords(title)
        if keywords:
            signal_keywords[signal_id] = keywords
    
    keyword_counts = Counter()
    for keywords in signal_keywords.values():
        keyword_counts.update(keywords)

    trends = {}
    for signal_id, keywords in signal_keywords.items():
        for keyword in keywords:
            if keyword_counts[keyword] >= 2:
                if keyword not in trends:
                    trends[keyword] = []
                trends[keyword].append(signal_id)

    trend_data = []
    for keyword, signal_ids in trends.items():
        trend_signals = [s for s in signals if s['id'] in signal_ids]
        total_score = sum(s.get('score', 0) for s in trend_signals)
        total_comments= sum(s.get('comments_count', 0) for s in trend_signals)
        signal_count = len(trend_signals)

        momentum_score = (total_score + total_comments)/signal_count
        trend_data.append({
            'keyword': keyword,
            'signal_count': signal_count,
            'momentum_score': momentum_score,
            'signal_ids': signal_ids
        })

    trend_data.sort(key=lambda x: x['momentum_score'], reverse=True)
    return trend_data

def main():
    print("Fetching signals from database...")
    signals = fetch_all_signals()
    print(f"Found {len(signals)} signals")

    if not signals:
        print("No signals found. Run the scraper first!")
        return

    print("\nDetecting trends...")
    trends = group_signals_into_trends(signals)

    print(f"\nDetected {len(trends)} trends:\n")

    for i, trend in enumerate(trends, 1):
        print(f"{i}. Keyword: '{trend['keyword']}'")
        print(f"   Signal Count: {trend['signal_count']}")
        print(f"   Momentum Score: {trend['momentum_score']:.2f}")
        print()

if __name__ == "__main__":
    main()
