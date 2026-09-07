/**
 * HeatWatch console shared logic (pure, no I/O): watch levels, ops display
 * labels, qualifier bands, and delta helpers. Visual color tokens for the
 * 5-step risk scale live in the frontend; severity ordering lives here so
 * API + UI agree.
 */

/** Ops display label for engine categories (VERY_HIGH reads as Extreme). */
export function displayCategory(category: string): string {
  switch (category) {
    case "VERY_HIGH":
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
  if (rh >= 85) return "Very high";
  if (rh >= 70) return "Elevated";
  if (rh >= 40) return "Moderate";
  return "Low";
}

export function qualifyWind(ms: number): string {
  if (ms < 1.5) return "Low";
  if (ms < 4) return "Moderate";
  return "Breezy";
}

export function qualifySolar(wm2: number): string {
  if (wm2 >= 600) return "Extreme";
  if (wm2 >= 400) return "High";
  if (wm2 >= 150) return "Moderate";
  return "Low";
}

export function qualifyTemp(c: number): string {
  if (c >= 40) return "Extreme";
  if (c >= 35) return "High";
  if (c >= 30) return "Elevated";
  return "Moderate";
}

/** Categorical settlement density from the informal-housing index (0–1). */
export function settlementDensity(idx: number): "Low" | "Medium" | "High" {
  if (idx >= 0.5) return "High";
  if (idx >= 0.25) return "Medium";
  return "Low";
}

export type DeltaDir = "up" | "down" | "flat";

/** Directional delta vs a prior reading (for driver arrows). */
export function deltaDir(current: number, prior: number | null, eps = 1e-9): DeltaDir {
  if (prior === null || !Number.isFinite(prior)) return "flat";
  if (current > prior + eps) return "up";
  if (current < prior - eps) return "down";
  return "flat";
}
