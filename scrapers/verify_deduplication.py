import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

response = supabase.table('signal_duplicates').select('*').limit(10).execute()
duplicates = response.data

print(f"=== Verification ===")
print(f"Total duplicate relationships saved: {len(duplicates)}")

if duplicates:
    print(f"\nFirst 5 duplicate relationships:")
    for dup in duplicates[:5]:
        print(f"  - Canonical: {dup['canonical_signal_id'][:8]}... → Duplicate: {dup['duplicate_signal_id'][:8]}...")
        print(f"    Type: {dup['match_type']}, Similarity: {dup['similarity_score']:.2f}")

if duplicates:
    first = duplicates[0]
    canonical_id = first['canonical_signal_id']
    duplicate_id = first['duplicate_signal_id']

    canonical = supabase.table('raw_signals').select('*').eq('id', canonical_id).single().execute()
    duplicate = supabase.table('raw_signals').select('*').eq('id', duplicate_id).single().execute()

    print(f"\n=== Example Duplicate Match ===")
    print(f"CANONICAL (kept):")
    print(f"  Title: {canonical.data['title']}")
    print(f"  URL: {canonical.data['url']}")
    print(f"  Score: {canonical.data.get('score', 0)}, Comments: {canonical.data.get('comments_count', 0)}")

    print(f"\nDUPLICATE (flagged):")
    print(f"  Title: {duplicate.data['title']}")
    print(f"  URL: {duplicate.data['url']}")
    print(f"  Score: {duplicate.data.get('score', 0)}, Comments: {duplicate.data.get('comments_count', 0)}")

    print(f"\nMatch type: {first['match_type']}")
