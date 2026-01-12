import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=== Testing Snapshot Flow ===\n")

print("1. Checking table existence...")
try:
    snapshots = supabase.table('trend_snapshots').select('id').limit(1).execute()
    print("  ✓ trend_snapshots exists")
except Exception as e:
    print(f"  ✗ trend_snapshots missing: {e}")

try:
    items = supabase.table('trend_snapshot_items').select('id').limit(1).execute()
    print("  ✓ trend_snapshot_items exists")
except Exception as e:
    print(f"  ✗ trend_snapshot_items missing: {e}")

try:
    signals = supabase.table('trend_signals').select('id').limit(1).execute()
    print("  ✓ trend_signals exists")
except Exception as e:
    print(f"  ✗ trend_signals missing: {e}")

print("\n2. Checking detected_trends schema...")
try:
    trends = supabase.table('detected_trends').select('detector_version').limit(1).execute()
    print("  ✓ detector_version column exists")
except Exception as e:
    print(f"  ✗ detector_version column missing: {e}")

print("\n3. Testing foreign key constraints...")
try:
    fake_snapshot_id = '00000000-0000-0000-0000-000000000001'
    fake_trend_id = '00000000-0000-0000-0000-000000000002'

    try:
        supabase.table('trend_snapshot_items').insert({
            'snapshot_id': fake_snapshot_id,
            'trend_id': fake_trend_id,
            'momentum_score': 100,
            'signal_count': 5
        }).execute()
        print("  ✗ Foreign key constraint NOT enforced (should have failed)")
    except Exception as e:
        if 'foreign key' in str(e).lower() or 'violates' in str(e).lower():
            print("  ✓ Foreign key constraint working")
        else:
            print(f"  ? Unexpected error: {e}")
except Exception as e:
    print(f"  ? Test failed: {e}")

print("\n4. Testing unique constraints...")
try:
    real_snapshots = supabase.table('trend_snapshots').select('id').limit(1).execute()
    if real_snapshots.data:
        snapshot_id = real_snapshots.data[0]['id']

        real_trends = supabase.table('detected_trends').select('id').limit(1).execute()
        if real_trends.data:
            trend_id = real_trends.data[0]['id']

            supabase.table('trend_snapshot_items').insert({
                'snapshot_id': snapshot_id,
                'trend_id': trend_id,
                'momentum_score': 99,
                'signal_count': 3
            }).execute()

            try:
                supabase.table('trend_snapshot_items').insert({
                    'snapshot_id': snapshot_id,
                    'trend_id': trend_id,
                    'momentum_score': 88,
                    'signal_count': 2
                }).execute()
                print("  ✗ UNIQUE constraint NOT enforced (duplicate insert succeeded)")
            except Exception as e:
                if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                    print("  ✓ UNIQUE constraint working")
                else:
                    print(f"  ? Unexpected error: {e}")

            supabase.table('trend_snapshot_items').delete().eq('snapshot_id', snapshot_id).eq('trend_id', trend_id).execute()
        else:
            print("  - No trends found for UNIQUE test")
    else:
        print("  - No snapshots found for UNIQUE test")
except Exception as e:
    print(f"  ? Test failed: {e}")

print("\n5. Testing index existence...")
try:
    result = supabase.rpc('check_index_exists', {'index_name': 'idx_detected_trends_version_theme'}).execute() if False else None
    print("  - Index check requires custom RPC (skipping)")
except:
    print("  - Index check requires custom RPC (skipping)")

print("\n=== Test Complete ===")
print("If all checks passed, migration is ready.")
print("Run: python scrapers/trend_detector.py")
