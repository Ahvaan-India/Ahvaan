/**
 * Frontend alert evaluation — client-side alert generation using modular enums.
 */

import { RISK_CATEGORY_THRESHOLDS } from "./heatshield/config";
import {
  AlertLevel,
  ALERT_LEVEL_RANK,
  ALERT_ADVISORY_TEMPLATES,
} from "@/lib/enums/alert.enum";
import { WEATHER_THRESHOLDS } from "@/lib/enums/weather.enum";
import type { AlertInput, WardAlert } from "@/lib/types/domain";

export type { AlertLevel, AlertInput, WardAlert };

export function maxLevel(...levels: AlertLevel[]): AlertLevel {
  return levels.reduce(
    (a, b) => (ALERT_LEVEL_RANK[b] > ALERT_LEVEL_RANK[a] ? b : a),
    AlertLevel.LOW,
  );
}

/** Presentation bands for the HTSI prototype index (0–100). */
export function htsiBand(htsi: number): AlertLevel {
  if (htsi >= WEATHER_THRESHOLDS.htsi.extreme) return AlertLevel.EXTREME;
  if (htsi >= WEATHER_THRESHOLDS.htsi.high) return AlertLevel.HIGH;
  if (htsi >= WEATHER_THRESHOLDS.htsi.moderate) return AlertLevel.MODERATE;
  return AlertLevel.LOW;
}

/** WBGT display bands (°C). */
export function wbgtBand(wbgt: number): AlertLevel {
  if (wbgt >= WEATHER_THRESHOLDS.wbgt.extreme) return AlertLevel.EXTREME;
  if (wbgt >= WEATHER_THRESHOLDS.wbgt.high) return AlertLevel.HIGH;
  if (wbgt >= WEATHER_THRESHOLDS.wbgt.moderate) return AlertLevel.MODERATE;
  return AlertLevel.LOW;
}

/** Heat-index display bands (°C, NWS danger bands). */
export function heatIndexBand(hi: number): AlertLevel {
  if (hi >= WEATHER_THRESHOLDS.heatIndex.extreme) return AlertLevel.EXTREME;
  if (hi >= WEATHER_THRESHOLDS.heatIndex.high) return AlertLevel.HIGH;
  if (hi >= WEATHER_THRESHOLDS.heatIndex.moderate) return AlertLevel.MODERATE;
  return AlertLevel.LOW;
}

/** Composite-risk bands (heatshield engine thresholds). */
export function compositeBand(risk: number): AlertLevel {
  if (risk >= RISK_CATEGORY_THRESHOLDS.veryHighAt) return AlertLevel.EXTREME;
  if (risk >= RISK_CATEGORY_THRESHOLDS.highAt) return AlertLevel.HIGH;
  if (risk >= RISK_CATEGORY_THRESHOLDS.moderateAt) return AlertLevel.MODERATE;
  return AlertLevel.LOW;
}

export function advisoryFor(level: AlertLevel, wardLabel: string): string {
  const tmpl = ALERT_ADVISORY_TEMPLATES[level] ?? ALERT_ADVISORY_TEMPLATES[AlertLevel.LOW];
  return tmpl(wardLabel);
}

export function evaluateWardAlert(
  input: AlertInput,
  wardLabel: string,
): WardAlert {
  const triggers: string[] = [];
  const levels: AlertLevel[] = [];

  if (typeof input.riskScore === "number" && Number.isFinite(input.riskScore)) {
    const b = compositeBand(input.riskScore);
    levels.push(b);
    if (ALERT_LEVEL_RANK[b] >= ALERT_LEVEL_RANK[AlertLevel.HIGH])
      triggers.push(`Composite risk ${(input.riskScore * 100).toFixed(0)}/100 (${b})`);
  }
  if (typeof input.htsiMax === "number" && Number.isFinite(input.htsiMax)) {
    const b = htsiBand(input.htsiMax);
    levels.push(b);
    if (ALERT_LEVEL_RANK[b] >= ALERT_LEVEL_RANK[AlertLevel.HIGH])
      triggers.push(`Engine HTSI ${input.htsiMax.toFixed(0)}/100 (${b})`);
  }
  if (typeof input.wbgtMax === "number" && Number.isFinite(input.wbgtMax)) {
    const b = wbgtBand(input.wbgtMax);
    levels.push(b);
    if (ALERT_LEVEL_RANK[b] >= ALERT_LEVEL_RANK[AlertLevel.HIGH])
      triggers.push(`WBGT ${input.wbgtMax.toFixed(1)}°C (${b})`);
  }
  if (
    typeof input.heatIndexMax === "number" &&
    Number.isFinite(input.heatIndexMax)
  ) {
    const b = heatIndexBand(input.heatIndexMax);
    levels.push(b);
    if (ALERT_LEVEL_RANK[b] >= ALERT_LEVEL_RANK[AlertLevel.HIGH])
      triggers.push(`Heat index ${input.heatIndexMax.toFixed(1)}°C (${b})`);
  }

  if (levels.length === 0) {
    return {
      level: AlertLevel.LOW,
      triggers: ["insufficient data for evaluation"],
      headline: `${wardLabel} · LOW (no data)`,
      advisory: advisoryFor(AlertLevel.LOW, wardLabel),
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
