/**
 * Shared Ahvaan types. Framework-agnostic: no DB / HTTP imports allowed.
 */

export type RiskCategory = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";

export interface RiskInputs {
  T: number;
  E: number;
  V: number;
  P: number;
}

export interface ThermalStressInput {
  wbgt: number;
  heatIndex: number;
  utci: number | null;
  utciAvailable: boolean;
}

export interface VulnerabilityResult {
  score: number;
  /** 0–1 sub-scores for transparency / debugging. */
  components: {
    elderly: number;
    children: number;
    outdoorWorkers: number;
    informalHousing: number;
    noAC: number;
  };
  /** Flags for confidence.dataQualityFlags. */
  flags: string[];
}

export interface ConfidenceInput {
  missingInputs: string[];
  dataQualityFlags: string[];
  weatherRowCount: number;
  expectedRowCount: number;
  utciAvailable: boolean;
}

export type RiskResponse = {
  locationId: number;
  lat: number;
  long: number;
  computedAt: string;
  indicators: {
    wbgt: number;
    heatIndex: number;
    utci: number | null;
    utciAvailable: boolean;
  };
  scores: {
    thermalStress: number;
    exposure: number;
    vulnerability: number;
    persistence: number;
    nighttimeRecovery: number;
  };
  compositeRisk: {
    value: number;
    category: RiskCategory;
  };
  mortality: {
    /** Planning-proxy burden index 0–100 (heuristic, not a fitted model). */
    index: number;
    band: string;
  };
  confidence: {
    score: number;
    dataQualityFlags: string[];
    missingInputs: string[];
  };
  explanation: {
    top_drivers: string[];
    summary: string;
  };
  warnings: string[];
  meta: {
    weather_source: string;
    source_note: string;
    timezone: string;
    science_engine_version: string;
  };
  disclaimer: "MVP decision-support index, not a validated clinical mortality prediction model. Score does not represent a statistical probability of an adverse outcome.";
};
