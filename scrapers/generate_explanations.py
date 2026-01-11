import os
from dotenv import load_dotenv
from supabase import create_client, Client
from groq import Groq

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)

def fetch_detected_trends():
    """Fetch all detected trends from database"""
    try:
        response = supabase.table('detected_trends').select('*').order('momentum_score', desc=True).execute()
        return response.data
    except Exception as e:
        print(f"Error fetching trends: {e}")
        return []

def generate_explanation(trend):
    """Generate AI explanation for a trend using Groq"""
    theme = trend.get('theme', 'Unknown')
    signal_count = trend.get('signal_count', 0)
    momentum_score = trend.get('momentum_score', 0)

    prompt = f"""You are a trend analyst. Analyze this emerging trend:

Theme: {theme}
Number of signals: {signal_count}
Momentum score: {momentum_score:.2f}

Provide a concise analysis (2-3 sentences) covering:
1. What this trend represents
2. Why it's gaining momentum
3. What opportunity it presents for developers/creators

Be specific and actionable."""

    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=200
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        print(f"Error generating explanation: {e}")
        return f"Emerging trend in {theme} with {signal_count} signals and momentum score of {momentum_score:.2f}. This indicates growing interest in the developer community."

def save_explanation(trend_id, explanation):
    """Save explanation to trend_explanations table"""
    data = {
        'trend_id': trend_id,
        'explanation': explanation
    }

    try:
        supabase.table('trend_explanations').insert(data).execute()
        return True
    except Exception as e:
        print(f"Error saving explanation: {e}")
        return False

def main():
    print("Fetching detected trends...")
    trends = fetch_detected_trends()
    print(f"Found {len(trends)} trends to explain")

    if not trends:
        print("No trends found. Run trend_detector.py first!")
        return

    explained_count = 0

    for trend in trends:
        theme = trend.get('theme', 'Unknown')
        trend_id = trend.get('id')

        print(f"\nGenerating explanation for: {theme}")
        explanation = generate_explanation(trend)

        if save_explanation(trend_id, explanation):
            explained_count += 1
            print(f"✓ Saved explanation for '{theme}'")
            print(f"  {explanation[:100]}...")
        else:
            print(f"✗ Failed to save explanation for '{theme}'")

    print(f"\n✓ Generated and saved {explained_count} explanations")

if __name__ == "__main__":
    main()
