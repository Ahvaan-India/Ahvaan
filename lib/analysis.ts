/**
 * Fetch-only read helpers for the precomputed `analysis` table.
 *
 * This project does NOT calculate thermal indices — the engine pipeline
 * (Ahvaan-India/Ahvaan `ahvaan-engine`) computes WBGT/HI/UTCI/WBT/HTSI and
 * stores one row per (locationId, forecastDate) with 24 hourly entries.
 * Everything here only reads, normalizes date shapes, and presents stored
 * values. No science, no formulas.
 */

import type { AnalysisHourEntry } from "./db/schema";

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDateString(v: string, name: string): void {
  if (typeof v !== "string" || !DATE_RE.test(v)) {
    throw new Error(`${name} must be in YYYY-MM-DD format.`);
  }
}

/** "YYYY-MM-DD" in Asia/Kolkata for a given instant (default now). */
export function istDateString(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function addDays(dateStr: string, days: number): string {
  assertDateString(dateStr, "date");
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Normalize a PG `date` value to YYYY-MM-DD.
 */
export function toISODate(v: string | Date | unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    if (DATE_RE.test(v)) return v;
    const d = new Date(v);
    if (!Number.isNaN(+d)) return d.toISOString().slice(0, 10);
  }
  return String(v);
}

/** Current IST wall-clock instant (for "current hour" pointers). */
export function istNow(): Date {
  return new Date(Date.now());
}

export function parseISTWall(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/.exec(
      value,
    );
  if (!m) return new Date(value);
  const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0;
  return new Date(
    Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0), ms) -
      IST_OFFSET_MS,
  );
}

export function toISTWall(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
}

export function currentIstHourLabel(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
  }).format(at);
  return `${parts}:00:00`;
}

export { IST_OFFSET_MS };

/** Extract all metrics from an hourly analysis entry regardless of key casing */
export function getAnalysisMetrics(e: any) {
  const a = (e?.analysis ?? {}) as Record<string, unknown>;
  const inp = (e?.input ?? {}) as Record<string, unknown>;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const htsi = num(a.HTSI ?? a.htsi);
  const wbgt = num(a.WBGT ?? a.wbgt);
  const hi = num(a.HI ?? a.hi);
  const utci = num(a.UTCI ?? a.utci);
  const wbt = num(a.WBT ?? a.wbt);

  const temp = num(inp.temperature2m ?? inp.temp ?? inp.temperature);
  const humidity = num(inp.relativeHumidity2m ?? inp.humidity ?? inp.rh);
  const wind = num(inp.windSpeed10m ?? inp.wind ?? inp.wind_speed);
  const solar = num(inp.shortwaveRadiation ?? inp.solar ?? inp.solar_radiation);
  const realFeel = num(inp.apparentTemperature ?? inp.realFeel ?? inp.apparent_temperature);

  return { htsi, wbgt, hi, utci, wbt, temp, humidity, wind, solar, realFeel };
}

/** Stored HTSI for one hour. */
export function storedHtsi(entry: AnalysisHourEntry): number | null {
  return getAnalysisMetrics(entry).htsi;
}

export interface DaySummary {
  hours: number;
  htsiMax: number | null;
  htsiMean: number | null;
  wbgtMax: number | null;
  heatIndexMax: number | null;
  utciMax: number | null;
  peakHour: string | null;
}

/** Presentational rollup of stored hourly values (max/mean of what is stored). */
export function summarizeDayAnalysis(entries: AnalysisHourEntry[]): DaySummary {
  if (!entries || entries.length === 0) {
    return {
      hours: 0,
      htsiMax: null,
      htsiMean: null,
      wbgtMax: null,
      heatIndexMax: null,
      utciMax: null,
      peakHour: null,
    };
  }
  let htsiMax = -Infinity;
  let htsiSum = 0;
  let htsiCount = 0;
  let wbgtMax = -Infinity;
  let hiMax = -Infinity;
  let utciMax = -Infinity;
  let peakHour: string | null = null;
  let peakWbgtHour: string | null = null;

  for (const e of entries) {
    const { htsi, wbgt, hi, utci } = getAnalysisMetrics(e);
    if (htsi !== null) {
      htsiSum += htsi;
      htsiCount++;
      if (htsi > htsiMax) {
        htsiMax = htsi;
        peakHour = e.hour;
      }
    }
    if (wbgt !== null && wbgt > wbgtMax) {
      wbgtMax = wbgt;
      peakWbgtHour = e.hour;
    }
    if (hi !== null && hi > hiMax) hiMax = hi;
    if (utci !== null && utci > utciMax) utciMax = utci;
  }

  return {
    hours: entries.length,
    htsiMax: htsiCount > 0 ? Number(htsiMax.toFixed(2)) : null,
    htsiMean: htsiCount > 0 ? Number((htsiSum / htsiCount).toFixed(2)) : null,
    wbgtMax: Number.isFinite(wbgtMax) ? Number(wbgtMax.toFixed(2)) : null,
    heatIndexMax: Number.isFinite(hiMax) ? Number(hiMax.toFixed(2)) : null,
    utciMax: Number.isFinite(utciMax) ? Number(utciMax.toFixed(2)) : null,
    peakHour: peakHour ?? peakWbgtHour,
  };
}

export const HTSI_PROTOTYPE_NOTE =
  "HTSI (0–100) is an upstream engine prototype. Displayed only where the engine stored it; older analysis rows predate HTSI and show null." as const;
