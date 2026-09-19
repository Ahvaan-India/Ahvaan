/**
 * HeatWatch console shared logic (pure, no I/O): watch levels, ops display
 * labels, qualifier bands, and delta helpers.
 */

import { WEATHER_THRESHOLDS, WeatherQualifier } from "@/lib/enums/weather.enum";

/** Ops display label for engine categories (VERY_HIGH reads as Extreme). */
export function displayCategory(category: string): string {
  switch (category) {
    case "VERY_HIGH":
    case "EXTREME":
      return "Extreme";
    case "HIGH":
      return "High";
    case "MODERATE":
      return "Moderate";
    default:
      return "Low";
  }
}

/** Metropolitan watch level from mean metro risk (0–1). */
export function watchLevel(meanRisk: number): { level: number; name: string } {
  if (meanRisk >= 0.7) return { level: 4, name: "Red Watch" };
  if (meanRisk >= 0.5) return { level: 3, name: "Orange Watch" };
  if (meanRisk >= 0.3) return { level: 2, name: "Yellow Watch" };
  return { level: 1, name: "Green Watch" };
}

/** Five-step risk-scale step (1–5) for heatmap fills. */
export function riskStep(risk: number): 1 | 2 | 3 | 4 | 5 {
  if (risk >= 0.8) return 5;
  if (risk >= 0.65) return 4;
  if (risk >= 0.5) return 3;
  if (risk >= 0.3) return 2;
  return 1;
}

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
