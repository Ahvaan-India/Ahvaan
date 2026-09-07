"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function deltaText(d: number | null, basis: string | null): string {
  if (d === null || d === undefined || basis === null) return "—";
  if (d === 0) return `±0 / ${basis}`;
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} / ${basis}`;
}

/**
 * KPI row: ward counts per band, each with a 24h trend delta and a
 * risk-scale accent bar. Null deltas (no snapshot history yet) render "—".
 */
export function KpiRow({
  data,
}: {
  data: {
    active: number;
    extreme: number;
    high: number;
    moderate: number;
    deltas: Record<string, number | null>;
    deltaBasis: string | null;
  } | null;
}) {
  if (!data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 pt-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  const cards = [
    { label: "Active Wards", value: data.active, delta: data.deltas.active, bar: "#f97316" },
    { label: "Extreme Wards", value: data.extreme, delta: data.deltas.extreme, bar: "#991b1b" },
    { label: "High Risk Wards", value: data.high, delta: data.deltas.high, bar: "#ef4444" },
    { label: "Moderate Wards", value: data.moderate, delta: data.deltas.moderate, bar: "#eab308" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="overflow-hidden">
          <div className="h-1.5" style={{ background: c.bar }} aria-hidden />
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tabular-nums">{c.value}</span>
              <span
                className="text-xs tabular-nums text-muted-foreground"
                title={
                  data.deltaBasis
                    ? `Change vs snapshot batch ${data.deltaBasis} ago`
                    : "Needs a second snapshot batch to compute change"
                }
              >
                {deltaText(c.delta, data.deltaBasis)}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
