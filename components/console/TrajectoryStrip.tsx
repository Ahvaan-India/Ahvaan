"use client";

import { formatDateInTimezone } from "@/lib/geo/timezone";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskBadge } from "./RiskBadge";
import { cn } from "@/lib/utils";

export interface TrajectoryDay {
  date: string;
  tempMin: number;
  tempMax: number;
  heatIndexMax: number;
  risk: number;
  category: string;
  mortality?: { index: number; band: string };
}

/** Ops status language for trajectory cards. */
export function trajectoryStatus(category: string): string {
  switch (category) {
    case "VERY_HIGH":
      return "Extreme";
    case "HIGH":
      return "High Heat Alert";
    case "MODERATE":
      return "Elevated";
    default:
      return "Moderate";
  }
}

/**
 * 5-Day Predictive Heat Trajectory strip. Today is outlined/elevated;
 * each card shows date, high/low, heat index, risk score, status badge.
 */
export function TrajectoryStrip({
  days,
  timeZone,
}: {
  days: TrajectoryDay[];
  timeZone: string;
}) {
  if (days.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 pt-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {days.map((d, i) => (
        <Card
          key={d.date}
          className={cn(i === 0 && "border-2 border-primary shadow-md")}
        >
          <CardContent className="pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {i === 0 ? "Today · " : ""}
              {formatDateInTimezone(new Date(d.date + "T12:00:00Z"), timeZone)}
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">
              {d.tempMax.toFixed(0)}°<span className="text-base font-semibold text-muted-foreground">/{d.tempMin.toFixed(0)}°</span>
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              HI {d.heatIndexMax.toFixed(1)}°C · risk {(d.risk * 100).toFixed(0)}/100
            </p>
            {d.mortality && (
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                Mortality {d.mortality.index}/100 · {d.mortality.band}
              </p>
            )}
            <div className="mt-2">
              <RiskBadge category={d.category} label={trajectoryStatus(d.category)} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
