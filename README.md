# Ahvaan · Urban Heat Resilience Platform

Ahvaan is an enterprise-grade, ward-level heat risk decision-support platform designed for **Kolkata Municipality (144 KMC Wards)**. The platform provides real-time microclimate surveillance, thermal stress modeling, population exposure analytics, and automated municipal heat advisory dispatch.

---

## 🌟 What We Built & Core Platform Features

1. **Interactive 144-Ward Spatial Heat Map (`/maps`)**:
   - Full vector-mapped choropleth rendering Kolkata's 144 KMC wards.
   - **Real-Time Hover Telemetry**: Hovering over any ward dynamically updates the right-rail Info Bar with real-time **Microclimate** (Dry Bulb Temp, Relative Humidity, Wind Speed, Solar Radiation) and **Heat Stress Indices** (WBGT, Heat Index, UTCI, HTSI, Composite Risk, Mortality Index).
   - Layer toggles: Switch between Composite Risk, Thermal Stress, WBGT, Heat Index, Population Exposure, and Demographic Vulnerability.

2. **Ward Analysis & Deep-Dive (`/analysis`)**:
   - In-depth ward profile dashboard featuring 5-day forecasted outlooks, 24-hour heat progression charts, demographic risk factors, and vulnerability breakdowns.

3. **Executive Overview & Metro Watch (`/overview`)**:
   - Citywide KPI status dashboard (Red/Orange/Yellow/Green Watch level), peak risk wards leaderboard, and municipal exposure metrics.

4. **Alert Dispatch Engine (`/alerts`)**:
   - Evaluates multi-parameter alert triggers (Composite Risk, WBGT, HTSI, Heat Index) to compute advisory levels (`LOW`, `MODERATE`, `HIGH`, `EXTREME`).
   - Integrated email dispatch modal to send instant heat advisories to municipal stakeholders.

5. **Ahvaan AI Assistant (`ChatbotWidget`)**:
   - Stateless AI assistant grounded on live ward telemetry, answering operator queries regarding ward conditions, risk trends, and emergency protocols.

---

## 🧮 Science Engine & Mathematical Formulas

Ahvaan synthesizes multi-dimensional environmental and demographic data into single-score decision indicators using the **HeatShield Science Engine**.

### 1. Composite Heat Risk Index Formula

The total composite risk score $R \in [0, 1]$ is a weighted linear combination of three sub-indexes:

$$R = w_{\text{thermal}} \cdot S_{\text{thermal}} + w_{\text{exposure}} \cdot S_{\text{exposure}} + w_{\text{vulnerability}} \cdot S_{\text{vulnerability}}$$

- **Sub-weights**:
  - $w_{\text{thermal}} = 0.50$ (50% weight on physical thermal strain)
  - $w_{\text{exposure}} = 0.30$ (30% weight on population & worker headcount)
  - $w_{\text{vulnerability}} = 0.20$ (20% weight on demographic sensitivity)

---

### 2. Thermal Stress Sub-Index ($S_{\text{thermal}}$)

Combines three standardized biometeorological heat stress indicators:

$$S_{\text{thermal}} = 0.50 \cdot \text{WBGT}_{\text{norm}} + 0.30 \cdot \text{HI}_{\text{norm}} + 0.20 \cdot \text{UTCI}_{\text{norm}}$$

- **Normalization Bounds**:
  - **Wet Bulb Globe Temperature ($\text{WBGT}$)**: Normalizes $[15^\circ\text{C}, 40^\circ\text{C}] \rightarrow [0, 1]$. (Primary occupational heat hazard metric).
  - **Heat Index ($\text{HI}$)**: Normalizes $[20^\circ\text{C}, 55^\circ\text{C}] \rightarrow [0, 1]$. (NWS apparent temperature).
  - **Universal Thermal Climate Index ($\text{UTCI}$)**: Normalizes $[15^\circ\text{C}, 45^\circ\text{C}] \rightarrow [0, 1]$. (Human energy balance model).

---

### 3. Population Exposure Sub-Index ($S_{\text{exposure}}$)

$$S_{\text{exposure}} = 0.40 \cdot \text{Pop}_{\text{norm}} + 0.30 \cdot \text{Density}_{\text{norm}} + 0.30 \cdot \text{OutdoorWorkers}$$

- **Normalization Limits**:
  - $\text{Pop}_{\text{norm}} = \text{min}(1.0, \frac{\text{Population}}{50,000})$
  - $\text{Density}_{\text{norm}} = \text{min}(1.0, \frac{\text{Density (persons/km}^2)}{20,000})$
  - $\text{OutdoorWorkers} \in [0, 1]$ (Fraction of population working outdoors).

---

### 4. Demographic Vulnerability Sub-Index ($S_{\text{vulnerability}}$)

Weights sensitive population shares and structural housing conditions:

$$S_{\text{vulnerability}} = 0.25 \cdot \text{ElderlyShare} + 0.15 \cdot \text{ChildrenShare} + 0.25 \cdot \text{OutdoorWorkers} + 0.20 \cdot \text{InformalHousing} + 0.15 \cdot \text{LackOfAC}$$

- $\text{ElderlyShare}$: Population fraction aged $\ge 60$ years.
- $\text{ChildrenShare}$: Population fraction aged $0–6$ years.
- $\text{InformalHousing}$: Settlement density & non-permanent structure index.
- $\text{LackOfAC}$: Estimated household fraction without air cooling.

---

### 5. Mortality Risk Index ($0–100$)

Evaluates acute health risk based on nighttime heat retention and heat persistence:

$$\text{MortalityIndex} = 100 \times \text{clamp}\left( 0.40 \cdot \text{HI}_{\text{norm}} + 0.25 \cdot \text{Persistence} + 0.20 \cdot (1 - \text{NightRecovery}) + 0.15 \cdot S_{\text{vulnerability}} \right)$$

- **Nighttime Recovery**: Lack of night cooling ($22:00–06:00$) significantly prevents human physiological core body temperature rest, escalating mortality risk.
- **Persistence**: Cumulative thermal stress sustained over 72 consecutive hours.

---

### 6. Risk Severity Categories

| Risk Score Range | Engine Category | UI Display Label | Action Level |
| :--- | :--- | :--- | :--- |
| **$0.00 - 0.30$** | `LOW` | Low | Normal monitoring |
| **$0.30 - 0.50$** | `MODERATE` | Moderate | Caution, hydration advice |
| **$0.50 - 0.65$** | `HIGH` | High | Limit outdoor work (12-4 PM) |
| **$0.65 - 1.00$** | `VERY_HIGH` | Extreme | Open cooling shelters, emergency action |

---

## 🏗️ Architecture & Technology Stack

- **Framework**: Next.js 15 App Router (`react` 19, TypeScript 5.7).
- **Styling & UI Design**: Vanilla CSS + Tailwind CSS (dark/light theme tokens), Framer Motion, Lucide Icons, Radix UI.
- **Data & Database**: Drizzle ORM + Postgres (`postgres-js`, Neon pooler).
- **Caching Layer**: Redis (`ioredis`) with fail-open in-memory TTL map fallback (`lib/redis.ts`).
- **Client State & Fetching**: SWR (`useSWR`) with optimistic caching and request deduplication.
- **Email Notifications**: Nodemailer (SMTP with simulated fallback mode).

```
   ┌────────────────────────────────────────────────────────┐
   │                  Ahvaan Data Pipeline                  │
   └───────────────────────────┬────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   Open-Meteo Weather API                  Census / Geo Spatial
            │                                     │
            └──────────────────┬──────────────────┘
                               ▼
                    Postgres Engine Tables
                (locations, weather, analysis)
                               │
                               ▼
                Redis Cache Layer (lib/redis.ts)
                               │
                               ▼
               Next.js 15 App Router API Routes
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
  overview/            # Citywide executive watch dashboard
  analysis/            # Deep-dive ward analytics & 5-day outlook
  alerts/              # Advisory dispatch center & email composer
  api/                 # RESTful API route endpoints

lib/
  config/              # Central configuration (appConfig.ts, navConfig.ts)
  enums/               # Design system enums (risk.enum.ts, alert.enum.ts, weather.enum.ts)
  types/               # Domain interfaces (domain.ts)
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
    SubCard.tsx        # Parameter card with contextual hover explainers
    RiskBadge.tsx      # Standardized 5-step risk severity badge
    AnalyticsView.tsx  # Charts & distribution breakdowns
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
# Edit .env and supply your POSTGRES_URL and optional REDIS_URL

# 3. Start Development Server
npm run dev
# Open http://localhost:3000 (redirects automatically to /maps)

# 4. Type Check & Production Build
npx tsc --noEmit
npm run build
npm start
```
