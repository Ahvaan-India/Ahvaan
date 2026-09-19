"use client";

import { cn } from "@/lib/utils";
import { riskFillTwForCategory, riskOnFillTwForCategory, RISK_SCALE_FILLS } from "@/lib/risk";

/**
 * Single severity badge used everywhere risk/alarm state appears (alert
 * cards, trajectory, detail header, popover). Small solid fill on the
 * 5-step risk scale  never outlined, never reused for non-risk meaning.
 */
export function RiskBadge({
  category,
  step,
  label,
  className,
}: {
  /** Engine category (LOW/MODERATE/HIGH/VERY_HIGH) or alert severity. */
  category?: string;
  /** 1-5 step matching painted layer polygon color */
  step?: number | null;
  label?: string;
  className?: string;
}) {
  if (step !== undefined && step !== null) {
    const s = Math.min(5, Math.max(1, Math.round(step)));
    const fill = RISK_SCALE_FILLS[s - 1];
    const text =
      label ??
      (s === 1
        ? "Low"
        : s === 2 || s === 3
          ? "Moderate"
          : s === 4
            ? "High"
            : "Extreme");
    const isDarkText = s === 2; // Yellow background gets black text for contrast
    return (
      <span
        className={cn(
          "inline-block rounded px-2 py-0.5 text-[11px] font-bold shadow-xs transition-colors",
          isDarkText ? "text-black" : "text-white",
          className,
        )}
        style={{ backgroundColor: fill }}
      >
        {text}
      </span>
    );
  }

  const catKey = category === "EXTREME" ? "VERY_HIGH" : (category ?? "LOW");
  const text =
    label ??
    (catKey === "VERY_HIGH"
      ? "Extreme"
      : catKey === "HIGH"
        ? "High"
        : catKey === "MODERATE"
          ? "Moderate"
          : "Low");
  return (
    <span
      className={cn(
        "inline-block rounded px-2 py-0.5 text-[11px] font-bold",
        riskFillTwForCategory(catKey),
        riskOnFillTwForCategory(catKey),
        className,
      )}
    >
      {text}
    </span>
  );
}

