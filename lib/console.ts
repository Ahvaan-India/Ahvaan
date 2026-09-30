/**
 * Console shared logic (pure, no I/O): qualifier bands for raw forecast
 * readings. There is no local risk engine — indices arrive precomputed from
 * the backend service; these helpers only label direct measurements.
 */

import { WEATHER_THRESHOLDS, WeatherQualifier } from "@/lib/enums/weather.enum";

/** Qualifier badge text for macro readings (documented comfort bands). */
export function qualifyHumidity(rh: number): string {
  if (rh >= WEATHER_THRESHOLDS.humidity.veryHigh) return WeatherQualifier.VERY_HIGH;
  if (rh >= WEATHER_THRESHOLDS.humidity.elevated) return WeatherQualifier.ELEVATED;
  if (rh >= WEATHER_THRESHOLDS.humidity.moderate) return WeatherQualifier.MODERATE;
  return WeatherQualifier.LOW;
}

export function qualifyWind(ms: number): string {
  if (ms < WEATHER_THRESHOLDS.wind.moderate) return WeatherQualifier.LOW;
  if (ms < WEATHER_THRESHOLDS.wind.breezy) return WeatherQualifier.MODERATE;
  return WeatherQualifier.BREEZY;
}

export function qualifySolar(wm2: number): string {
  if (wm2 >= WEATHER_THRESHOLDS.solar.extreme) return WeatherQualifier.EXTREME;
  if (wm2 >= WEATHER_THRESHOLDS.solar.high) return WeatherQualifier.HIGH;
  if (wm2 >= WEATHER_THRESHOLDS.solar.moderate) return WeatherQualifier.MODERATE;
  return WeatherQualifier.LOW;
}

export function qualifyTemp(c: number): string {
  if (c >= WEATHER_THRESHOLDS.temperature.extreme) return WeatherQualifier.EXTREME;
  if (c >= WEATHER_THRESHOLDS.temperature.high) return WeatherQualifier.HIGH;
  if (c >= WEATHER_THRESHOLDS.temperature.elevated) return WeatherQualifier.ELEVATED;
  return WeatherQualifier.MODERATE;
}

export type DeltaDir = "up" | "down" | "flat";

/** Directional delta vs a prior reading (for driver arrows). */
export function deltaDir(current: number, prior: number | null, eps = 1e-9): DeltaDir {
  if (prior === null || !Number.isFinite(prior)) return "flat";
  if (current > prior + eps) return "up";
  if (current < prior - eps) return "down";
  return "flat";
}
