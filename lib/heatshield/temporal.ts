import {
  NIGHTTIME_RECOVERY,
  PERSISTENCE_THRESHOLD,
} from "./config";
import { clip } from "./thermal";

/**
 * Temporal dynamics. Pure functions — no I/O.
 *
 * NOTE on spec gap: the PDF states P = f(S_t-1 … S_t-72) without specifying
 * f. The implementation below is an ENGINEERING CHOICE (see config.ts):
 * recency-weighted fraction of hours above threshold. It is documented,
 * tested for edge cases, and easy to swap once the spec clarifies f.
 */

/**
 * Persistence 0–1: recency-weighted fraction of hourly thermal scores at or
 * above threshold. Weights rise linearly 1..N so the most recent hour counts
 * N× the oldest. Empty input → 0 (no evidence of persistence).
 */
export function computePersistence(
  hourlyThermalScores: number[],
  threshold: number = PERSISTENCE_THRESHOLD,
): number {
  if (hourlyThermalScores.length === 0) return 0;
  let weightedVotes = 0;
  let totalWeight = 0;
  for (let i = 0; i < hourlyThermalScores.length; i++) {
    const weight = i + 1; // oldest = 1 … newest = N
    totalWeight += weight;
    if (hourlyThermalScores[i] >= threshold) weightedVotes += weight;
  }
  return clip(weightedVotes / totalWeight);
}

/**
 * Nighttime Recovery 0–1 where 1 = worst recovery (hottest nights, highest
 * risk contribution) and 0 = full recovery (cool nights).
 *
 * Procedure: group readings by UTC calendar day, take the min temperature
 * observed in [startHour, endHour) per night, average those minima across
 * nights, then normalize against the comfort band. Returns 0 when no
 * overnight readings exist (no evidence of failed recovery — flagged by the
 * caller via row-coverage confidence, not by inventing heat).
 *
 * Pass timestamps in the location's local zone when known; otherwise UTC is
 * assumed and documented as an approximation.
 */
export function computeNighttimeRecovery(
  hourlyTemps: number[],
  hourlyTimestamps: Date[],
  opts: {
    comfortThresholdC?: number;
    minC?: number;
    maxC?: number;
    startHour?: number;
    endHour?: number;
  } = {},
): number {
  const {
    minC = NIGHTTIME_RECOVERY.minC,
    maxC = NIGHTTIME_RECOVERY.maxC,
    startHour = NIGHTTIME_RECOVERY.startHour,
    endHour = NIGHTTIME_RECOVERY.endHour,
  } = opts;

  if (hourlyTemps.length === 0 || hourlyTimestamps.length === 0) return 0;
  const n = Math.min(hourlyTemps.length, hourlyTimestamps.length);

  const nightlyMin = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const ts = hourlyTimestamps[i];
    const hour = ts.getUTCHours();
    if (hour < startHour || hour >= endHour) continue;
    const dayKey = `${ts.getUTCFullYear()}-${ts.getUTCMonth()}-${ts.getUTCDate()}`;
    const prev = nightlyMin.get(dayKey);
    const t = hourlyTemps[i];
    if (!Number.isFinite(t)) continue;
    if (prev === undefined || t < prev) nightlyMin.set(dayKey, t);
  }

  if (nightlyMin.size === 0) return 0;
  const vals = Array.from(nightlyMin.values());
  const avgMin = vals.reduce((a, b) => a + b, 0) / vals.length;
  return clip((avgMin - minC) / (maxC - minC));
}
