/**
 * Ahvaan  ward-aware timezone utilities.
 *
 * Kolkata-only deployment: every ward resolves to Asia/Kolkata (UTC+5:30,
 * no DST). The helpers are written generally so a future multi-city rollout
 * only needs a lookup table, not new call sites:
 *  - timezoneForWard() → IANA zone for a ward/location
 *  - formatInTimezone() → Intl-based formatting (no date-fns needed)
 *  - kolkataDayKey() → YYYY-MM-DD grouping key for 5-day forecast buckets
 */

export const KOLKATA_TIMEZONE = "Asia/Kolkata" as const;

/** Kolkata Municipal Corporation bbox (generous, degrees). */
export const KOLKATA_BBOX = {
  minLat: 22.4,
  maxLat: 22.7,
  minLong: 88.2,
  maxLong: 88.55,
} as const;

export function isInKolkata(lat: number, lon: number): boolean {
  return (
    lat >= KOLKATA_BBOX.minLat &&
    lat <= KOLKATA_BBOX.maxLat &&
    lon >= KOLKATA_BBOX.minLong &&
    lon <= KOLKATA_BBOX.maxLong
  );
}

/**
 * IANA timezone for a ward/location. Kolkata wards → Asia/Kolkata.
 * Fallback for out-of-area points: nearest whole-hour Etc/GMT zone from
 * longitude (documented approximation, flagged in UI via `isEstimated`).
 */
export function timezoneForLocation(
  lat: number,
  lon: number,
): { timeZone: string; isEstimated: boolean } {
  if (isInKolkata(lat, lon)) {
    return { timeZone: KOLKATA_TIMEZONE, isEstimated: false };
  }
  const hours = Math.round(lon / 15);
  const sign = hours <= 0 ? "+" : "-"; // Etc/GMT signs are inverted
  return { timeZone: `Etc/GMT${sign}${Math.abs(hours)}`, isEstimated: true };
}

/** Thin wrapper: ward rows carry lat/long, so ward tz == location tz. */
export function timezoneForWard(ward: { lat: number; long: number }): {
  timeZone: string;
  isEstimated: boolean;
} {
  return timezoneForLocation(ward.lat, ward.long);
}

export function formatInTimezone(
  date: Date,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    ...opts,
  }).format(date);
}

export function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/**
 * Local-day bucket key (YYYY-MM-DD in the ward's timezone) for grouping
 * forecast hours into 5 daily cards. Uses en-CA (ISO order) parts.
 */
export function localDayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** UTC offset label (e.g. "UTC+5:30") for the location bar. */
export function utcOffsetLabel(
  timeZone: string,
  at: Date = new Date(),
): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const asUTC = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
  const diffMin = Math.round((asUTC - at.getTime()) / 60000);
  const sign = diffMin < 0 ? "-" : "+";
  const abs = Math.abs(diffMin);
  const hh = String(Math.floor(abs / 60));
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}
