"""
Discord Scraper — STUB.
Requires a Discord bot with access to specific public servers.
Needs: DISCORD_BOT_TOKEN + DISCORD_GUILD_IDS (comma-separated) env vars.

Setup:
1. Create a Discord bot at discord.com/developers/applications
2. Add it to target public servers (creator-focused: Midjourney, Content Creator Collab, etc.)
3. Grant READ_MESSAGE_HISTORY permission
4. Set DISCORD_BOT_TOKEN and DISCORD_GUILD_IDS as GitHub Actions secrets

Once set up:
- GET https://discord.com/api/v10/guilds/{guild_id}/channels for channel list
- GET https://discord.com/api/v10/channels/{channel_id}/messages for recent messages
- Aggregate by topic keywords, question frequency, tool mentions
"""
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from scraper_utils import update_scraper_health

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
DISCORD_GUILD_IDS = os.getenv("DISCORD_GUILD_IDS", "")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def main():
    saved_count = 0
    error = None
    try:
        if not DISCORD_BOT_TOKEN or not DISCORD_GUILD_IDS:
            raise ValueError(
                "DISCORD_BOT_TOKEN or DISCORD_GUILD_IDS not set. "
                "Create a Discord bot at discord.com/developers/applications, "
                "add it to target servers, then set DISCORD_BOT_TOKEN and "
                "DISCORD_GUILD_IDS as GitHub Actions secrets."
            )
        raise NotImplementedError(
            "Discord scraper not yet implemented. "
            "Implement using Discord REST API to read messages from joined public creator servers."
        )
    except Exception as e:
        error = e
        print(f"Discord scraper unavailable: {e}")
    finally:
        update_scraper_health(
            "discord", success=(error is None), signal_count=saved_count, error=error
        )


if __name__ == "__main__":
    main()
