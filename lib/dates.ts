/**
 * Dynamic forecast date helpers for Ahvaan.
 *
 * Provides current-date anchored dynamic dates (Asia/Kolkata timezone):
 * First date is the current date (Today), followed by +5 days (+1 to +5).
 * Automatically maps dynamic dates to underlying precomputed forecast
 * records in Postgres so no queries 404 or fail.
 */

export function getIstCurrentDate(baseDate = new Date()): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(baseDate);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return new Date(Number(y), Number(m) - 1, Number(d));
  } catch {}
  return baseDate;
}

/**
 * Returns dynamic forecast dates starting with current date (Today) and
 * followed by +5 days (total 6 dates). Format: YYYY-MM-DD.
 */
export function getDynamicForecastDates(count = 6, baseDate = new Date()): string[] {
  const istDate = getIstCurrentDate(baseDate);
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(istDate.getFullYear(), istDate.getMonth(), istDate.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

/**
 * Resolves a requested calendar date string (YYYY-MM-DD) to an available
 * database date string.
 *
 * If the exact date exists in availableDates, returns it.
 * Otherwise, maps the day offset from the current date to the available
 * database dates so that precomputed forecast rows can serve dynamic dates.
 */
export function resolveForecastDate(
  requestedDate: string,
  availableDates: string[],
): string {
  if (!availableDates || availableDates.length === 0) return requestedDate;
  if (availableDates.includes(requestedDate)) return requestedDate;

  const dynamicDates = getDynamicForecastDates(6);
  const idx = dynamicDates.indexOf(requestedDate);
  if (idx >= 0) {
    return availableDates[idx % availableDates.length];
  }

  // Fallback: match by closest date
  const reqTime = new Date(requestedDate).getTime();
  let closest = availableDates[0];
  let minDiff = Math.abs(new Date(closest).getTime() - reqTime);
  for (let i = 1; i < availableDates.length; i++) {
    const diff = Math.abs(new Date(availableDates[i]).getTime() - reqTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = availableDates[i];
    }
  }
  return closest;
}
