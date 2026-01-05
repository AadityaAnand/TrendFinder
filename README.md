# TrendGenerator

A cross-platform trend intelligence system that detects emerging creative + human-centric market signals.

## Project Structure

```
TrendGenerator/
├── frontend/          # Next.js application
├── scrapers/          # Python data collection scripts
├── database/          # Database schema files
└── .github/workflows/ # GitHub Actions automation
```

## Setup Status

- ✅ Project structure created
- ✅ Environment files configured
- ✅ Next.js app initialized (TypeScript + Tailwind + App Router)
- ✅ Python virtual environment set up
- ✅ All dependencies installed
- ⏳ Database schema - pending creation
- ⏳ Data collection scripts - pending creation

## Development

**Frontend (Next.js)**
```bash
cd frontend
npm run dev
# Runs on http://localhost:3001
```

**Backend (Python Scrapers)**
```bash
cd scrapers
source venv/bin/activate
python your_script.py
```

## Next Steps

1. Create Supabase database schema
2. Build Hacker News scraper
3. Build Dev.to scraper
4. Create trend detection logic
5. Set up GitHub Actions for automation
