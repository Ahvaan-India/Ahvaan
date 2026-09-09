import {
  DISCLAIMER,
  EXPECTED_WEATHER_ROWS,
  VULNERABILITY_FLAGS,
  WEATHER_WINDOW_HOURS,
} from "./config";
import {
  computeThermalStress,
  heatIndexRothfusz,
  wbgtApprox,
} from "./thermal";
import { computeExposureScore } from "./exposure";
import { computeVulnerabilityScore } from "./vulnerability";
import {
  computeNighttimeRecovery,
  computePersistence,
} from "./temporal";
import { computeCompositeRisk } from "./composite";
import { computeConfidenceScore } from "./confidence";
import { computeMortalityIndex } from "./mortality";
import { computeUTCI, estimateTmrt } from "./utci";
import {
  buildSummary,
  computeTopDrivers,
  WARNINGS,
  WEATHER_SOURCE,
  WEATHER_SOURCE_NOTE,
} from "./explain";
import { SCIENCE_ENGINE_VERSION } from "./config";
import { timezoneForLocation } from "../geo/timezone";
import type { RiskResponse } from "./types";
import type { Location, PopulationRow, WeatherRow } from "../db/schema";
import { DataGapError } from "../db/errors";

/**
 * Pure pipeline: rows in → RiskResponse out. No DB / HTTP inside, so it is
 * unit-testable with fabricated rows. The API routes only fetch + call this.
 *
 * Conventions:
 *  - "Current" indicators (wbgt / heatIndex / utci) come from the LATEST hourly row.
 *  - T (thermal stress) is the latest hour's normalized thermal score; the
 *    full 72h series feeds P (persistence) and R (nighttime recovery).
 *  - UTCI = Ta + Offset(Ta,Tmrt,v10,pa) per Bröde et al. via pythermalcomfort
 *    polynomial. Tmrt is estimated from shortwaveRadiation + wind when
 *    available; flagged as `utci_estimated` in dataQualityFlags so confidence
 *    can penalize it. Never silently treated as 0.
 *  - Surface pressure is logged as missing (formula doesn't need it directly;
 *    pa is derived from RH/Ta via Magnus-Tetens).
 */

export interface PipelineInput {
  location: Location;
  weatherRows: WeatherRow[]; // ascending by timestamp
  population: PopulationRow | null;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function utciForRow(row: WeatherRow): { utci: number | null; available: boolean; estimated: boolean } {
  const Ta = finiteOrNull(row.temperature2m);
  const RH = finiteOrNull(row.relativeHumidity2m);
  const v10 = finiteOrNull(row.windSpeed10m);
  const sr = finiteOrNull(row.shortwaveRadiation);
  if (Ta === null || RH === null) return { utci: null, available: false, estimated: false };
  // Need wind for offset; if missing, use 1 m/s fallback but mark unavailable? Use 1 and keep available false.
  const wind = v10 ?? 1;
  const { tmrt, estimated } = estimateTmrt(Ta, sr ?? 0, wind);
  try {
    const { utci } = computeUTCI(Ta, tmrt, wind, RH);
    if (!Number.isFinite(utci)) return { utci: null, available: false, estimated: false };
    return { utci, available: true, estimated };
  } catch {
    return { utci: null, available: false, estimated: false };
  }
}

export function buildRiskResponse(input: PipelineInput): RiskResponse {
  const { location, weatherRows, population } = input;

  if (!population) {
    throw new DataGapError(
      location.id,
      "no population/census row for this location",
    );
  }

  // Per-hour thermal scores over the window; skip rows missing Ta/RH.
  const hourlyScores: number[] = [];
  const hourlyTemps: number[] = [];
  const hourlyTimes: Date[] = [];
  let anyUtciAvailable = false;
  let anyUtciEstimated = false;

  for (const row of weatherRows) {
    const ta = finiteOrNull(row.temperature2m);
    const rh = finiteOrNull(row.relativeHumidity2m);
    if (ta === null || rh === null) continue;
    const wbgt = wbgtApprox(ta, rh);
    const hi = heatIndexRothfusz(ta, rh);
    const { utci, available, estimated } = utciForRow(row);
    if (available) anyUtciAvailable = true;
    if (estimated) anyUtciEstimated = true;
    const { score } = computeThermalStress({
      wbgt,
      heatIndex: hi,
      utci: utci ?? null,
      utciAvailable: available,
    });
    hourlyScores.push(score);
    hourlyTemps.push(ta);
    if (row.timestamp) hourlyTimes.push(new Date(row.timestamp));
  }

  if (hourlyScores.length === 0) {
    throw new DataGapError(
      location.id,
      "weather rows present but none contain usable temperature2m + relativeHumidity2m",
    );
  }

  // Current indicators from the latest USABLE hour (walk back from the end).
  let latestWbgt = 0;
  let latestHi = 0;
  let latestUtci: number | null = null;
  let latestUtciAvailable = false;
  let latestUtciEstimated = false;
  for (let i = weatherRows.length - 1; i >= 0; i--) {
    const ta = finiteOrNull(weatherRows[i].temperature2m);
    const rh = finiteOrNull(weatherRows[i].relativeHumidity2m);
    if (ta !== null && rh !== null) {
      latestWbgt = wbgtApprox(ta, rh);
      latestHi = heatIndexRothfusz(ta, rh);
      const u = utciForRow(weatherRows[i]);
      latestUtci = u.utci;
      latestUtciAvailable = u.available;
      latestUtciEstimated = u.estimated;
      if (u.available) anyUtciAvailable = true;
      if (u.estimated) anyUtciEstimated = true;
      break;
    }
  }

  const thermal = computeThermalStress({
    wbgt: latestWbgt,
    heatIndex: latestHi,
    utci: latestUtci,
    utciAvailable: latestUtciAvailable,
  });

  const exposure = computeExposureScore(population, location.geometry);
  const vulnerability = computeVulnerabilityScore(population);

  const { timeZone } = timezoneForLocation(location.lat, location.long);
  const persistence = computePersistence(hourlyScores);
  const nighttimeRecovery = computeNighttimeRecovery(hourlyTemps, hourlyTimes, { timeZone });

  const composite = computeCompositeRisk({
    T: thermal.score,
    E: exposure.score,
    V: vulnerability.score,
    P: persistence,
  });

  const utciFlag = anyUtciAvailable
    ? anyUtciEstimated
      ? "utci_estimated"
      : "utci_available"
    : VULNERABILITY_FLAGS.utciUnavailable;
  const dataQualityFlags = Array.from(
    new Set([
      ...vulnerability.flags,
      ...exposure.flags,
      utciFlag,
      ...(latestUtciEstimated ? ["utci_estimated"] : []),
    ]),
  );
  const missingInputs = ["pressure"];

  const confidence = computeConfidenceScore({
    missingInputs,
    dataQualityFlags,
    weatherRowCount: weatherRows.length,
    expectedRowCount: EXPECTED_WEATHER_ROWS,
    utciAvailable: anyUtciAvailable,
  });

  const top_drivers = computeTopDrivers({
    thermalStress: thermal.score,
    exposure: exposure.score,
    vulnerability: vulnerability.score,
    persistence,
    nighttimeRecovery,
    wbgt: latestWbgt,
    heatIndex: latestHi,
    confidence,
  });

  const mortality = computeMortalityIndex({
    heatIndex: latestHi,
    nighttimeRecovery,
    persistence,
    vulnerability: vulnerability.score,
  });

  return {
    locationId: location.id,
    lat: location.lat,
    long: location.long,
    computedAt: new Date().toISOString(),
    indicators: {
      wbgt: round3(latestWbgt),
      heatIndex: round3(latestHi),
      utci: latestUtci !== null ? round3(latestUtci) : null,
      utciAvailable: latestUtciAvailable,
    },
    scores: {
      thermalStress: round3(thermal.score),
      exposure: round3(exposure.score),
      vulnerability: round3(vulnerability.score),
      persistence: round3(persistence),
      nighttimeRecovery: round3(nighttimeRecovery),
    },
    compositeRisk: {
      value: round3(composite.risk),
      category: composite.category,
    },
    mortality,
    confidence: {
      score: round3(confidence),
      dataQualityFlags,
      missingInputs,
    },
    explanation: {
      top_drivers,
      summary: buildSummary(top_drivers, composite.category),
    },
    warnings: [...WARNINGS],
    meta: {
      weather_source: WEATHER_SOURCE,
      source_note: WEATHER_SOURCE_NOTE,
      timezone: timeZone,
      science_engine_version: SCIENCE_ENGINE_VERSION,
    },
    disclaimer: DISCLAIMER,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export { WEATHER_WINDOW_HOURS };
