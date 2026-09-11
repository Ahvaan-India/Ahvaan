"use client";

import { cn } from "@/lib/utils";
import { riskFillTwForCategory, riskOnFillTwForCategory } from "@/lib/risk";

/**
 * Single severity badge used everywhere risk/alarm state appears (alert
 * cards, trajectory, detail header, popover). Small solid fill on the
 * 5-step risk scale  never outlined, never reused for non-risk meaning.
 */
export function RiskBadge({
  category,
  label,
  className,
}: {
  /** Engine category (LOW/MODERATE/HIGH/VERY_HIGH) or alert severity. */
  category: string;
  label?: string;
  className?: string;
}) {
  const key = category === "EXTREME" ? "VERY_HIGH" : category;
  const text =
    label ??
    (key === "VERY_HIGH"
      ? "Extreme"
      : key === "HIGH"
        ? "High"
        : key === "MODERATE"
          ? "Moderate"
          : "Low");
  return (
    <span
      className={cn(
        "inline-block rounded px-2 py-0.5 text-[11px] font-bold",
        riskFillTwForCategory(category),
        riskOnFillTwForCategory(category),
        className,
      )}
    >
      {text}
    </span>
  );
}
