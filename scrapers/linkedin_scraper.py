"""
LinkedIn Scraper — STUB.
Requires LinkedIn Marketing Developer Program access.
Needs: LINKEDIN_ACCESS_TOKEN env var (OAuth 2.0 with r_organization_social scope).

Once approved:
- GET https://api.linkedin.com/v2/shares for trending organic posts
- GET https://api.linkedin.com/v2/socialActions/{shareUrn}/comments for engagement
- Filter by reaction_count + comment_count velocity
- Collect: title (first 150 chars), author, commentary, created_at, reaction_count, comment_count
"""
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
LINKEDIN_ACCESS_TOKEN = os.getenv("LINKEDIN_ACCESS_TOKEN")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def main():
    saved_count = 0
    error = None
    try:
        if not LINKEDIN_ACCESS_TOKEN:
            raise ValueError(
                "LINKEDIN_ACCESS_TOKEN not set. "
                "Apply for LinkedIn Marketing Developer Program at linkedin.com/developers, "
                "then add LINKEDIN_ACCESS_TOKEN as a GitHub Actions secret."
            )
        raise NotImplementedError(
            "LinkedIn scraper not yet implemented. "
            "Implement using the LinkedIn Shares API once Marketing Developer Program access is approved."
        )
    except Exception as e:
        error = e
        print(f"LinkedIn scraper unavailable: {e}")
    finally:
        update_scraper_health(
            "linkedin", success=(error is None), signal_count=saved_count, error=error
        )


if __name__ == "__main__":
    main()
