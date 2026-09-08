# Keeris - ERR Radio Music & Episode Archive

Keeris is a standalone Curator miniapp for scraping, indexing, deduplicating, and exploring music airings and episodes across ERR radio broadcasts (Vikerraadio, Klassikaraadio).

## Architecture

- **Domain Archive Database** (`data/keeris.db`): Stores extracted episodes, tracklists, play counts, and unique song deduplication records.
- **Workflow & Agent Database** (`data/curator.db`): Tracks Curator `Request`, `Response`, `Conversation`, `Script`, and `Agent` records managed by `CuratorRequestProcessor`.
- **Agent Scheduling**: Uses **[Bree](https://github.com/breejs/bree)** (`ScheduledAgentScheduler`) to run recurring agent tasks using either 5-field cron syntax or human-readable interval strings.

## Agent Scheduling Formats

Agent schedules support both Bree-compatible syntaxes:

- **Cron Expressions**: `0 * * * *` (hourly), `*/10 * * * *` (every 10 minutes), `0 0 * * *` (daily).
- **Text Intervals**: `every 10 minutes`, `every 1 hour`, `at 8:00 am`.

For full documentation on schedule patterns, see:
- [Bree Documentation](https://github.com/breejs/bree)
- [Bree Official Website](https://jobscheduler.net/)
- [@breejs/later Syntax Guide](https://github.com/breejs/later)

## Commands

```powershell
# Run the local web app & API
node src/server/index.js

# View archive stats
node src/cli.js stats

# List registered agents & schedules
node src/cli.js agents
```

## Docker Deployment

Build and start the standalone container with persistent storage:

```powershell
# Build and run with Docker Compose
npm run docker:up

# View real-time logs
npm run docker:logs

# Stop container
npm run docker:down
```

Or using standard Docker CLI:

```powershell
# Build container from repo root
docker build -t keeris -f miniapps/keeris/Dockerfile .

# Run with persistent volume
docker run -d -p 4000:4000 -v keeris-data:/app/data --name keeris-app keeris
```
