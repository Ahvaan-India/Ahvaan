/**
 * Single source of truth for the Ahvaan risk-color system.
 * Re-exports and binds design system tokens from risk.enum.ts.
 */

import {
  RiskCategoryKey,
  RISK_CATEGORY_STEP,
  RISK_SCALE_FILLS,
  RISK_FILL_TW,
  RISK_ON_FILL_TW,
  RISK_BORDER_TW,
} from "@/lib/enums/risk.enum";

export {
  RISK_SCALE_FILLS,
  RISK_CATEGORY_STEP,
  RISK_FILL_TW,
  RISK_ON_FILL_TW,
  RISK_BORDER_TW,
};
export type { RiskCategoryKey };

function normalizeCategory(category: string): RiskCategoryKey {
  const key = category === "EXTREME" ? "VERY_HIGH" : category;
  if (
    key === "LOW" ||
    key === "MODERATE" ||
    key === "HIGH" ||
    key === "VERY_HIGH"
  ) {
    return key;
  }
  return "LOW";
}

/** Raw hex fill for a 1–5 scale step (map polygons, recharts). */
export function riskFillForStep(step: number): string {
  const i = Math.min(5, Math.max(1, Math.round(step))) - 1;
  return RISK_SCALE_FILLS[i];
}

/** Raw hex fill for an engine category (or EXTREME severity). */
export function riskFillForCategory(category: string): string {
  return riskFillForStep(RISK_CATEGORY_STEP[normalizeCategory(category)]);
}

export function riskFillTwForCategory(category: string): string {
  return RISK_FILL_TW[normalizeCategory(category)];
}

export function riskOnFillTwForCategory(category: string): string {
  return RISK_ON_FILL_TW[normalizeCategory(category)];
}

/**
 * Tinted panel (subtle bg + matching border, default text) per category.
 * Resolves to the `risk-panel-*` classes defined in globals.css.
 */
export function riskPanelClass(category: string): string {
  switch (normalizeCategory(category)) {
    case "LOW":
      return "risk-panel-low";
    case "MODERATE":
      return "risk-panel-moderate";
    case "HIGH":
      return "risk-panel-high";
    case "VERY_HIGH":
      return "risk-panel-very-high";
  }
}
