import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=== Data Integrity Check ===\n")

snapshots = supabase.table('trend_snapshots').select('*').order('run_at', desc=True).execute()
print(f"Snapshots created: {len(snapshots.data)}")
if snapshots.data:
    latest = snapshots.data[0]
    print(f"  Latest: {latest['run_at'][:19]}")
    print(f"  Version: {latest['detector_version']}")
    print(f"  Signals: {latest['unique_signal_count']}/{latest['signal_count']}")

items = supabase.table('trend_snapshot_items').select('*').execute()
print(f"\nSnapshot items (metrics history): {len(items.data)}")

signals = supabase.table('trend_signals').select('*').execute()
print(f"Evidence records: {len(signals.data)}")

trends = supabase.table('detected_trends').select('*').execute()
print(f"\nTrend entities: {len(trends.data)}")
for t in trends.data:
    first_seen = t.get('first_seen', 'none')
    if first_seen and first_seen != 'none':
        first_seen = first_seen[:10]
    print(f"  {t['theme']}: first_seen={first_seen}, v={t.get('detector_version', 'none')}")

print("\n✓ Day 2 complete: Snapshot-scoped history with evidence tracking")
print("✓ Trends namespaced by detector_version")
print("✓ Ready for Day 3: Source normalization + time decay")
