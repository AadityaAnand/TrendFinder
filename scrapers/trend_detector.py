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
    'why', 'how', 'show', 'hn', 'ask', 'just', 'its', 'over', 'your', 'about', 'like', 'now', 'here', 'there',
    'then', 'than', 'them', 'their', 'into', 'out', 'all', 'some', 'any',
    'other', 'more', 'most', 'such', 'very', 'much', 'each', 'every',
    'both', 'few', 'many', 'says', 'said', 'make', 'made', 'get', 'got',
    'one', 'two', 'first', 'last', 'new', 'old', 'good', 'bad'}

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
            if keyword_counts[keyword] >= 3:
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
    quality_trends = [t for t in trend_data if t['momentum_score'] > 50]
    return quality_trends[:20]

def save_trends_to_db(trends):
    saved_count = 0
    for trend in trends:
        data = {
            'theme': trend['keyword'],
            'keywords': [trend['keyword']],
            'momentum_score': trend['momentum_score'],
            'signal_count': trend['signal_count'],
            'first_seen': datetime.now().isoformat(),
            'status': 'emerging'
        }
        try:
            supabase.table('detected_trends').insert(data).execute()
            saved_count += 1
        except Exception as e:
            print(f"Error saving trend '{trend['keyword']}': {e}")
    print(f"Saved {saved_count} trends to the database.")
    return saved_count


def main():
    print("Fetching signals from database...")
    signals = fetch_all_signals()
    print(f"Found {len(signals)} signals")

    if not signals:
        print("No signals found. Run the scraper first!")
        return

    print("\nDetecting trends...")
    trends = group_signals_into_trends(signals)

    print(f"\nDetected {len(trends)} trends")

    # Save to database
    saved_count = save_trends_to_db(trends)

    # Print for verification
    print(f"\nTop trends:")
    for i, trend in enumerate(trends, 1):
        print(f"{i}. '{trend['keyword']}' - Signals: {trend['signal_count']}, Score: {trend['momentum_score']:.2f}")

if __name__ == "__main__":
    main()
