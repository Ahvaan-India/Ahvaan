import { SCIENCE_ENGINE_VERSION } from "./config";

/**
 * Ahvaan explanation engine — top drivers, plain-language summary, warnings.
 * Pure functions, no I/O. Mirrors the LIVE_WEATHER_END_TO_END reference
 * shape (`explanation.top_drivers/summary`, `warnings`) so the UI can render
 * "why is risk HIGH?" without re-implementing thresholds in the frontend.
 *
 * Driver codes (stable strings, safe to switch on in the UI):
 *  PERSISTENT_HEAT, HOT_NIGHT, LOW_RECOVERY, HIGH_THERMAL,
 *  HIGH_EXPOSURE, HIGH_VULNERABILITY, CURRENT_DANGER, LOW_CONFIDENCE
 */

export const WARNINGS: string[] = [
  "UTCI not implemented in this MVP: requires a validated mean-radiant-temperature estimate and regression coefficients; utci is always null and never approximated from radiation.",
  "WBGT uses a shaded/outdoor approximation from air temperature and humidity only; it does not include solar radiation or wind loading.",
];

export const WEATHER_SOURCE = "Open-Meteo" as const;
export const WEATHER_SOURCE_NOTE =
  "Live API/model weather data; not represented as ground-station observations." as const;

export type DriverCode =
  | "PERSISTENT_HEAT"
  | "HOT_NIGHT"
  | "LOW_RECOVERY"
  | "HIGH_THERMAL"
  | "HIGH_EXPOSURE"
  | "HIGH_VULNERABILITY"
  | "CURRENT_DANGER"
  | "LOW_CONFIDENCE";

const DRIVER_PHRASE: Record<DriverCode, string> = {
  PERSISTENT_HEAT: "persistent heat over recent periods",
  HOT_NIGHT: "a hot night with limited cooling",
  LOW_RECOVERY: "poor overnight recovery",
  HIGH_THERMAL: "high current thermal stress",
  HIGH_EXPOSURE: "high population exposure",
  HIGH_VULNERABILITY: "elevated vulnerability",
  CURRENT_DANGER: "dangerous current heat-index conditions",
  LOW_CONFIDENCE: "limited data confidence",
};

export interface DriverInput {
  thermalStress: number;
  exposure: number;
  vulnerability: number;
  persistence: number;
  nighttimeRecovery: number;
  wbgt: number;
  heatIndex: number;
  confidence: number;
}

/**
 * Ranked top drivers (max 3). Each rule is an independent threshold so
 * co-occurring drivers (e.g. HOT_NIGHT + LOW_RECOVERY + PERSISTENT_HEAT,
 * as in the reference fixture) are all reported. Ranked by a fixed
 * severity order, not by input order, for stable UI output.
 */
export function computeTopDrivers(input: DriverInput): DriverCode[] {
  const found: Array<{ code: DriverCode; rank: number }> = [];

  if (input.persistence >= 0.6)
    found.push({ code: "PERSISTENT_HEAT", rank: 1 });
  if (input.nighttimeRecovery >= 0.6)
    found.push({ code: "HOT_NIGHT", rank: 2 });
  if (
    input.nighttimeRecovery >= 0.4 &&
    !found.some((f) => f.code === "HOT_NIGHT")
  )
    found.push({ code: "LOW_RECOVERY", rank: 3 });
  else if (
    input.nighttimeRecovery >= 0.4 &&
    input.persistence >= 0.5 &&
    found.some((f) => f.code === "HOT_NIGHT")
  )
    found.push({ code: "LOW_RECOVERY", rank: 3 });
  if (input.thermalStress >= 0.6)
    found.push({ code: "HIGH_THERMAL", rank: 4 });
  if (input.wbgt >= 32 || input.heatIndex >= 41)
    found.push({ code: "CURRENT_DANGER", rank: 5 });
  if (input.exposure >= 0.6)
    found.push({ code: "HIGH_EXPOSURE", rank: 6 });
  if (input.vulnerability >= 0.4)
    found.push({ code: "HIGH_VULNERABILITY", rank: 7 });
  if (input.confidence < 0.5)
    found.push({ code: "LOW_CONFIDENCE", rank: 8 });

  return found
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .map((f) => f.code);
}

export function buildSummary(
  drivers: DriverCode[],
  category: string,
): string {
  if (drivers.length === 0) {
    return `Risk is ${category.toLowerCase()}: no dominant heat drivers right now; conditions are within typical bounds.`;
  }
  const phrases = drivers.map((d) => DRIVER_PHRASE[d]);
  if (phrases.length === 1) {
    return `Risk is primarily driven by ${phrases[0]}.`;
  }
  const last = phrases[phrases.length - 1];
  const rest = phrases.slice(0, -1).join(", ");
  return `Risk is primarily driven by ${rest} and ${last}.`;
}

export { SCIENCE_ENGINE_VERSION };
