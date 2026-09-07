/**
 * Ahvaan — single source of truth for every engineering-choice constant.
 *
 * The source spec leaves several values unspecified (normalization bounds,
 * persistence function shape, category cutoffs, vulnerability defaults).
 * All such choices live here so they can be recalibrated without touching
 * logic in thermal.ts / exposure.ts / vulnerability.ts / temporal.ts /
 * composite.ts / confidence.ts. Each constant documents WHY it was chosen
 * and WHAT to change when better data arrives.
 */

/** Fixed disclaimer — must be surfaced in the UI, not buried. */
export const DISCLAIMER =
  "MVP decision-support index, not a validated clinical mortality prediction model. Score does not represent a statistical probability of an adverse outcome." as const;

/** Science-engine version surfaced in RiskResponse.meta. */
export const SCIENCE_ENGINE_VERSION = "0.3.0" as const;

/** How many hourly weather rows a full 72h window should contain. */
export const EXPECTED_WEATHER_ROWS = 72;

/** Temporal lookback window (hours) for Persistence (P) + Nighttime Recovery (R). */
export const WEATHER_WINDOW_HOURS = 72;

// ---------------------------------------------------------------------------
// Thermal stress
// ---------------------------------------------------------------------------

/**
 * Normalization bounds (°C) mapping raw indicators to 0–1.
 * ENGINEERING CHOICE: the PDF does not specify bounds. These ranges cover
 * typical-to-extreme Indian heat-season conditions:
 *  - WBGT 15°C (cool) → 40°C (extreme, well above the 32–35°C danger zone)
 *  - Heat Index 20°C → 55°C (NWS "extreme danger" starts ~54°C/130°F)
 *  - UTCI 15°C → 45°C (UTCI "very strong/extreme heat stress" band)
 * Recalibrate against observed climatology when available.
 */
export const THERMAL_NORMALIZATION_BOUNDS = {
  wbgt: { min: 15, max: 40 },
  heatIndex: { min: 20, max: 55 },
  utci: { min: 15, max: 45 },
} as const;

/**
 * Thermal sub-weights. Must sum to 1.0.
 * ENGINEERING CHOICE: WBGT leads (best outdoor-heat proxy of the three),
 * Heat Index second, UTCI third. When UTCI is unavailable the remaining
 * two are renormalized proportionally (never treat missing as 0).
 */
export const THERMAL_WEIGHTS = {
  wbgt: 0.5,
  heatIndex: 0.3,
  utci: 0.2,
} as const;

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

/**
 * Exposure: w1*Epop + w2*Edensity + w3*Eoutdoor_workers (each 0–1).
 * ENGINEERING CHOICE: population count and density get slightly more joint
 * weight than the outdoor-worker fraction, since headcount drives absolute
 * exposed numbers. Recalibrate with stakeholder input.
 */
export const EXPOSURE_WEIGHTS = {
  population: 0.4,
  density: 0.3,
  outdoorWorkers: 0.3,
} as const;

/**
 * ENGINEERING CHOICE: raw population/density normalization bounds.
 * Indian census cells vary wildly; these log-scale-friendly linear bounds
 * are placeholders until a proper percentile-based scaling is fitted.
 */
export const EXPOSURE_NORMALIZATION = {
  /** Total population per location cell: 0 → 50k maps to 0 → 1. */
  population: { min: 0, max: 50_000 },
  /** Persons per km²: 0 → 20k maps to 0 → 1 (dense urban ward ≈ 20k+). */
  density: { min: 0, max: 20_000 },
  /** Outdoor-worker fraction is already 0–1, no rescaling needed. */
  outdoorWorkers: { min: 0, max: 1 },
} as const;

/** Fallback cell area (km²) when `locations.geometry` is absent. Flagged. */
export const EXPOSURE_FALLBACK_CELL_AREA_KM2 = 1;

/** Approx km² per square degree at Indian latitudes (~111km)². */
export const KM2_PER_DEG2_APPROX = 111 * 111;

// ---------------------------------------------------------------------------
// Vulnerability
// ---------------------------------------------------------------------------

/**
 * Vulnerability sub-weights (sum to 1.0).
 * Sub-scores: elderly share, children share, outdoor-worker share,
 * informal-housing index, lack-of-AC (noAC) share.
 * ENGINEERING CHOICE: elderly + children + outdoor work carry 65% jointly
 * (physiology + exposure-time), housing + cooling access 35% (adaptive capacity).
 */
export const VULNERABILITY_WEIGHTS = {
  elderly: 0.25,
  children: 0.2,
  outdoorWorkers: 0.2,
  informalHousing: 0.2,
  noAC: 0.15,
} as const;

/**
 * Defaults for schema-missing inputs. EVERY use of a default must push the
 * matching flag into `dataQualityFlags` so it reaches the Confidence Score.
 *
 * - elderlyPct: national 60+ share ≈ 8–10% (SRS/Census). Use 0.09.
 * - informalHousingIndex: placeholder 0.30 (30% informal) — replace with
 *   ward/slum survey data when available.
 * - noACShare: placeholder 0.85 (only ~15% household AC/cooler effective
 *   access) — replace with NSSO/state survey data when available.
 */
export const VULNERABILITY_DEFAULTS = {
  elderlyPct: 0.09,
  informalHousingIndex: 0.3,
  noACShare: 0.85,
} as const;

export const VULNERABILITY_FLAGS = {
  elderlyDefault: "elderly_pct_default",
  housingDefault: "informal_housing_default",
  acDefault: "ac_access_default",
  densityFallback: "density_population_proxy",
  utciUnavailable: "utci_unavailable",
  pressureMissing: "pressure_missing",
} as const;

// ---------------------------------------------------------------------------
// Temporal (Persistence + Nighttime Recovery)
// ---------------------------------------------------------------------------

/**
 * Persistence P = f(S_t-1 … S_t-72).
 * ENGINEERING CHOICE (spec leaves f undefined): recency-weighted fraction of
 * hours above threshold. Each hour votes 1 if its thermal score >=
 * PERSISTENCE_THRESHOLD, weighted linearly so the most recent hour counts
 * ~2× the oldest; P = weighted votes / total weight. This rewards sustained
 * AND ongoing heat over a brief spike 3 days ago. Alternatives considered:
 * plain EWMA (less interpretable) and raw count fraction (ignores recency).
 */
export const PERSISTENCE_THRESHOLD = 0.6;

/**
 * Nighttime Recovery: min overnight (00:00–06:00) temp vs comfort threshold.
 * ENGINEERING CHOICE: 25°C comfort ceiling (IMD warm-night ≈ min > 25°C in
 * plains); normalization band 18°C (full recovery) → 32°C (no recovery).
 * Timestamps are interpreted in UTC unless a tz is supplied; document the
 * location's IANA zone and convert before calling when available.
 */
export const NIGHTTIME_RECOVERY = {
  comfortThresholdC: 25,
  minC: 18,
  maxC: 32,
  /** Overnight window, half-open [startHour, endHour) in the given tz. */
  startHour: 0,
  endHour: 6,
} as const;

// ---------------------------------------------------------------------------
// Composite risk
// ---------------------------------------------------------------------------

/** baseRisk = 0.50*T + 0.25*E + 0.25*V; risk = clip(baseRisk + 0.15*P). */
export const COMPOSITE_WEIGHTS = {
  thermal: 0.5,
  exposure: 0.25,
  vulnerability: 0.25,
  persistenceBoost: 0.15,
} as const;

/**
 * Category bands.
 * ENGINEERING CHOICE: the PDF shows only one worked example (0.682 →
 * VERY_HIGH). Bands below place that pin inside VERY_HIGH with margin and
 * keep HIGH meaning "act now" (≥0.50). Recalibrate against outcome data.
 */
export const RISK_CATEGORY_THRESHOLDS = {
  moderateAt: 0.3,
  highAt: 0.5,
  veryHighAt: 0.65,
} as const;

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/**
 * confidence = 0.6*coverage + 0.2*utciFactor + 0.2*vulnerabilityCompleteness
 *  - coverage: present weather rows / expected (72)
 *  - utciFactor: 1 if UTCI available else 0
 *  - vulnerabilityCompleteness: 1 - (defaulted sub-scores / total sub-scores)
 * ENGINEERING CHOICE: coverage dominates because a thin weather window
 * undermines T and P simultaneously.
 */
export const CONFIDENCE_WEIGHTS = {
  coverage: 0.6,
  utci: 0.2,
  vulnerabilityCompleteness: 0.2,
} as const;

/** Total vulnerability sub-scores counted for completeness (elderly, children, outdoor, housing, noAC). */
export const VULNERABILITY_SUB_SCORE_COUNT = 5;
