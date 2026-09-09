# Ahvaan

Ward-level heat-risk decision support for Kolkata (141 KMC wards). Reads Open-Meteo model weather + census data from Postgres (Drizzle ORM), computes a normalized Composite Risk Score (0–1) per ward through a pure calculation engine (with top-drivers explanation), and exposes it via Vercel serverless API routes for the dashboard.

Stack: Next.js 15 App Router · Drizzle ORM · Postgres (Neon pooler) · `postgres-js` · SWR · Vitest.

## Project structure

```
app/
  layout.tsx                  Root layout (Ahvaan title)
  page.tsx                    Ahvaan dashboard: location bar, ward select, map, detail, forecast
  globals.css                 Minimal styles
  api/
    risk/[locationId]/route.ts  GET /api/risk/:id  single-ward current risk
    risk/route.ts               GET /api/risk?bbox=… | ?locationIds=…  multi-ward
    forecast/[locationId]/route.ts  GET /api/forecast/:id  5-day ward-local outlook
    wards/route.ts              GET /api/wards  141 wards + downsampled polygons
components/
  RiskCard.tsx                Legacy single-location card (kept for reference)
  WardClock.tsx               Ticking ward-local clock (timezone from the ward, not the viewer)
  WardMap.tsx                 SVG ward map: hover preview, click to pin, pop.-shaded
  RiskDetail.tsx              Full parameter panel: indicators, scores, why-summary, warnings
  ForecastStrip.tsx           5-day outlook cards
lib/
  db/
    schema.ts                 Drizzle tables: locations, weather, population
    index.ts                  Pooled postgres-js client (POSTGRES_URL)
    queries.ts                getLocationById, getWeatherWindow, getWeatherRange,
                              getLatestPopulation, getLocationsInBounds, getWards, parseBBox
    errors.ts                 DataGapError (→422), LocationNotFoundError (→404)
  geo/
    timezone.ts               Ward→IANA timezone (Kolkata → Asia/Kolkata), local
                              formatting, local-day keys, UTC-offset labels
  heatshield/                 Pure calculation engine  no DB, no HTTP
    config.ts                 ALL engineering-choice constants (recalibrate here)
    types.ts                  RiskResponse, RiskCategory, shared interfaces
    thermal.ts                WBGT, Heat Index (Rothfusz+NWS), normalization, weighting
    exposure.ts               Epop / Edensity / Eoutdoor_workers + cell-area logic
    vulnerability.ts          Elderly/children/outdoor/housing/noAC + quality flags
    temporal.ts               Persistence (P) + Nighttime Recovery (R)
    composite.ts              baseRisk + persistence boost → risk + category
    confidence.ts             Coverage + UTCI + defaults → 0–1 trust score
    explain.ts                Top drivers, plain-language summary, method warnings
    service.ts                buildRiskResponse(): rows in → RiskResponse out
    *.test.ts                 Vitest unit tests
```

## Data layer (`lib/db/`)

- `schema.ts` mirrors the **live Neon DB exactly**. Note: the live DB uses `camelCase` columns (`locationId`, `temperature2m`, `totalPopulation`, …) except `locations.last_refresh`. Do not rename without a migration.
  - `locations`: `id, lat, long, geometry (jsonb), last_refresh`
  - `weather`: hourly rows `temperature2m, relativeHumidity2m, dewPoint2m, apparentTemperature, windSpeed10m/Direction/Gusts, shortwave/direct/diffuseRadiation, precipitation, rain, timestamp` + index on `(locationId, timestamp)` for the 72h window.
  - `population`: census rows totals, gender, `children0To6`, literacy, `totalWorkers`, main-worker splits, marginal-worker totals + 3–6mo / 0–3mo splits, `nonWorkers, year` + hierarchy columns (`state, district, ward, enumerationBlock, level, ward_name, tru`).
- `index.ts` `getDb()` returns a cached Drizzle client over `postgres-js` (`max:5`, `prepare:false`). Connection string from `POSTGRES_URL` only.
- `queries.ts` parameterized Drizzle only, no raw SQL strings:
  - `getLocationById(id)` → row or null
  - `getWeatherWindow(id, hours=72)` → rows ascending by timestamp; throws `DataGapError` on zero rows
  - `getLatestPopulation(id)` → latest `year` row or null
  - `getLocationsInBounds(bbox)` + `parseBBox("minLong,minLat,maxLong,maxLat")` for map views
- `errors.ts` `DataGapError` maps to HTTP 422 (explicit gap, never silent garbage); `LocationNotFoundError` maps to 404.

## Calculation engine (`lib/heatshield/`)

Pure functions. Importable in tests without a DB.

- `config.ts` single source of truth for every unspecified-by-spec choice: thermal bounds (`WBGT 15–40, HI 20–55, UTCI 15–45`), thermal/exposure/vulnerability weights, vulnerability defaults (`elderly 0.09, housing 0.30, noAC 0.85`), persistence threshold (0.6), nighttime band (18→32 °C, comfort 25 °C), composite weights (`0.50/0.25/0.25 + 0.15·P`), category bands (`0.30/0.50/0.65`), confidence weights. Change values here, not in logic files.
- `thermal.ts` `magnusTetensSatVaporPressure`, `vaporPressure`, `wbgtApprox (0.567·Ta+0.393·e+3.94)`, `heatIndexRothfusz` (full NWS regression + low-RH reduction + high-RH addition + sub-80 °F path), `normalizeThermalIndicator`, `computeThermalStress` (renormalizes WBGT+HI to sum 1.0 when UTCI missing; missing is never 0).
- `exposure.ts` `outdoorWorkerFraction` (agri-labourers + household-industry splits ÷ totalWorkers), `cellAreaKm2` (GeoJSON bbox → km², else 1 km² fallback + `density_population_proxy` flag), `computeExposureScore = w1·Epop+w2·Edensity+w3·Eoutdoor`.
- `vulnerability.ts` `computeVulnerabilityInputs` derives children (`children0To6/total`) + outdoor share, defaults elderly/housing/AC with `elderly_pct_default, informal_housing_default, ac_access_default` flags; `computeVulnerabilityScore` = weighted sum.
- `temporal.ts` `computePersistence` = recency-weighted fraction of hourly scores ≥ threshold (engineering choice for spec-undefined `f`); `computeNighttimeRecovery` = avg overnight-min (00–06 UTC) normalized on the comfort band (1 = worst recovery).
- `composite.ts` `computeCompositeRisk({T,E,V,P})`: `risk = clip(0.5·T+0.25·E+0.25·V+0.15·P)` + `categorize` (LOW/MODERATE/HIGH/VERY_HIGH). Pinned by worked example `0.702/0.693/0.086/0.909 → 0.682 VERY_HIGH`.
- `confidence.ts` `0.6·coverage + 0.2·utci + 0.2·vulnCompleteness`, where coverage = rows/72 capped at 1.
- `service.ts` `buildRiskResponse({location, weatherRows, population})`: per-hour thermal series → T (latest hour) / P / R, plus E, V, composite, confidence (`missingInputs:['pressure']`, `utci_unavailable` flag), rounded to 3dp. Throws `DataGapError` on missing population or no usable Ta/RH rows.
- `types.ts` `RiskResponse` contract (see below) + `RiskCategory`.

## API routes

Both run on `runtime = 'nodejs'` (`force-dynamic`), never Edge (Postgres driver needs Node APIs).

- `GET /api/risk/[locationId]` detail endpoint, `Cache-Control: no-store`. Statuses: 200 `RiskResponse`, 400 bad id, 404 unknown location, 422 data gap, 500 unexpected.
- `GET /api/risk?bbox=minLong,minLat,maxLong,maxLat` or `?locationIds=1,2,3` (max 50) multi-ward endpoint. Returns `{ data: RiskResponse[], errors: [{locationId, error}] }` (gap locations skipped, not failed). Cached `s-maxage=300, stale-while-revalidate=60`.
- `GET /api/wards` ward catalogue for the selector + map: `{ count, wards: [{ locationId, ward, wardName, lat, long, totalPopulation, ring }] }`, rings downsampled server-side. Cached `s-maxage=3600`.
- `GET /api/forecast/[locationId]` 5-day outlook in ward-local days: `{ locationId, timezone, days: [{ date, tempMin, tempMax, wbgtMax, heatIndexMax, thermalStress, persistence, risk, category, hours }] }`. Daily T = mean hourly thermal score, P = trailing-72h persistence, same E/V. Cached `s-maxage=600`.

Response contract:

```json
{
  "locationId": 1,
  "lat": 22.62,
  "long": 88.37,
  "computedAt": "ISO",
  "indicators": {
    "wbgt": 32.78,
    "heatIndex": 32.7,
    "utci": null,
    "utciAvailable": false
  },
  "scores": {
    "thermalStress": 0.58,
    "exposure": 0.71,
    "vulnerability": 0.23,
    "persistence": 0.46,
    "nighttimeRecovery": 0.63
  },
  "compositeRisk": { "value": 0.595, "category": "HIGH" },
  "confidence": {
    "score": 0.68,
    "dataQualityFlags": ["elderly_pct_default", "utci_unavailable"],
    "missingInputs": ["pressure"]
  },
  "explanation": {
    "top_drivers": ["HOT_NIGHT", "CURRENT_DANGER", "HIGH_EXPOSURE"],
    "summary": "Risk is primarily driven by ..."
  },
  "warnings": [
    "UTCI not implemented in this MVP ...",
    "WBGT uses a shaded/outdoor approximation ..."
  ],
  "meta": {
    "weather_source": "Open-Meteo",
    "source_note": "Live API/model weather data; ...",
    "timezone": "Asia/Kolkata",
    "science_engine_version": "0.3.0"
  },
  "disclaimer": "MVP decision-support index, not a validated clinical mortality prediction model. Score does not represent a statistical probability of an adverse outcome."
}
```

Driver codes: `PERSISTENT_HEAT, HOT_NIGHT, LOW_RECOVERY, HIGH_THERMAL, HIGH_EXPOSURE, HIGH_VULNERABILITY, CURRENT_DANGER, LOW_CONFIDENCE` (max 3, severity-ranked). Computed in `lib/heatshield/explain.ts`, surfaced in `RiskDetail` as chips + why-summary.

Location is **ward-explicit, never detected**: the id comes from the ward selector / map hover-click and is looked up in `locations` (1 location ↔ 1 KMC ward). No GPS or IP geolocation. All displayed times use the **ward's timezone** (`RiskResponse.meta.timezone`, `Asia/Kolkata` for Kolkata) via `lib/geo/timezone.ts` + `WardClock` never the viewer's browser zone.

## Frontend (Ahvaan dashboard, shadcn/ui + Tailwind)

- Styling: Tailwind v3 (`tailwind.config.ts`, shadcn slate tokens in `globals.css`) + `components/ui/*` primitives (button, card, badge, select, skeleton). Dark/white toggle sets both `.dark` and `data-theme`, persisted to localStorage, OS default, no-flash bootstrap in `layout.tsx`.

## HeatWatch console (municipal ops view)

`app/page.tsx` renders the command center: dark-navy sidebar (Overview/Alerts/Analytics/Ward Profiles + sync block), top bar (watch badge, sync time, ward clock, **Send Alert to WhatsApp**), KPI row (Active/Extreme/High/Moderate + 24h deltas), risk choropleth + ward popover sub-cards, metro heat-load gauge + driver sub-cards, 5-day trajectory, active alerts with broadcast history, telemetry panel (macro/demographic/history).

- Wards map 1:1 to locations (`locationId` = ward's location row) no separate wards table needed.
- New tables: `alerts`, `alert_deliveries` (+ forward-compatible `status`), `ward_snapshots` (insert-only history).
- `npm run snapshots` (`scripts/refresh.ts`) recomputes all 141 wards and syncs alerts. Run on a schedule; heatmap/KPI/alerts read snapshots (fast, no per-request fan-out).
- New routes: `GET /api/wards/summary`, `GET /api/wards/heatmap`, `GET /api/wards/[wardId]/telemetry`, `GET /api/forecast/[id]?days=`, `GET /api/alerts/active`, `GET+POST /api/alerts/deliveries`.
- WhatsApp prototype (`lib/whatsapp/compose.ts`, `SendAlertModal`): wa.me Click-to-Chat deep link + initiation logging only. No Business API, no templates, no receipts (see code comments for the migration path).
- Honest deviations from the concept spec: no mortality-surge model exists in the engine, so the popover/trajectory show engine risk instead of fabricated mortality %; driver “load” bars are documented severity normalizations, not fitted % attributions; elderly cutoff is 60+ at 9% default (flagged), not 35+.

- `app/page.tsx` client dashboard: location bar (Ahvaan · Kolkata · ward name · live ward-local clock · coords) → ward `<select>` (141 wards) → `WardMap` + `RiskDetail` grid → `ForecastStrip`.
- `components/WardMap.tsx` SVG ward polygons from `/api/wards` rings; hover previews the ward (detail + forecast follow), click pins it; fill intensity scales with population.
- `components/RiskDetail.tsx` every engine field: indicators, all five scores, composite, why-summary + driver chips, confidence/flags, method warnings, source + engine version.
- `components/ForecastStrip.tsx` 5 ward-local-day cards from `/api/forecast/:id`.
- `components/WardClock.tsx` 1s-ticking clock in the ward timezone.
- `components/RiskCard.tsx` legacy single-location card, kept for reference.

## Setup

```bash
npm install
# .env  pooled connection string (see .env.example)
# POSTGRES_URL=postgres://user:pass@host/db?sslmode=require
npx drizzle-kit push   # create/align tables from lib/db/schema.ts (first time only)
npm run dev            # http://localhost:3000, Ahvaan dashboard on /
npm test               # vitest run (36 tests, incl. §6 worked example + explain)
npm run build
```

## Deploy (Vercel)

- Set `POSTGRES_URL` in Project Settings → Environment Variables.
- Keep API routes on Node.js runtime; the `(locationId, timestamp)` index keeps the 72h query inside serverless timeouts; the pooler (`max:5`, short idle) suits stateless invocations.
