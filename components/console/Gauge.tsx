"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Metropolitan Heat Load radial gauge: mean metro risk × 100 plus the
 * watch-level badge. Pure display  the level bands live in lib/console.
 */
export function Gauge({
  load,
  watchLabel,
}: {
  load: number | null;
  watchLabel: string;
}) {
  if (load === null || load === undefined) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Metropolitan Heat Load</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </Card>
    );
  }
  const frac = Math.max(0, Math.min(load, 100)) / 100;
  const R = 52;
  const C = 2 * Math.PI * R;
  const color =
    frac >= 0.7
      ? "#991b1b"
      : frac >= 0.5
        ? "#ef4444"
        : frac >= 0.3
          ? "#f97316"
          : "#14b8a6";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Metropolitan Heat Load</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <svg
          width="130"
          height="130"
          viewBox="0 0 130 130"
          role="img"
          aria-label={`Heat load ${load} of 100`}
        >
          <circle
            cx="65"
            cy="65"
            r={R}
            fill="none"
            strokeWidth="12"
            className="stroke-border"
            stroke="currentColor"
            opacity={0.2}
          />
          <circle
            cx="65"
            cy="65"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            transform="rotate(-90 65 65)"
          />
          <text
            x="65"
            y="62"
            textAnchor="middle"
            fontSize="26"
            fontWeight="800"
            fill="currentColor"
          >
            {load}
          </text>
          <text
            x="65"
            y="80"
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            opacity={0.7}
          >
            / 100
          </text>
        </svg>
        <div>
          <span className="rounded bg-orange-600 px-2 py-0.5 text-[11px] font-bold text-white">
            {watchLabel}
          </span>
          <p className="mt-2 text-xs text-muted-foreground">
            Mean ward risk across the metro snapshot set.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
