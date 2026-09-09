import { clip } from "./thermal";

/**
 * Planning-proxy heat-mortality burden index (0–100).
 *
 * Heuristic composite  NOT fitted to mortality outcomes, NOT a clinical
 * prediction. It encodes textbook heat–health relationships so ops staff get
 * a single burden number next to the risk score:
 *  M = 100 * (0.35*hiSev + 0.25*nightSev + 0.20*persist + 0.20*vuln)
 *  - hiSev:   heat index normalized 27→54°C (NWS caution → extreme danger)
 *  - nightSev: overnight non-recovery 0–1 (hot nights drive excess deaths)
 *  - persist: 72h persistence 0–1 (cumulative burden)
 *  - vuln:     vulnerability 0–1 (elderly/outdoor-worker share)
 * Bands: <20 Minimal, <40 Moderate, <60 High, <80 Very high, ≥80 Extreme.
 */

export type MortalityBand =
  | "Minimal"
  | "Moderate"
  | "High"
  | "Very high"
  | "Extreme";

export const MORTALITY_WEIGHTS = {
  heatIndex: 0.35,
  night: 0.25,
  persistence: 0.2,
  vulnerability: 0.2,
} as const;

export const MORTALITY_HI_BAND = { min: 27, max: 54 } as const;

export function heatIndexSeverity(heatIndexC: number): number {
  return clip(
    (heatIndexC - MORTALITY_HI_BAND.min) /
      (MORTALITY_HI_BAND.max - MORTALITY_HI_BAND.min),
  );
}

export function mortalityBand(index: number): MortalityBand {
  if (index >= 80) return "Extreme";
  if (index >= 60) return "Very high";
  if (index >= 40) return "High";
  if (index >= 20) return "Moderate";
  return "Minimal";
}

export function computeMortalityIndex({
  heatIndex,
  nighttimeRecovery,
  persistence,
  vulnerability,
}: {
  heatIndex: number;
  nighttimeRecovery: number;
  persistence: number;
  vulnerability: number;
}): { index: number; band: MortalityBand } {
  const m =
    MORTALITY_WEIGHTS.heatIndex * heatIndexSeverity(heatIndex) +
    MORTALITY_WEIGHTS.night * clip(nighttimeRecovery) +
    MORTALITY_WEIGHTS.persistence * clip(persistence) +
    MORTALITY_WEIGHTS.vulnerability * clip(vulnerability);
  const index = Math.round(clip(m) * 100);
  return { index, band: mortalityBand(index) };
}
