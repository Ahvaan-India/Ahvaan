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
 * Bands: <20 Minimal, <40 Elevated, <60 High, <80 Very high, ≥80 Extreme. (Moderate removed per product request)
 */

export type MortalityBand =
  | "Minimal"
  | "Elevated"
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
  if (index >= 20) return "Elevated";
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

export interface MortalityBreakdown {
  index: number;
  band: MortalityBand;
  contributions: {
    heatIndex: number; // points 0-35
    night: number; // 0-25
    persistence: number; // 0-20
    vulnerability: number; // 0-20
  };
  severities: {
    hiSev: number; // 0-1
    nightSev: number;
    persistence: number;
    vulnerability: number;
  };
}

/**
 * Weighted breakdown so the UI can show *why* the index is what it is,
 * instead of a flat 100. Normalizes legacy 0-100 inputs (e.g. board's 40
 * instead of 0.4) to 0-1 so old rows don't always clamp to 100.
 */
function toSeverity01(v: number | null | undefined): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  if (v > 1) return clip(v / 100);
  return clip(v);
}

export function computeMortalityBreakdown({
  heatIndex,
  nighttimeRecovery,
  persistence,
  vulnerability,
}: {
  heatIndex: number;
  nighttimeRecovery: number;
  persistence: number;
  vulnerability: number;
}): MortalityBreakdown {
  const hiSev = heatIndexSeverity(heatIndex);
  const nightSev = toSeverity01(nighttimeRecovery);
  const persSev = toSeverity01(persistence);
  const vulnSev = toSeverity01(vulnerability);
  const heatPts = MORTALITY_WEIGHTS.heatIndex * hiSev * 100;
  const nightPts = MORTALITY_WEIGHTS.night * nightSev * 100;
  const persPts = MORTALITY_WEIGHTS.persistence * persSev * 100;
  const vulnPts = MORTALITY_WEIGHTS.vulnerability * vulnSev * 100;
  const index = Math.round(clip((heatPts + nightPts + persPts + vulnPts) / 100) * 100);
  return {
    index,
    band: mortalityBand(index),
    contributions: {
      heatIndex: Math.round(heatPts * 10) / 10,
      night: Math.round(nightPts * 10) / 10,
      persistence: Math.round(persPts * 10) / 10,
      vulnerability: Math.round(vulnPts * 10) / 10,
    },
    severities: {
      hiSev: Math.round(hiSev * 1000) / 1000,
      nightSev: Math.round(nightSev * 1000) / 1000,
      persistence: Math.round(persSev * 1000) / 1000,
      vulnerability: Math.round(vulnSev * 1000) / 1000,
    },
  };
}
