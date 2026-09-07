"use client";

import { Droplet, Sun, Users, Wind, Flame, MoonStar, Briefcase, Thermometer, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SubCard } from "./SubCard";
import type { DeltaDir } from "@/lib/console";

export interface DriverDatum {
  humidity: number | null;
  wind: number | null;
  solar: number | null;
  elderlyPct: number | null;
  childrenPct: number | null;
  thermal: number | null;
  persistence: number | null;
  recovery: number | null;
  outdoorWorkerPct: number | null;
  humidityDelta: DeltaDir;
  windDelta: DeltaDir;
  solarDelta: DeltaDir;
}

function clip01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function Arrow({ dir }: { dir: DeltaDir }) {
  if (dir === "up") return <TrendingUp className="h-3.5 w-3.5 text-red-500" aria-label="rising" />;
  if (dir === "down") return <TrendingDown className="h-3.5 w-3.5 text-teal-600" aria-label="falling" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-label="steady" />;
}

/**
 * Risk Attribution Drivers as four sub-cards. Each shows the live value, a
 * directional delta vs 24h ago, and a relative LOAD bar.
 *
 * NOTE (honesty): load is a documented per-driver severity normalization
 * (see code), NOT a fitted % attribution of the composite — true driver
 * attribution needs a sensitivity analysis pass (future work).
 */
export function DriversPanel({ data }: { data: DriverDatum | null }) {
  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Risk Attribution Drivers</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const demoLoad =
    data.elderlyPct !== null || data.childrenPct !== null
      ? clip01(((data.elderlyPct ?? 0) + (data.childrenPct ?? 0)) / 0.3)
      : null;

  const cards = [
    {
      icon: Thermometer,
      label: "Thermal Stress",
      value: data.thermal !== null ? data.thermal.toFixed(2) : "—",
      unit: undefined,
      load: data.thermal,
      delta: "flat" as DeltaDir,
    },
    {
      icon: Flame,
      label: "Heat Persistence",
      value: data.persistence !== null ? data.persistence.toFixed(2) : "—",
      unit: undefined,
      load: data.persistence,
      delta: "flat" as DeltaDir,
    },
    {
      icon: MoonStar,
      label: "Night Non-Recovery",
      value: data.recovery !== null ? data.recovery.toFixed(2) : "—",
      unit: undefined,
      load: data.recovery,
      delta: "flat" as DeltaDir,
    },
    {
      icon: Briefcase,
      label: "Outdoor Workers",
      value: data.outdoorWorkerPct !== null ? `${(data.outdoorWorkerPct * 100).toFixed(1)}%` : "—",
      unit: undefined,
      load: data.outdoorWorkerPct,
      delta: "flat" as DeltaDir,
    },
    {
      icon: Droplet,
      label: "Relative Humidity",
      value: data.humidity !== null ? data.humidity.toFixed(0) : "—",
      unit: data.humidity !== null ? "%" : undefined,
      load: data.humidity !== null ? clip01((data.humidity - 30) / 70) : null,
      delta: data.humidityDelta,
    },
    {
      icon: Wind,
      label: "Surface Wind",
      value: data.wind !== null ? data.wind.toFixed(1) : "—",
      unit: data.wind !== null ? "m/s" : undefined,
      // still air traps heat: load is inverse of ventilation
      load: data.wind !== null ? 1 - clip01(data.wind / 6) : null,
      delta: data.windDelta,
    },
    {
      icon: Sun,
      label: "Solar Irradiance",
      value: data.solar !== null ? data.solar.toFixed(0) : "—",
      unit: data.solar !== null ? "W/m²" : undefined,
      load: data.solar !== null ? clip01(data.solar / 1000) : null,
      delta: data.solarDelta,
    },
    {
      icon: Users,
      label: "Vulnerable Demography",
      value:
        data.elderlyPct !== null
          ? `${(data.elderlyPct * 100).toFixed(1)}% 60+`
          : "—",
      unit: undefined,
      load: demoLoad,
      delta: "flat" as DeltaDir,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Risk Attribution Drivers</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <SubCard
            key={c.label}
            icon={c.icon}
            label={c.label}
            value={c.value}
            unit={c.unit}
            footer={
              <div className="mt-2 flex items-center gap-1.5">
                <Arrow dir={c.delta} />
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
                  title={c.load !== null ? `Relative load ${(c.load * 100).toFixed(0)}%` : "No data"}
                >
                  {c.load !== null && (
                    <div
                      className="h-full rounded-full bg-orange-500"
                      style={{ width: `${Math.round(c.load * 100)}%` }}
                    />
                  )}
                </div>
              </div>
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}
