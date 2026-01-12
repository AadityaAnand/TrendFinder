import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=== Applying Migration ===\n")

with open('scrapers/migrations/create_trend_evidence_tables.sql', 'r') as f:
    sql = f.read()

statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('COMMENT')]

for i, statement in enumerate(statements, 1):
    if not statement:
        continue

    print(f"{i}. Executing: {statement[:80]}...")
    try:
        result = supabase.rpc('exec_sql', {'query': statement}).execute()
        print(f"   ✓ Success")
    except Exception as e:
        error_str = str(e).lower()
        if 'already exists' in error_str or 'duplicate' in error_str:
            print(f"   ⊙ Already exists (skipping)")
        else:
            print(f"   ✗ Error: {e}")

print("\n=== Migration Complete ===")
