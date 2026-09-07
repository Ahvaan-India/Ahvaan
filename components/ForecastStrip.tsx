"use client";

import { formatDateInTimezone } from "@/lib/geo/timezone";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface ForecastDay {
  date: string;
  tempMin: number;
  tempMax: number;
  wbgtMax: number;
  heatIndexMax: number;
  thermalStress: number;
  persistence: number;
  risk: number;
  category: string;
  hours: number;
}

/**
 * 5-day upcoming outlook strip. One card per ward-local day with the
 * day's temperature range, peak WBGT/heat-index, and the engine's daily
 * risk + category (same T/E/V/P math, daily-averaged).
 */
export function ForecastStrip({
  days,
  timeZone,
}: {
  days: ForecastDay[];
  timeZone: string;
}) {
  if (days.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 pt-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {days.map((d) => (
        <Card key={d.date} className={`fcard ${d.category}`}>
          <CardContent className="pt-5">
            <strong className="text-sm">
              {formatDateInTimezone(new Date(d.date + "T12:00:00Z"), timeZone)}
            </strong>
            <p className="my-1 text-3xl font-extrabold tracking-tight">
              {d.risk.toFixed(2)}
            </p>
            <Badge variant="secondary" className={`catfg mb-2 ${d.category}`}>
              {d.category}
            </Badge>
            <p className="m-0 text-xs text-muted-foreground">
              {d.tempMin.toFixed(1)}–{d.tempMax.toFixed(1)} °C · WBGT {d.wbgtMax.toFixed(1)} ·
              HI {d.heatIndexMax.toFixed(1)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
