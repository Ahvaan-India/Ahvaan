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
 * Normalize a PG `date` value to YYYY-MM-DD. The pg driver returns a
 * UTC-midnight Date at runtime (drizzle types it as string), and JSON
 * round-trips through Redis turn Dates into ISO strings — all three shapes
 * collapse to the same day key here.
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

/**
 * Parse a live `weather.timestamp` value into the true UTC instant.
 * The column is `timestamp without time zone` holding IST wall clock
 * ("2026-09-24 23:00:00"); plain `new Date(str)` is HOST-DEPENDENT for such
 * strings (IST laptop vs UTC server differ by 5.5h), so always go through
 * here. Date inputs pass through untouched.
 */
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

/**
 * Format a true instant as an IST wall-clock string for naive-column
 * comparisons (`timestamp` cols compare deterministically wall-to-wall,
 * independent of the DB session time zone).
 */
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

/** Stored HTSI for one hour. Older engine rows lack HTSI → null (never computed here). */
export function storedHtsi(entry: AnalysisHourEntry): number | null {
  const v = (entry.analysis as { HTSI?: unknown }).HTSI;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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
  if (entries.length === 0) {
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
    const a = e.analysis;
    const htsi = storedHtsi(e);
    if (htsi !== null) {
      htsiSum += htsi;
      htsiCount++;
      if (htsi > htsiMax) {
        htsiMax = htsi;
        peakHour = e.hour;
      }
    }
    if (a.WBGT > wbgtMax) {
      wbgtMax = a.WBGT;
      peakWbgtHour = e.hour;
    }
    if (a.HI > hiMax) hiMax = a.HI;
    if (a.UTCI > utciMax) utciMax = a.UTCI;
  }
  return {
    hours: entries.length,
    htsiMax: htsiCount > 0 ? Number(htsiMax.toFixed(2)) : null,
    htsiMean: htsiCount > 0 ? Number((htsiSum / htsiCount).toFixed(2)) : null,
    wbgtMax: Number(wbgtMax.toFixed(2)),
    heatIndexMax: Number(hiMax.toFixed(2)),
    utciMax: Number(utciMax.toFixed(2)),
    peakHour: peakHour ?? peakWbgtHour,
  };
}

export const HTSI_PROTOTYPE_NOTE =
  "HTSI (0–100) is an upstream engine prototype. Displayed only where the engine stored it; older analysis rows predate HTSI and show null." as const;
