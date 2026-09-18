# Ahvaan

Ward-level heat-risk decision support for Kolkata (141 KMC wards). The engine
pipeline (upstream `Ahvaan-India/Ahvaan` repo) ingests Open-Meteo weather +
census data into Postgres and precomputes a daily `analysis` table. This
website **only fetches**: Postgres → Redis → Next.js API routes → dashboard.
No calculation engine, no snapshots, no alert/delivery tables live here.

Stack: Next.js 15 App Router · Drizzle ORM · Postgres (Neon pooler) ·
`postgres-js` · Redis (`ioredis`, optional) · SWR · nodemailer (SMTP email).

## Data flow

```
upstream ingestion (avhaan-db)      upstream engine (ahvaan-engine)
Open-Meteo + ArcGIS + census  ──▶  WBGT/HI/UTCI/WBT(/HTSI) per hour
         │                                    │
         ▼                                    ▼
locations · weather · population · data_ingestion_errors · analysis
         │                                    │
         └──────────────┬─────────────────────┘
                        ▼
              This website (fetch-only)
     Redis cache (lib/redis.ts, in-memory fallback)
                        ▼
     API routes → dashboard (map, KPIs, telemetry, analysis, email)
```

Live tables (exactly these five — the site creates none):

- `locations`: 141 wards. `district` is TEXT (census code, e.g. `"342"`),
  `ward` is the KMC number, `lat`/`long` nullable, `status`
  active|inactive, `geometry` is **nested** polygon arrays
  (`[[[lon,lat],…]]`), `last_refresh` NOT NULL.
- `weather`: ~240 hourly rows/location (10-day window). `timestamp` is
  **without time zone and holds IST wall clock** (`"2026-09-24 23:00:00"`).
  Never `new Date()` it directly — use `parseISTWall()` / `toISTWall()`
  (`lib/analysis.ts`); comparisons are wall-to-wall so they behave
  identically on any DB session timezone.
- `population`: 141 census rows, metric ints NOT NULL, `year` default 2011.
- `analysis`: one row per `(locationId, forecastDate)` with 24 hourly
  `{ hour, analysis: { WBGT, HI, UTCI, WBT, HTSI? }, input }` entries.
  Rows written before HTSI existed lack it — reads treat HTSI as nullable.
- `data_ingestion_errors`: upstream ingestion audit log (read-only here).

## Project structure

```
app/
  maps/, overview/, analysis/, alerts/   Console pages (all client-side)
  api/
    risk/[locationId]/route.ts    GET single-ward live risk (heatshield)
    risk/route.ts                 GET multi-ward (?bbox=… | ?locationIds=…)
    forecast/[locationId]/route.ts GET 5-day ward-local outlook
    showcase/[locationId]/route.ts GET analysis-table showcase: 6-day engine
                                  summaries + hourly series + current hour
    analysis/route.ts             GET multi-ward precomputed window
    analysis/[locationId]/route.ts GET one precomputed engine day
    wards/route.ts                GET ward catalogue (identity + geometry)
    wards/heatmap/route.ts        GET choropleth payload (board + rings)
    wards/summary/route.ts        GET KPIs + watch level (board aggregates)
    wards/trend/route.ts          GET city daily mean risk (board history)
    wards/[wardId]/trend/route.ts GET per-ward daily risk series (board)
    wards/[wardId]/telemetry/route.ts GET macro + demographics + live risk
    email/send/route.ts           POST send one alert email (stateless)
    chat/route.ts               POST Ahvaan Assistant (Cloudflare Workers AI,
                                  grounded on live ward data, nothing stored)
lib/
  chatbot/              Assistant stack: system prompt (grounding rules),
                        trusted ward-context builder (board + showcase),
                        Cloudflare API caller (token stays server-side).
  board.ts              Shared city board: per-ward risk derived on demand
                        (bounded per-ward weather ranges + in-memory
                        heatshield math), Redis-cached 2 min. Replaces the
                        old snapshots rollup — no cron, no writes.
  alerts.ts             Frontend alert evaluation (no DB): composite bands
                        from heatshield config + HTSI/WBGT/HI display bands
                        → level + triggers + advisory. Nothing is saved.
  analysis.ts           Fetch-only helpers for the analysis table: IST date
                        utils, wall-clock parsing, stored-value summaries.
  redis.ts              Redis layer between website and Postgres
                        (Website → Redis → Postgres). Falls back to an
                        in-memory TTL map when REDIS_URL is unset; fail-open
                        on Redis errors. X-Cache: HIT/MISS on cached routes.
  email/                SMTP sender (nodemailer) + subject/text/HTML composer.
                        Unconfigured SMTP → honest SIMULATED_SENT, never 500.
  db/                   Drizzle schema (mirrors live DB exactly) + pooled
                        client + parameterized queries (some Redis-cached).
  heatshield/           Single-ward risk math (thermal/exposure/
                        vulnerability/composite/confidence) used by risk,
                        forecast, telemetry and the board. No DB/HTTP inside.
  geo/                  Timezone (null-safe, Kolkata fallback flagged),
                        ring downsampling (unwraps nested polygons),
                        ward names.
components/
  ChatbotWidget.tsx     Floating assistant (all pages): follows the
                        selected ward, suggestion chips, per-tab history.
  map/KolkataMap.tsx     Leaflet choropleth (risk/thermal/exposure/
                        vulnerability/WBGT/HI layers). Wards with empty
                        rings are skipped — see troubleshooting.
  console/EmailAlertModal.tsx  Email dialog: evaluated level + block
                        toggles + preview → POST /api/email/send.
instrumentation.ts      Warms the board cache once at server boot so the
                        first dashboard load is instant.
```

## API notes

- Read paths are `Website → Redis → Postgres`; responses carry
  `X-Cache: HIT/MISS` where caching applies. Board-backed routes
  (heatmap/summary/trend) share one 2-minute board build.
- Cached keys/TTLs: engine days + showcase (`analysis:*`, 6h), location /
  population / wards catalogue (1h), weather windows (5 min), board (2 min),
  heatmap + summary (60s), per-ward forecast (2 min), telemetry (60s),
  trends (5 min). Single-ward risk responses stay uncached (always fresh).
- `GET /api/health` reports Postgres + Redis reachability/latency — check
  `redis.reachable`; if `false`, every read falls back to Postgres +
  in-memory cache (works, but cold on every restart).
- `GET /api/showcase/[locationId]` is the analysis-table output view:
  ward identity + 6 engine days with summaries, hourly HTSI/WBGT/HI/UTCI/
  WBT **plus observed temp/humidity/wind/solar snapshots**, and a
  current-hour pointer. HTSI is `null` on rows that predate it.
- Risk/forecast responses additionally carry precomputed `engine` /
  `analysis` enrichment (best-effort, never blocking).
- `POST /api/email/send` `{ recipientEmail, subject?, messageText, html? }`
  → `{ success, status, mode, messageId, error }`. Stateless: nothing is
  logged anywhere; the SMTP receipt in the dialog is the confirmation.
- `POST /api/chat` `{ message, locationId?, history? }` → `{ answer }`.
  Ahvaan Assistant on Cloudflare Workers AI, grounded strictly on the
  selected ward's live data (risk, temp, HTSI, advisory). Stateless.

## Setup

```bash
npm install
# .env — see .env.example (never commit real credentials)
# POSTGRES_URL=… (required)
# REDIS_URL=… (optional; in-memory fallback otherwise)
# SMTP_HOST/PORT/SECURE/USER/PASS, EMAIL_FROM, ALERT_DEFAULT_EMAIL (optional;
#   unset → simulated sends)
# CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (optional; chat answers 503
#   without them). Find both at dash.cloudflare.com → Workers & Pages → AI.
npm run dev      # http://localhost:3000 → redirects to /maps
npm run build && npm start
```

## Troubleshooting

- **Ward map blank**: every ward needs a non-empty `ring`. Geometry is
  nested (`[[[…]]]`); `downsampleRing` unwraps it. If a ward still has no
  ring, the map skips it by design — check the geometry row.
- **Heatmap slow on first load**: the cold board build fetches ~141 small
  weather ranges + computes risk in memory (~10s once per boot, warmed in
  the background by `instrumentation.ts`). After that it is cache-served.
- **Stale localhost failures for slow responses**: some local proxies kill
  idle localhost connections after ~2s. Fast/cached responses are
  unaffected; if a cold board request fails locally, retry — the warmed
  cache answers in milliseconds.
- **`relation "X" does not exist`**: this project expects exactly the five
  upstream tables. It creates none — re-run the upstream ingestion if one
  is missing.
