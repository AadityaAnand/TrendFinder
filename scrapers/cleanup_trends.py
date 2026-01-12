import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def cleanup_trends():
    print("Cleaning up old trends and explanations...")

    try:
        result = supabase.table('trend_explanations').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        print(f"✓ Deleted trend explanations")

        result = supabase.table('detected_trends').delete().neq('id', '00000000-0000-0000-0000-000000000000').execute()
        print(f"✓ Deleted detected trends")

        print("\n✓ Cleanup complete! Ready to regenerate fresh trends.")

    except Exception as e:
        print(f"Error during cleanup: {e}")

if __name__ == "__main__":
    cleanup_trends()
