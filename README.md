# Ahvaan · Urban Heat Resilience Platform

Ahvaan is an enterprise-grade, ward-level heat risk decision-support platform designed for **Kolkata Municipality (144 KMC Wards)**. The platform provides real-time microclimate surveillance, thermal stress modeling (HTSI, WBGT, UTCI, Heat Index), population exposure analytics, index accuracy comparison, and automated municipal heat advisory dispatch.

---

## 🌟 What We Built & Core Platform Features

1. **Interactive 144-Ward Spatial Heat Map (`/maps`)**:
   - Vector-mapped choropleth rendering Kolkata's 144 KMC wards.
   - **Real-Time Hover Telemetry**: Hovering over any ward dynamically updates the right-rail Info Bar with real-time **Microclimate** (Dry Bulb Temp, Relative Humidity, Wind Speed, Solar Radiation) and **Heat Stress Indices** (WBGT, Heat Index, UTCI, HTSI, Mortality Index `/100`, Population SubCard).
   - **Ordinal Date Selector**: Dates format cleanly with English ordinal suffixes (`21st`, `22nd`, `23rd`, `24th`).
   - Layer toggles: Switch between Thermal Stress (HTSI), WBGT, Heat Index, Population Exposure, and Demographic Vulnerability.

2. **Ward Analysis & Deep-Dive (`/analysis`)**:
   - In-depth ward profile dashboard featuring 5-day forecasted outlooks, 24-hour heat progression charts, demographic risk factors, and vulnerability breakdowns.
   - **Demographic Vulnerability Breakdown**: Interactive population composition bar chart for Elderly (60+), Children (0–6), Outdoor Workers, and General Population.
   - **User-Friendly Empty Selection State**: Immediate "No Ward Selected" banner when no ward is active instead of endless skeleton loading.

3. **Executive Overview & Metro Watch (`/overview`)**:
   - Citywide KPI status dashboard (Red/Orange/Yellow/Green Watch level), peak stress wards leaderboard, and **City Population Heat Exposure Breakdown** analytics card across HTSI tiers.

4. **Index Accuracy & Cross-Model Validation (`lib/accuracy.ts` & `/api/accuracy`)**:
   - Automated cross-validation engine comparing Ahvaan calculations against international reference services (**Visual Crossing** for WBGT & **WeatherAPI** for Heat Index).
   - Interactive UI matrix displaying **% Similarity**, **Variance (°C)**, and Provider Source details.

5. **Alert Dispatch Engine (`/alerts`)**:
   - Evaluates multi-parameter alert triggers (WBGT, HTSI, Heat Index) to compute advisory levels (`LOW`, `MODERATE`, `HIGH`, `EXTREME`).
   - Integrated email dispatch modal to send instant heat advisories to municipal stakeholders.

6. **Ahvaan AI Assistant (`ChatbotWidget`)**:
   - Stateless AI assistant grounded on live ward telemetry, answering operator queries regarding ward conditions, risk trends, and emergency protocols.

---

## 🧮 Science Engine & Mathematical Formulas

Ahvaan synthesizes multi-dimensional environmental and demographic data into single-score decision indicators using the **HeatShield Science Engine**.

### 1. Heat Stress Index (HTSI) & Direct Microclimate Indexing

Primary physical thermal stress is measured directly on the **HTSI Scale ($0–100$)**:

- **$0 - 30$**: Low Thermal Stress
- **$30 - 60$**: Moderate Thermal Stress
- **$60 - 80$**: High Thermal Stress
- **$80 - 100$**: Extreme Thermal Stress

---

### 2. Thermal Stress Indicators

Combines standardized biometeorological heat stress indicators:

- **Wet Bulb Globe Temperature ($\text{WBGT}$)**: Primary occupational heat hazard metric ($[15^\circ\text{C}, 40^\circ\text{C}]$).
- **Heat Index ($\text{HI}$)**: NWS apparent temperature metric ($[20^\circ\text{C}, 55^\circ\text{C}]$).
- **Universal Thermal Climate Index ($\text{UTCI}$)**: Human energy balance model ($[15^\circ\text{C}, 45^\circ\text{C}]$).

---

### 3. Population Exposure & Demographic Vulnerability

$$S_{\text{vulnerability}} = 0.25 \cdot \text{ElderlyShare} + 0.15 \cdot \text{ChildrenShare} + 0.25 \cdot \text{OutdoorWorkers} + 0.20 \cdot \text{InformalHousing} + 0.15 \cdot \text{LackOfAC}$$

- $\text{ElderlyShare}$: Population fraction aged $\ge 60$ years.
- $\text{ChildrenShare}$: Population fraction aged $0–6$ years.
- $\text{OutdoorWorkers}$: Proportion of informal and outdoor workforce exposed to daylight heat.
- $\text{InformalHousing}$: Settlement density & structural insulation index.

---

### 4. Mortality Risk Index ($0–100$)

Evaluates acute health risk based on nighttime heat retention and heat persistence, displayed as `{index}/100`:

$$\text{MortalityIndex} = 100 \times \text{clamp}\left( 0.40 \cdot \text{HI}_{\text{norm}} + 0.25 \cdot \text{Persistence} + 0.20 \cdot (1 - \text{NightRecovery}) + 0.15 \cdot S_{\text{vulnerability}} \right)$$

- **Nighttime Recovery**: Lack of night cooling ($22:00–06:00$) prevents physiological rest, escalating mortality risk.
- **Persistence**: Cumulative thermal stress sustained over 72 consecutive hours.

---

### 5. Cross-Model Accuracy & Similarity Formula

$$\text{Similarity (\%)} = \left(1 - \frac{|\text{Value}_{\text{Ahvaan}} - \text{Value}_{\text{Reference}}|}{|\text{Value}_{\text{Reference}}|}\right) \times 100$$

- **WBGT Reference**: Visual Crossing Web Services API timeline.
- **Heat Index Reference**: WeatherAPI History API endpoint.

---

## 🏗️ Architecture & Technology Stack

- **Framework**: Next.js 15 App Router (`react` 19, TypeScript 5.7).
- **Styling & UI Design**: Vanilla CSS + Tailwind CSS (dark/light theme tokens), Framer Motion, Lucide Icons, Radix UI.
- **Data & Database**: Drizzle ORM + Postgres (`postgres-js`, Neon pooler).
- **Caching Layer**: Redis (`ioredis`) with fail-open in-memory TTL map fallback (`lib/redis.ts`).
- **Client State & Fetching**: SWR (`useSWR`) with optimistic caching and request deduplication.
- **Accuracy Comparison**: `lib/accuracy.ts` with `/api/accuracy` REST API.
- **Email Notifications**: Nodemailer (SMTP with simulated fallback mode).

```
   ┌────────────────────────────────────────────────────────┐
   │                  Ahvaan Data Pipeline                  │
   └───────────────────────────┬────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   Open-Meteo / DB Precomputed             Visual Crossing & WeatherAPI
   (locations, weather, analysis)          (External Reference Benchmarks)
            │                                     │
            └──────────────────┬──────────────────┘
                               ▼
               Redis Cache Layer (lib/redis.ts)
                               │
                               ▼
              Next.js 15 App Router API Routes
            (/api/wards, /api/accuracy, /api/alerts)
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
       /maps Page       /overview Page     /analysis Page
    (Choropleth Map)    (Metro Board)     (Ward Deep Dive)
```

---

## 📁 Modular Directory Structure

```
app/
  maps/                # Interactive 144-ward choropleth map & hover telemetry
  overview/            # Citywide executive watch dashboard & heat exposure summary
  analysis/            # Deep-dive ward analytics, demographics & 5-day outlook
  alerts/              # Advisory dispatch center & email composer
  api/
    accuracy/          # RESTful API route for Visual Crossing / WeatherAPI accuracy benchmark

lib/
  accuracy.ts          # Index accuracy comparison service (WBGT & HI cross-model similarity)
  config/              # Central configuration (appConfig.ts, navConfig.ts)
  enums/               # Design system enums
  types/               # Domain interfaces
  heatshield/          # HeatShield math engine (thermal, vulnerability, mortality)
  redis.ts             # Redis cache layer with fail-open fallback
  alerts.ts            # Frontend alert evaluation logic
  console.ts           # Weather qualifier helpers & watch levels
  geo/                 # Ward name mapping & ring geometry processing

components/
  map/KolkataMap.tsx   # Vector Map rendering 144 KMC ward polygons
  console/
    TopBar.tsx         # Navigation header with ward search autocomplete
    WardInfoBar.tsx    # Slide-in right rail / mobile drawer with live telemetry
    TelemetryPanel.tsx # Environmental microclimate sub-cards & tooltips
    SubCard.tsx        # Parameter card with scoped ? icon hover tooltips
    AccuracyComparison.tsx # Interactive index accuracy & similarity matrix card
    AnalyticsView.tsx  # City-wide distribution breakdowns & scatter correlations
    WardAnalysis.tsx   # Demographic vulnerability bar charts & 24h humidity curves
```

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js `>= 18.0.0`
- `npm` or `pnpm`

### Installation & Execution

```bash
# 1. Clone repository & install dependencies
git clone https://github.com/vishvaaskr/SIH-Project.git
cd SIH-Project
npm install

# 2. Configure Environment Variables
cp .env.example .env
# Edit .env and supply your POSTGRES_URL, REDIS_URL, VISUALCROSSING_API_KEY, and WEATHERAPI_API_KEY

# 3. Start Development Server
npm run dev
# Open http://localhost:3000 (redirects automatically to /maps)

# 4. Type Check & Production Build
npx tsc --noEmit
npm run build
npm start
```
