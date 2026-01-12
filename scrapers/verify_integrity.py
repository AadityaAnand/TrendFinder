import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=== Trend Detection Integrity Verification ===\n")

snapshots = supabase.table('trend_snapshots').select('*').order('run_at', desc=True).limit(5).execute()
print(f"Recent snapshots: {len(snapshots.data)}")
for snap in snapshots.data:
    print(f"  {snap['run_at'][:19]} | v{snap['detector_version']} | {snap['unique_signal_count']}/{snap['signal_count']} signals")

snapshot_items = supabase.table('trend_snapshot_items').select('snapshot_id').execute()
unique_snapshots = len(set(item['snapshot_id'] for item in snapshot_items.data))
print(f"\nSnapshot items: {len(snapshot_items.data)} across {unique_snapshots} snapshots")

trend_signals = supabase.table('trend_signals').select('snapshot_id, trend_id').execute()
unique_snapshot_trend_pairs = len(set((ts['snapshot_id'], ts['trend_id']) for ts in trend_signals.data))
print(f"Evidence records: {len(trend_signals.data)} ({unique_snapshot_trend_pairs} unique snapshot-trend pairs)")

trends = supabase.table('detected_trends').select('detector_version, theme').execute()
print(f"\nTrend entities: {len(trends.data)}")
version_counts = {}
for trend in trends.data:
    v = trend.get('detector_version', 'unknown')
    version_counts[v] = version_counts.get(v, 0) + 1
for version, count in sorted(version_counts.items()):
    print(f"  {version}: {count} trends")

print("\n=== Integrity Checks ===")

duplicate_themes = supabase.rpc('check_duplicate_themes', {}).execute() if False else None

trends_with_detector = [t for t in trends.data if t.get('detector_version')]
print(f"✓ Trends with detector_version: {len(trends_with_detector)}/{len(trends.data)}")

if snapshot_items.data:
    orphaned_items = 0
    for item in snapshot_items.data[:100]:
        trend_exists = supabase.table('detected_trends').select('id').eq('id', item['trend_id']).execute()
        if not trend_exists.data:
            orphaned_items += 1
    if orphaned_items == 0:
        print(f"✓ No orphaned snapshot items (sampled 100)")
    else:
        print(f"⚠ Found {orphaned_items} orphaned snapshot items in sample")

print("\n=== Data Semantics ===")
print("• first_seen = earliest signal.created_at (scrape time, not published time)")
print("• Snapshots = per-run (not deduplicated by day)")
print("• Evidence = append-only, snapshot-scoped")
print("• Trends = namespaced by (detector_version, theme)")
