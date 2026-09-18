/**
 * Frontend alert evaluation — NO database, NO saving.
 *
 * The operator's browser already holds everything needed (composite risk +
 * precomputed engine indexes from /api/risk, /api/showcase, /api/heatmap).
 * This module turns those numbers into an alert level + triggers +
 * advisory text, entirely client-side. Nothing is written anywhere; if the
 * operator wants to notify someone, the email modal sends one email.
 *
 * Thresholds are DISPLAY thresholds (documented below), not validated
 * clinical predictions:
 *  - Composite risk bands come from the heatshield engine config
 *    (RISK_CATEGORY_THRESHOLDS: 0.30 / 0.50 / 0.65).
 *  - HTSI bands are presentation bands for the upstream prototype index
 *    (0–100). They move with the HTSI formula when it is finalized.
 *  - WBGT bands follow common occupational heat-stress practice
 *    (moderate ≥28, high ≥30, extreme ≥32.5 °C).
 *  - Heat-index bands follow NWS danger bands
 *    (caution ≥32, danger ≥41, extreme danger ≥54 °C).
 */

import { RISK_CATEGORY_THRESHOLDS } from "./heatshield/config";

export type AlertLevel = "LOW" | "MODERATE" | "HIGH" | "EXTREME";

const RANK: Record<AlertLevel, number> = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  EXTREME: 3,
};

export function maxLevel(...levels: AlertLevel[]): AlertLevel {
  return levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "LOW" as AlertLevel);
}

/** Presentation bands for the upstream HTSI prototype index (0–100). */
export function htsiBand(htsi: number): AlertLevel {
  if (htsi >= 80) return "EXTREME";
  if (htsi >= 60) return "HIGH";
  if (htsi >= 40) return "MODERATE";
  return "LOW";
}

/** WBGT display bands (°C). */
export function wbgtBand(wbgt: number): AlertLevel {
  if (wbgt >= 32.5) return "EXTREME";
  if (wbgt >= 30) return "HIGH";
  if (wbgt >= 28) return "MODERATE";
  return "LOW";
}

/** Heat-index display bands (°C, NWS danger bands). */
export function heatIndexBand(hi: number): AlertLevel {
  if (hi >= 54) return "EXTREME";
  if (hi >= 41) return "HIGH";
  if (hi >= 32) return "MODERATE";
  return "LOW";
}

/** Composite-risk bands (heatshield engine thresholds). */
export function compositeBand(risk: number): AlertLevel {
  if (risk >= RISK_CATEGORY_THRESHOLDS.veryHighAt) return "EXTREME";
  if (risk >= RISK_CATEGORY_THRESHOLDS.highAt) return "HIGH";
  if (risk >= RISK_CATEGORY_THRESHOLDS.moderateAt) return "MODERATE";
  return "LOW";
}

export interface AlertInput {
  riskScore?: number | null;
  category?: string | null;
  htsiMax?: number | null;
  wbgtMax?: number | null;
  heatIndexMax?: number | null;
}

export interface WardAlert {
  level: AlertLevel;
  triggers: string[];
  headline: string;
  advisory: string;
}

export function advisoryFor(level: AlertLevel, wardLabel: string): string {
  switch (level) {
    case "EXTREME":
      return `${wardLabel}: extreme heat. Deploy shade/water stations at market zones; open cooling shelters; check elderly hourly; alert hospitals.`;
    case "HIGH":
      return `${wardLabel}: high heat. Limit 12–4pm outdoor work; ensure water/shade; monitor vulnerable residents; reschedule non-essential activity.`;
    case "MODERATE":
      return `${wardLabel}: moderate heat. Stay hydrated, take breaks, watch for heat symptoms.`;
    default:
      return `${wardLabel}: low heat. Normal activities, stay aware.`;
  }
}

/**
 * Evaluate one ward from whatever the frontend already fetched.
 * Missing inputs are skipped (never treated as zero); with no usable
 * inputs the level is LOW with an explicit "insufficient data" trigger.
 */
export function evaluateWardAlert(
  input: AlertInput,
  wardLabel: string,
): WardAlert {
  const triggers: string[] = [];
  const levels: AlertLevel[] = [];

  if (typeof input.riskScore === "number" && Number.isFinite(input.riskScore)) {
    const b = compositeBand(input.riskScore);
    levels.push(b);
    if (RANK[b] >= RANK.HIGH)
      triggers.push(`Composite risk ${(input.riskScore * 100).toFixed(0)}/100 (${b})`);
  }
  if (typeof input.htsiMax === "number" && Number.isFinite(input.htsiMax)) {
    const b = htsiBand(input.htsiMax);
    levels.push(b);
    if (RANK[b] >= RANK.HIGH)
      triggers.push(`Engine HTSI ${input.htsiMax.toFixed(0)}/100 (${b})`);
  }
  if (typeof input.wbgtMax === "number" && Number.isFinite(input.wbgtMax)) {
    const b = wbgtBand(input.wbgtMax);
    levels.push(b);
    if (RANK[b] >= RANK.HIGH)
      triggers.push(`WBGT ${input.wbgtMax.toFixed(1)}°C (${b})`);
  }
  if (
    typeof input.heatIndexMax === "number" &&
    Number.isFinite(input.heatIndexMax)
  ) {
    const b = heatIndexBand(input.heatIndexMax);
    levels.push(b);
    if (RANK[b] >= RANK.HIGH)
      triggers.push(`Heat index ${input.heatIndexMax.toFixed(1)}°C (${b})`);
  }

  if (levels.length === 0) {
    return {
      level: "LOW",
      triggers: ["insufficient data for evaluation"],
      headline: `${wardLabel} · LOW (no data)`,
      advisory: advisoryFor("LOW", wardLabel),
    };
  }

  const level = maxLevel(...levels);
  return {
    level,
    triggers,
    headline: `${wardLabel} · ${level}`,
    advisory: advisoryFor(level, wardLabel),
  };
}
