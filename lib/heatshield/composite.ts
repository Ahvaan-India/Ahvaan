import {
  COMPOSITE_WEIGHTS,
  RISK_CATEGORY_THRESHOLDS,
} from "./config";
import { clip } from "./thermal";
import type { RiskCategory, RiskInputs } from "./types";

export function categorize(risk: number): RiskCategory {
  if (risk >= RISK_CATEGORY_THRESHOLDS.veryHighAt) return "VERY_HIGH";
  if (risk >= RISK_CATEGORY_THRESHOLDS.highAt) return "HIGH";
  if (risk >= RISK_CATEGORY_THRESHOLDS.moderateAt) return "MODERATE";
  return "LOW";
}

/**
 * Composite risk: baseRisk = 0.50*T + 0.25*E + 0.25*V;
 * risk = clip(baseRisk + 0.15*P, 0, 1).
 * Nighttime Recovery (R) is reported separately for the UI and does NOT
 * enter this formula (spec wires only T/E/V/P into the composite).
 */
export function computeCompositeRisk({
  T,
  E,
  V,
  P,
}: RiskInputs): { risk: number; category: RiskCategory } {
  const baseRisk =
    COMPOSITE_WEIGHTS.thermal * T +
    COMPOSITE_WEIGHTS.exposure * E +
    COMPOSITE_WEIGHTS.vulnerability * V;
  const risk = clip(baseRisk + COMPOSITE_WEIGHTS.persistenceBoost * P, 0, 1);
  return { risk, category: categorize(risk) };
}
