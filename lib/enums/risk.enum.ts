/**
 * Enterprise Risk Enums & Color Design System Tokens for Ahvaan.
 */

export enum RiskCategory {
  LOW = "LOW",
  MODERATE = "MODERATE",
  HIGH = "HIGH",
  VERY_HIGH = "VERY_HIGH",
  EXTREME = "EXTREME",
}

export type RiskCategoryKey = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";

export const RISK_CATEGORY_THRESHOLDS = {
  moderateAt: 0.3,
  highAt: 0.5,
  veryHighAt: 0.65,
  extremeAt: 0.8,
} as const;

export const RISK_SCALE_FILLS = [
  "#14b8a6", // Step 1: Teal Green (Low)
  "#eab308", // Step 2: Yellow (Moderate)
  "#f97316", // Step 3: Orange (Midpoint)
  "#ef4444", // Step 4: Red (High)
  "#991b1b", // Step 5: Dark Red (Very High / Extreme)
] as const;

export const RISK_CATEGORY_STEP: Record<RiskCategoryKey, number> = {
  LOW: 1,
  MODERATE: 2,
  HIGH: 4,
  VERY_HIGH: 5,
};

export const RISK_FILL_TW: Record<RiskCategoryKey, string> = {
  LOW: "bg-risk-low",
  MODERATE: "bg-risk-moderate",
  HIGH: "bg-risk-high",
  VERY_HIGH: "bg-risk-extreme",
};

export const RISK_ON_FILL_TW: Record<RiskCategoryKey, string> = {
  LOW: "text-white",
  MODERATE: "text-black",
  HIGH: "text-white",
  VERY_HIGH: "text-white",
};

export const RISK_BORDER_TW: Record<RiskCategoryKey, string> = {
  LOW: "border-risk-low",
  MODERATE: "border-risk-moderate",
  HIGH: "border-risk-high",
  VERY_HIGH: "border-risk-extreme",
};

export const RISK_LABELS: Record<RiskCategoryKey, string> = {
  LOW: "Low Risk",
  MODERATE: "Moderate Risk",
  HIGH: "High Risk",
  VERY_HIGH: "Extreme Risk",
};
