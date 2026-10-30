# Curator Blueprint Server

A standalone Curator app that exposes one tool, `web_scrape`, as a remote MCP provider. It is the server half
of the blueprint demo; the client half (Gemini agent + REPL) is [`miniapps/blueprint`](../blueprint/README.md).

- **Transport**: MCP Streamable HTTP at `http://127.0.0.1:4200/mcp`.
- **Auth**: verifies Google id_tokens via JWKS (web client and the blueprint REPL's device client are both accepted);
  only emails/domains in `BLUEPRINT_ALLOWED_EMAILS` get in.
- **Identity**: each caller becomes a Curator user with role `web_reader`, which `web_scrape` requires.
- **Tool**: `web_scrape` comes from [`@curator/plugin-scraper`](../../packages/plugin-scraper) (fetches through its
  `safeFetch`, which blocks private/loopback addresses and caps response size); this app only adds the role and MCP exposure.
- **Database**: its own SQLite file, `data/curator.db` (override with `BLUEPRINT_SERVER_DB`).

## Layout

```
src/
├── main.ts                   # entry: loads .env, starts the server
├── createBlueprintServer.ts  # Curator host + MCP server + Google id_token verification
└── webScrapePlugin.ts        # wraps plugin-scraper's web_scrape with the web_reader role + MCP exposure
test/blueprint_server.test.ts # auth, role mapping, tool listing
```

## Configuration

Layered host app config (same loader as the blueprint client): `blueprint-server.config.yaml`, then
`blueprint-server.config.<profile>.yaml` per active profile (`--profile dev`, `BLUEPRINT_SERVER_PROFILES`,
`CURATOR_PROFILES`, or `profiles.active`). `BLUEPRINT_SERVER_CONFIG` points at another base file. Values reference
the environment as `${VAR}`; `.env` is read from this module, then the workspace root (existing env vars win):

```
GOOGLE_CLIENT_ID=...                     # web client
CLIENT_ID_BLUEPRINT=...                  # device client used by the blueprint REPL
BLUEPRINT_ALLOWED_EMAILS=you@gmail.com   # allow list (emails or @domains); the dev profile sets its own
# optional: BLUEPRINT_SERVER_PORT (default 4200), BLUEPRINT_SERVER_PUBLIC_URL, BLUEPRINT_SERVER_DB
```

The `dev` profile turns on debug logging and admits the developer's email.

## Run

```bash
npm run dev      # tsx src/main.ts --profile dev
# or
npm run build && npm run start:dev   # or npm start with BLUEPRINT_ALLOWED_EMAILS set
```

Then start the client from `miniapps/blueprint` with `npm run repl`.

## Test

```bash
npm run build && npm test
```
