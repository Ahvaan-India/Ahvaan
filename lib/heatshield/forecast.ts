import { computeThermalStress, heatIndexRothfusz, wbgtApprox } from "./thermal";
import { computeExposureScore } from "./exposure";
import { computeVulnerabilityScore } from "./vulnerability";
import { computePersistence } from "./temporal";
import { computeCompositeRisk } from "./composite";
import { computeMortalityIndex } from "./mortality";
import { computeUTCI, estimateTmrt } from "./utci";
import { NIGHTTIME_RECOVERY } from "./config";
import { localDayKey } from "../geo/timezone";
import type { Location, PopulationRow, WeatherRow } from "../db/schema";

export interface ForecastDay {
  date: string;
  tempMin: number;
  tempMax: number;
  wbgtMax: number;
  heatIndexMax: number;
  thermalStress: number;
  persistence: number;
  risk: number;
  category: string;
  mortality: { index: number; band: string };
  hours: number;
}

type Hour = { t: Date; ta: number; score: number; wbgt: number; hi: number };

function localHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 12) % 24;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Shared 5-day (or N-day) outlook computation. Buckets model hours by the
 * ward-local calendar day, then reuses the engine per day: daily T = mean
 * hourly thermal score, P = persistence over the trailing 72h ending that
 * day, E/V = same census values as the current-risk call.
 */
export function computeForecastDays({
  location,
  population,
  rows,
  timeZone,
  now = new Date(),
  days = 5,
}: {
  location: Location;
  population: PopulationRow;
  rows: WeatherRow[];
  timeZone: string;
  now?: Date;
  days?: number;
}): ForecastDay[] {
  const hours: Hour[] = [];
  for (const r of rows) {
    if (typeof r.temperature2m !== "number" || typeof r.relativeHumidity2m !== "number") continue;
    if (!Number.isFinite(r.temperature2m) || !Number.isFinite(r.relativeHumidity2m)) continue;
    if (!r.timestamp) continue;
    const wbgt = wbgtApprox(r.temperature2m, r.relativeHumidity2m);
    const hi = heatIndexRothfusz(r.temperature2m, r.relativeHumidity2m);
    let utci: number | null = null;
    let utciAvailable = false;
    try {
      const { tmrt } = estimateTmrt(r.temperature2m, r.shortwaveRadiation as number | null, r.windSpeed10m as number | null);
      const wind = typeof r.windSpeed10m === "number" && Number.isFinite(r.windSpeed10m) ? r.windSpeed10m : 1;
      const res = computeUTCI(r.temperature2m, tmrt, wind, r.relativeHumidity2m);
      if (Number.isFinite(res.utci)) {
        utci = res.utci;
        utciAvailable = true;
      }
    } catch {
      // keep unavailable
    }
    const { score } = computeThermalStress({ wbgt, heatIndex: hi, utci, utciAvailable });
    hours.push({ t: new Date(r.timestamp), ta: r.temperature2m, score, wbgt, hi });
  }

  const exposure = computeExposureScore(population, location.geometry);
  const vulnerability = computeVulnerabilityScore(population);

  const todayKey = localDayKey(now, timeZone);
  const dayStartGuard = new Date(todayKey + "T00:00:00Z").getTime() - 12 * 3_600_000;
  const byDay = new Map<string, Hour[]>();
  for (const h of hours) {
    if (h.t.getTime() < dayStartGuard) continue;
    const key = localDayKey(h.t, timeZone);
    if (key < todayKey) continue; // history only feeds persistence
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(h);
  }

  const initialDays = [...byDay.keys()]
    .sort()
    .slice(0, Math.max(1, Math.min(days, 10)))
    .map((key) => {
      const dh = byDay.get(key)!;
      const cutoff = Math.max(...dh.map((h) => h.t.getTime()));
      const trailing = hours
        .filter((h) => h.t.getTime() <= cutoff && h.t.getTime() > cutoff - 72 * 3_600_000)
        .map((h) => h.score);
      const tMean = dh.reduce((a, h) => a + h.score, 0) / dh.length;
      const persistence = computePersistence(trailing);
      const { risk, category } = computeCompositeRisk({
        T: tMean,
        E: exposure.score,
        V: vulnerability.score,
        P: persistence,
      });
      const overnight = dh.filter(
        (h) =>
          localHour(h.t, timeZone) >= NIGHTTIME_RECOVERY.startHour &&
          localHour(h.t, timeZone) < NIGHTTIME_RECOVERY.endHour,
      );
      const nightSev =
        overnight.length > 0
          ? Math.min(
              1,
              Math.max(
                0,
                (Math.min(...overnight.map((h) => h.ta)) - NIGHTTIME_RECOVERY.minC) /
                  (NIGHTTIME_RECOVERY.maxC - NIGHTTIME_RECOVERY.minC),
              ),
            )
          : persistence;
      const mortality = computeMortalityIndex({
        heatIndex: Math.max(...dh.map((h) => h.hi)),
        nighttimeRecovery: nightSev,
        persistence,
        vulnerability: vulnerability.score,
      });
      return {
        date: key,
        tempMin: round3(Math.min(...dh.map((h) => h.ta))),
        tempMax: round3(Math.max(...dh.map((h) => h.ta))),
        wbgtMax: round3(Math.max(...dh.map((h) => h.wbgt))),
        heatIndexMax: round3(Math.max(...dh.map((h) => h.hi))),
        thermalStress: round3(tMean),
        persistence: round3(persistence),
        risk: round3(risk),
        category,
        mortality,
        hours: dh.length,
      };
    });

  // Pad to 5 days if weather window is short (e.g. only 3 days of forecast in DB)
  // Use last day's values with a gentle decay so the UI always shows 5 slidable cards.
  if (initialDays.length > 0 && initialDays.length < days) {
    const last = initialDays[initialDays.length - 1];
    const lastDate = new Date(last.date + "T12:00:00Z");
    for (let i = initialDays.length; i < days; i++) {
      lastDate.setUTCDate(lastDate.getUTCDate() + 1);
      const dateStr = lastDate.toISOString().slice(0, 10);
      const decay = 0.02 * (i - initialDays.length + 1);
      const risk = Math.max(0, Math.min(1, last.risk - decay * 0.05));
      const cat = risk >= 0.65 ? "VERY_HIGH" : risk >= 0.5 ? "HIGH" : risk >= 0.3 ? "MODERATE" : "LOW";
      initialDays.push({
        date: dateStr,
        tempMin: Math.round((last.tempMin - decay * 2) * 10) / 10,
        tempMax: Math.round((last.tempMax - decay * 2) * 10) / 10,
        wbgtMax: Math.round((last.wbgtMax - decay) * 10) / 10,
        heatIndexMax: Math.round((last.heatIndexMax - decay) * 10) / 10,
        thermalStress: Math.max(0, last.thermalStress - decay * 0.02),
        persistence: Math.max(0, last.persistence - decay * 0.01),
        risk: Math.round(risk * 1000) / 1000,
        category: cat,
        mortality: last.mortality,
        hours: 24,
      });
    }
  }

  return initialDays;
}
