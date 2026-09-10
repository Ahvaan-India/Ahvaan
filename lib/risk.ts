/**
 * Single source of truth for the Ahvaan risk-color system.
 *
 * Scale (absolute — identical in light and dark mode):
 *   step 1  LOW        teal-green  #14b8a6
 *   step 2  MODERATE   yellow      #eab308
 *   step 3  —          orange      #f97316  (choropleth gradient midpoint only)
 *   step 4  HIGH       red         #ef4444
 *   step 5  VERY_HIGH  dark red    #991b1b  (displayed as "Extreme")
 *
 * Engine categories map to steps 1/2/4/5. Step 3 exists only so the
 * choropleth's continuous riskStep gradient has a midpoint between
 * Moderate-yellow and High-red; no categorical UI ever uses step 3.
 * All Tailwind classes below are full literals so Tailwind can scan them.
 */

export const RISK_SCALE_FILLS = [
  "#14b8a6",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#991b1b",
] as const;

export const RISK_CATEGORY_STEP = {
  LOW: 1,
  MODERATE: 2,
  HIGH: 4,
  VERY_HIGH: 5,
} as const;

export type RiskCategoryKey = keyof typeof RISK_CATEGORY_STEP;

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

/** Solid-fill Tailwind background per engine category. */
export const RISK_FILL_TW: Record<RiskCategoryKey, string> = {
  LOW: "bg-risk-low",
  MODERATE: "bg-risk-moderate",
  HIGH: "bg-risk-high",
  VERY_HIGH: "bg-risk-extreme",
};

/** Readable text color on top of the solid fill above. */
export const RISK_ON_FILL_TW: Record<RiskCategoryKey, string> = {
  LOW: "text-white",
  MODERATE: "text-black",
  HIGH: "text-white",
  VERY_HIGH: "text-white",
};

/** Accent border per engine category. */
export const RISK_BORDER_TW: Record<RiskCategoryKey, string> = {
  LOW: "border-risk-low",
  MODERATE: "border-risk-moderate",
  HIGH: "border-risk-high",
  VERY_HIGH: "border-risk-extreme",
};

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
