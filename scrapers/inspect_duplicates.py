import os
from dotenv import load_dotenv
from supabase import create_client, Client
from collections import defaultdict

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

response = supabase.table('signal_duplicates').select('*').execute()
all_duplicates = response.data

canonical_groups = defaultdict(list)
for dup in all_duplicates:
    canonical_groups[dup['canonical_signal_id']].append(dup)

print(f"=== Manual Spot Check ===")
print(f"Total duplicate groups: {len(canonical_groups)}\n")

import random
sample_canonicals = random.sample(list(canonical_groups.keys()), min(5, len(canonical_groups)))

for i, canonical_id in enumerate(sample_canonicals, 1):
    group = canonical_groups[canonical_id]

    canonical = supabase.table('raw_signals').select('*').eq('id', canonical_id).single().execute()

    print(f"GROUP {i}: {len(group)} duplicates")
    print(f"CANONICAL:")
    print(f"  Title: {canonical.data['title'][:80]}...")
    print(f"  URL: {canonical.data['url']}")
    print(f"  Source: {canonical.data['source']}")
    print(f"  Score: {canonical.data.get('score', 0)}, Comments: {canonical.data.get('comments_count', 0)}")

    print(f"\n  DUPLICATES:")
    for dup in group:
        dup_signal = supabase.table('raw_signals').select('*').eq('id', dup['duplicate_signal_id']).single().execute()
        print(f"    - Title: {dup_signal.data['title'][:80]}...")
        print(f"      URL: {dup_signal.data['url']}")
        print(f"      Source: {dup_signal.data['source']}")
        print(f"      Match: {dup['match_type']} (similarity: {dup['similarity_score']:.2f})")

    print()

match_types = defaultdict(int)
for dup in all_duplicates:
    match_types[dup['match_type']] += 1

print("=== Match Type Distribution ===")
for match_type, count in match_types.items():
    print(f"{match_type}: {count} duplicates ({count/len(all_duplicates)*100:.1f}%)")
