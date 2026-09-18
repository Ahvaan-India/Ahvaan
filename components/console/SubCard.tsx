"use client";

import type { LucideIcon } from "lucide-react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Parameter sub-card with optional contextual tooltip explainer.
 */
export function SubCard({
  icon: Icon,
  label,
  value,
  unit,
  qualifier,
  qualifierTone,
  tooltip,
  footer,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  qualifier?: string | null;
  qualifierTone?: "low" | "moderate" | "high" | "extreme" | null;
  tooltip?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between gap-1.5 text-xs font-semibold text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </div>
        {tooltip && (
          <div className="group/tooltip relative shrink-0">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors hover:text-primary cursor-help" />
            <div className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-48 rounded-lg border bg-popover p-2 text-[11px] font-normal leading-tight text-popover-foreground shadow-lg group-hover/tooltip:block sm:w-56">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1">
        <span className="text-2xl font-bold tabular-nums tracking-tight">{value}</span>
        {unit && <span className="text-xs font-medium text-muted-foreground">{unit}</span>}
      </div>
      {qualifier && (
        <span
          className={cn(
            "mt-1.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
            qualifierTone === "low" &&
              "bg-teal-500/15 text-teal-700 dark:text-teal-300",
            qualifierTone === "moderate" &&
              "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300",
            qualifierTone === "high" &&
              "bg-orange-500/20 text-orange-800 dark:text-orange-300",
            qualifierTone === "extreme" &&
              "bg-red-600/15 text-red-800 dark:text-red-300",
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
