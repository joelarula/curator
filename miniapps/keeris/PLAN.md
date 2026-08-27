# Kauamangiv Node Scraper Plan

## Goal

Build a Node.js scraper that discovers every available ERR Vikerraadio **Kauamangiv** episode, extracts the published music list for each episode, and stores episodes and played music pieces in SQLite. The database must support queries such as finding every episode that played the ensemble `Keeris`.

This plan targets the archive exposed by ERR. The currently discovered series identifier is `1037846`.

## Confirmed ERR interfaces

- Archive API: `GET https://vikerraadio.err.ee/api/broadcast/broadcasts`
- Required archive parameter: `seriesContentId=1037846`
- Archive navigation:
  - initial request: `seriesContentId=1037846&radiomanUrl=`
  - older block: add `unixTime=<cursor>&previousBlock=true&limit=<n>&radiomanUrl=`
  - newer block: add `unixTime=<cursor>&next=true&limit=<n>&radiomanUrl=`
- Archive items include a stable content ID, URL, `scheduleStart`, `publicStart`, and heading.
- Episode pages contain the section `Saate muusika nimekiri`, with artist and title elements such as `.music-artist` and `.music-title`.
- A detail API is also available: `/api/radio/getRadioPageData`; use it if its response contains the same music-list data, otherwise parse the episode HTML.

The archive API currently appears to reach back to May 2017. The scraper should record that observed boundary rather than assume that older episodes exist.

## Proposed stack

- Node.js 22+ ESM modules, built-in `fetch`, and built-in `node:sqlite` (`DatabaseSync`).
- `cheerio` for parsing episode HTML when the detail response does not provide structured track data.
- `node:sqlite` avoids requiring a native compiler or `better-sqlite3` binary on Windows.
- Console logging for progress and failure records.
- Node's built-in `node:test` and `assert/strict` for tests.
- `tsx` only if TypeScript is preferred; plain JavaScript is sufficient for this scraper and keeps deployment simple.

Suggested setup:

```text
package.json
src/
  config.js
  err-client.js
  archive.js
  episode-parser.js
  db.js
  scrape.js
  cli.js
test/
  fixtures/
  archive.test.js
  episode-parser.test.js
  db.test.js
README.md
```

## Data model

Create the database with migrations or `CREATE TABLE IF NOT EXISTS` statements.

```sql
CREATE TABLE episodes (
  id INTEGER PRIMARY KEY,                 -- ERR content ID
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  scheduled_at TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  raw_hash TEXT,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error TEXT
);

CREATE TABLE tracks (
  id INTEGER PRIMARY KEY,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  artist TEXT,
  title TEXT,
  raw_text TEXT NOT NULL,
  UNIQUE (episode_id, position)
);

CREATE TABLE scrape_runs (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  archive_pages INTEGER NOT NULL DEFAULT 0,
  episodes_seen INTEGER NOT NULL DEFAULT 0,
  episodes_parsed INTEGER NOT NULL DEFAULT 0,
  tracks_saved INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX tracks_artist_idx ON tracks (artist);
CREATE INDEX episodes_scheduled_at_idx ON episodes (scheduled_at);
```

Use an upsert for episodes and replace tracks for an episode inside one transaction. This makes reruns safe and allows the parser to reflect corrected ERR metadata without creating duplicates.

## Implementation steps

1. **Initialize Node tooling**
   - Add `package.json` with `type: module`, `start`, `scrape`, `test`, and optional `lint` scripts.
   - Install `cheerio`; SQLite is provided by Node's `node:sqlite` module.
   - Add `.gitignore` entries for `node_modules/`, the SQLite database, WAL/SHM files, and logs.
   - Keep `test.py` as historical scratch material; do not use it in the scraper.

2. **Implement the ERR client**
   - Centralize the base URL, series ID, user agent, timeout, and retry policy.
   - Use `fetch` with an `AbortSignal.timeout` timeout.
   - Retry transient `429`, `5xx`, network, and timeout failures with bounded exponential backoff and jitter.
   - Respect a configurable delay between requests; default to one request per second for page scraping.
   - Return parsed JSON for API calls and UTF-8 text for episode pages.

3. **Discover all available episodes**
   - Fetch the newest archive block.
   - Follow the API's `previous` cursor until it is false or no new item is returned.
   - Store every episode's stable ID and metadata in a de-duplicating map keyed by ERR content ID.
   - Guard against cursor loops and record the oldest cursor/date reached.
   - Do not infer missing episodes from weekdays; only persist episodes actually returned by ERR.
   - Add a CLI date filter such as `--from=2017-01-01 --to=2026-12-31`, while defaulting to all returned episodes.

4. **Extract each episode's music list**
   - Prefer the structured detail API if it returns the playlist.
   - Otherwise fetch the episode URL and parse only the `Saate muusika nimekiri` container.
   - Extract `.music-artist` and `.music-title` independently, preserving order and the source `raw_text`.
   - Normalize whitespace and HTML entities, but keep the original text in `raw_text`.
   - Treat an empty list as a valid `no_tracks` result, distinct from a network or parse failure.
   - Support artist text containing punctuation, collaboration markers, and non-ASCII Estonian characters.

5. **Persist incrementally**
   - Insert/update each episode before parsing so interrupted runs retain discovery progress.
   - Write an episode and all its tracks in a transaction.
   - Set `parse_status` to `parsed`, `no_tracks`, or `failed` and save an error message for failures.
   - Use `raw_hash` to skip refetching unchanged episode pages in incremental mode; provide `--refresh` to force reparsing.
   - Continue after an individual failure and print a final failure summary.

6. **Add CLI commands**

```text
node src/cli.js scrape [--db data/kauamangiv.sqlite] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--refresh]
node src/cli.js stats
node src/cli.js search --artist Keeris
node src/cli.js export --format csv --output data/tracks.csv
```

`search` should use a case-insensitive comparison after Unicode-aware trimming, but display the original stored artist and title. Include a fuzzy/manual review option for variants such as `Ansambel Keeris`, capitalization differences, or trailing markers.

7. **Validate with a small fixture run first**
   - Save one archive API response and two representative episode pages under `test/fixtures/`.
   - Test pagination deduplication and cursor-loop protection.
   - Test extraction of multiple tracks, a track with an asterisk, missing title/artist fields, HTML entities, and an empty playlist.
   - Test that rerunning the same episode does not duplicate it or its tracks.
   - Test that a failed episode can be retried and changes from `failed` to `parsed`.
   - Test the query for `Keeris` against a fixture containing that artist.

8. **Run the production scrape**
   - Start with a limited date range and `--dry-run` or a temporary database.
   - Inspect counts and a sample of episode URLs and tracks.
   - Run the complete available archive into `data/kauamangiv.sqlite`.
   - Keep raw HTTP responses only if needed for audit/debugging; otherwise retain hashes and parser status to limit storage.
   - Export a CSV snapshot for manual review.

9. **Add the Keeris application server**
    - Add an Express server inside `miniapps/keeris`; do not add Keeris routes or plugins to the general `curator` module.
    - Mount the Keeris GraphQL API at `POST /graphql`.
    - Serve the Vite output from `web/dist` through the same Express process.
    - Add an SPA fallback to `web/dist/index.html` for frontend routes.
    - Add `GET /health` with database and processor readiness information.
    - Configure CORS, JSON limits, logging, and graceful shutdown.
    - Read `PORT`, database path, ERR configuration, and indexing settings from environment variables.
    - Keep indexing mutations authenticated or explicitly protected; public search queries may be read-only.

10. **Bundle Keeris into one Docker image**
    - Use a multi-stage Node 22 image because the scraper uses `node:sqlite`.
    - Build stage:
       1. install Keeris and `@curator/agent-server` dependencies;
       2. build the Vue frontend with Vite;
       3. compile or prepare the Keeris Express server;
       4. run tests and generate any required client artifacts.
    - Production stage:
       - copy only production dependencies, server output, `web/dist`, Curator runtime dependencies, and Prisma artifacts;
       - expose the configured Express port, defaulting to `4000`;
       - start the Keeris server, which serves both GraphQL and the frontend bundle.
    - Do not bake API keys or database files into the image.
    - Mount the SQLite database through a Docker volume if SQLite remains the deployment database.
    - Provide PostgreSQL configuration as the production migration path if concurrent indexing and multiple server replicas are required.
    - Add a `.dockerignore` excluding `node_modules`, local databases, logs, test fixtures, and generated build output.
    - Add Docker health checks against `/health`.

Example deployment shape:

```text
Browser
   -> Express :4000
          -> /graphql -> Keeris GraphQL resolvers -> Curator persistence
          -> /       -> bundled Vue application
          -> /health -> readiness checks
          -> CuratorRequestProcessor -> ERR indexing workflows
```

Required Keeris scripts:

```text
npm run dev:server
npm run dev:web
npm run build:web
npm run build:server
npm run build
npm run start
npm run docker:build
npm run docker:run
```

The final production command should be equivalent to:

```text
node dist/server/index.js
```

The Express server owns the Keeris composition root: it registers the Keeris domain,
ERR radio, and any MCP plugins before starting the Curator processor. The general
Curator package remains a dependency and is not modified with Keeris-specific code.

## Required queries

Find exact artist matches:

```sql
SELECT e.scheduled_at, e.title AS episode, e.url, t.position, t.artist, t.title
FROM tracks t
JOIN episodes e ON e.id = t.episode_id
WHERE lower(trim(t.artist)) = lower(trim(?))
ORDER BY e.scheduled_at, t.position;
```

Find likely variants:

```sql
SELECT e.scheduled_at, e.url, t.position, t.artist, t.title
FROM tracks t
JOIN episodes e ON e.id = t.episode_id
WHERE lower(t.artist) LIKE '%keeris%'
ORDER BY e.scheduled_at, t.position;
```

## Acceptance criteria

- A fresh run discovers every episode returned by ERR's Kauamangiv archive pagination.
- Each discovered episode is represented exactly once in SQLite.
- Track order, artist, title, and source text are preserved.
- Reruns are idempotent and can resume after interruption.
- Network failures are retried and do not abort the entire scrape.
- `node --test` passes against fixtures.
- `node src/cli.js search --artist Keeris` returns matching episode URLs, dates, positions, and song titles, or clearly reports no match.
- The final report states the actual oldest/newest dates scraped and the number of episodes with no published music list.

## Risks and decisions

- ERR may change its HTML classes or archive API contract. Keep selectors and endpoint construction in `err-client.js`/`episode-parser.js`, covered by fixtures.
- The published music list may be incomplete or absent even when audio exists. The scraper must report that fact rather than infer tracks from the audio.
- Audio fingerprinting is out of scope. Extracting unlisted songs would require a separate audio acquisition, segmentation, and recognition pipeline.
- The scraper should identify `Keeris` from published artist metadata only; use the stored raw text and a review report for ambiguous artist names.
