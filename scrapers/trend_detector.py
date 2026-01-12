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

DETECTOR_VERSION = 'keyword-scaffold-v1'
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


THEME_CLUSTERS = {
    'AI & Machine Learning': ['ai', 'llm', 'llms', 'model', 'models', 'machine', 'learning', 'gpt', 'claude', 'openai', 'anthropic', 'chatgpt', 'gemini', 'embedding', 'embeddings'],
    'Development Tools': ['code', 'coding', 'development', 'developer', 'developers', 'programming', 'framework', 'frameworks', 'library', 'libraries', 'tool', 'tools'],
    'Web & APIs': ['api', 'apis', 'web', 'http', 'rest', 'graphql', 'endpoint', 'endpoints'],
    'Data & Analytics': ['data', 'analytics', 'database', 'databases', 'sql', 'analysis', 'visualization'],
    'Cloud & Infrastructure': ['cloud', 'aws', 'azure', 'docker', 'kubernetes', 'infrastructure', 'deployment'],
    'Mobile': ['mobile', 'ios', 'android', 'app', 'apps', 'application', 'applications']
}

def map_keyword_to_theme(keyword):
    for theme, keywords in THEME_CLUSTERS.items():
        if keyword in keywords:
            return theme
    return None

def extract_keywords(text):
    cleaned = re.sub(r'[^a-z0-9\s]', '', text.lower())
    words = cleaned.split()
    keywords = [word for word in words if len(word) > 2 and word not in STOP_WORDS]
    return keywords

def fetch_duplicate_ids():
    try:
        response = supabase.table('signal_duplicates').select('duplicate_signal_id').execute()
        return set(d['duplicate_signal_id'] for d in response.data)
    except Exception as e:
        print(f"Error fetching duplicates: {e}")
        return set()

def fetch_all_signals():
    try:
        response = supabase.table('raw_signals').select('*').order('created_at', desc=True).execute()
        return response.data
    except Exception as e:
        print(f"Error fetching signals: {e}")
        return []

def group_signals_into_trends(signals, duplicate_ids):
    unique_signals = [s for s in signals if s['id'] not in duplicate_ids]

    signal_keywords = {}
    for signal in unique_signals:
        signal_id = signal['id']
        title = signal.get('title', '')
        keywords = extract_keywords(title)
        if keywords:
            signal_keywords[signal_id] = keywords

    theme_signals = {}
    for signal_id, keywords in signal_keywords.items():
        for keyword in keywords:
            theme = map_keyword_to_theme(keyword)
            if theme:
                if theme not in theme_signals:
                    theme_signals[theme] = []
                theme_signals[theme].append(signal_id)

    trend_data = []
    for theme, signal_ids in theme_signals.items():
        signal_ids = list(set(signal_ids))

        if len(signal_ids) < 2:
            continue

        trend_signals = [s for s in unique_signals if s['id'] in signal_ids]
        total_score = sum(s.get('score', 0) for s in trend_signals)
        total_comments = sum(s.get('comments_count', 0) for s in trend_signals)
        signal_count = len(trend_signals)

        momentum_score = (total_score + total_comments) / signal_count

        earliest_signal = min(trend_signals, key=lambda s: s['created_at'])
        first_seen = earliest_signal['created_at']

        trend_data.append({
            'keyword': theme,
            'signal_count': signal_count,
            'momentum_score': momentum_score,
            'signal_ids': signal_ids,
            'first_seen': first_seen
        })

    trend_data.sort(key=lambda x: x['momentum_score'], reverse=True)
    return trend_data[:20]

def create_snapshot(signal_count, unique_signal_count, duplicate_count):
    try:
        snapshot_data = {
            'signal_count': signal_count,
            'unique_signal_count': unique_signal_count,
            'duplicate_count': duplicate_count,
            'detector_version': DETECTOR_VERSION
        }
        result = supabase.table('trend_snapshots').insert(snapshot_data).execute()
        return result.data[0]['id']
    except Exception as e:
        print(f"Error creating snapshot: {e}")
        return None

def save_trends_to_db(trends, snapshot_id):
    saved_count = 0
    for trend in trends:
        try:
            existing = supabase.table('detected_trends').select('*').eq('detector_version', DETECTOR_VERSION).eq('theme', trend['keyword']).execute()

            if existing.data:
                existing_trend = existing.data[0]
                update_data = {
                    'last_updated': datetime.now().isoformat(),
                    'status': 'emerging'
                }
                supabase.table('detected_trends').update(update_data).eq('id', existing_trend['id']).execute()
                trend_id = existing_trend['id']
            else:
                insert_data = {
                    'theme': trend['keyword'],
                    'keywords': [trend['keyword']],
                    'first_seen': trend['first_seen'],
                    'last_updated': datetime.now().isoformat(),
                    'detector_version': DETECTOR_VERSION,
                    'status': 'emerging'
                }
                result = supabase.table('detected_trends').insert(insert_data).execute()
                trend_id = result.data[0]['id']

            save_trend_snapshot_item(snapshot_id, trend_id, trend['momentum_score'], trend['signal_count'])
            save_trend_evidence(snapshot_id, trend_id, trend['signal_ids'])
            saved_count += 1
        except Exception as e:
            print(f"Error saving trend '{trend['keyword']}': {e}")
    print(f"Saved {saved_count} trends to the database.")
    return saved_count

def save_trend_snapshot_item(snapshot_id, trend_id, momentum_score, signal_count):
    try:
        item_data = {
            'snapshot_id': snapshot_id,
            'trend_id': trend_id,
            'momentum_score': momentum_score,
            'signal_count': signal_count
        }
        supabase.table('trend_snapshot_items').insert(item_data).execute()
    except Exception as e:
        error_str = str(e).lower()
        if 'duplicate' in error_str or 'unique' in error_str:
            return
        print(f"Error saving snapshot item for trend {trend_id}: {e}")
        raise

def save_trend_evidence(snapshot_id, trend_id, signal_ids):
    try:
        evidence_data = [{'snapshot_id': snapshot_id, 'trend_id': trend_id, 'signal_id': signal_id} for signal_id in signal_ids]
        if evidence_data:
            supabase.table('trend_signals').insert(evidence_data).execute()
    except Exception as e:
        error_str = str(e).lower()
        if 'duplicate' in error_str or 'unique' in error_str:
            return
        print(f"Error saving evidence for trend {trend_id}: {e}")
        raise


def main():
    print("Fetching signals from database...")
    signals = fetch_all_signals()
    print(f"Found {len(signals)} total signals")

    if not signals:
        print("No signals found. Run the scraper first!")
        return

    print("Fetching duplicates...")
    duplicate_ids = fetch_duplicate_ids()
    duplicate_count = len(duplicate_ids)
    unique_signal_count = len([s for s in signals if s['id'] not in duplicate_ids])

    print(f"Found {duplicate_count} duplicate signals")
    print(f"Unique signals: {unique_signal_count}")

    print("\nCreating snapshot...")
    snapshot_id = create_snapshot(len(signals), unique_signal_count, duplicate_count)
    if not snapshot_id:
        print("Failed to create snapshot. Aborting.")
        return

    print("\nDetecting trends...")
    trends = group_signals_into_trends(signals, duplicate_ids)

    print(f"\nDetected {len(trends)} trends")

    saved_count = save_trends_to_db(trends, snapshot_id)

    print(f"\nTop trends:")
    for i, trend in enumerate(trends, 1):
        print(f"{i}. '{trend['keyword']}' - Signals: {trend['signal_count']}, Score: {trend['momentum_score']:.2f}")

if __name__ == "__main__":
    main()

  