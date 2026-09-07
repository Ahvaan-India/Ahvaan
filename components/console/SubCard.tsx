"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Parameter sub-card: one parameter per tile — label, big tabular value +
 * unit, optional qualifier badge, fixed icon. Used by every parameter group
 * (popover, drivers, telemetry) so panels scan at a glance.
 */
export function SubCard({
  icon: Icon,
  label,
  value,
  unit,
  qualifier,
  qualifierTone,
  footer,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  qualifier?: string | null;
  qualifierTone?: "low" | "moderate" | "high" | "extreme" | null;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span>{label}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {qualifier && (
        <span
          className={cn(
            "mt-1.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold",
            qualifierTone === "low" && "bg-teal-500/15 text-teal-700 dark:text-teal-300",
            qualifierTone === "moderate" && "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300",
            qualifierTone === "high" && "bg-orange-500/20 text-orange-800 dark:text-orange-300",
            qualifierTone === "extreme" && "bg-red-600/15 text-red-800 dark:text-red-300",
            !qualifierTone && "bg-secondary text-secondary-foreground",
          )}
        >
          {qualifier}
        </span>
      )}
      {footer}
    </div>
  );
}
