"use client";

import {
  Droplet,
  Sun,
  Thermometer,
  Users,
  Wind,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SubCard } from "./SubCard";
import { METRIC_EXPLANATIONS } from "@/lib/enums/weather.enum";
import type { DeltaDir } from "@/lib/console";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

export interface Telemetry {
  wardId: number;
  ward: number | null;
  wardName: string | null;
  timezone: string;
  risk: {
    value: number;
    category: string;
    displayCategory: string;
    thermal: number;
    exposure: number;
    vulnerability: number;
    persistence: number;
    recovery: number;
    wbgt: number;
    heatIndex: number;
    utci: number | null;
    confidence: number;
    computedAt: string;
  } | null;
  macro: {
    temp: number | null;
    realFeel: number | null;
    humidity: number | null;
    wind: number | null;
    solar: number | null;
    timestamp: string | null;
    qualifiers: {
      temp: string | null;
      humidity: string | null;
      wind: string | null;
      solar: string | null;
    };
    deltas: {
      temp: DeltaDir;
      humidity: DeltaDir;
      wind: DeltaDir;
      solar: DeltaDir;
    };
  };
  demographics: {
    totalPopulation: number;
  };
}

function toneFor(
  qualifier: string | null,
): "low" | "moderate" | "high" | "extreme" | null {
  if (!qualifier) return null;
  const q = qualifier.toLowerCase();
  if (q.includes("extreme") || q.includes("very high")) return "extreme";
  if (q.includes("high") || q.includes("elevated")) return "high";
  if (q.includes("moderate")) return "moderate";
  return "low";
}

function Arrow({ dir }: { dir: DeltaDir }) {
  if (dir === "up")
    return (
      <TrendingUp
        className="h-3.5 w-3.5 text-red-500"
        aria-label="rising vs 24h ago"
      />
    );
  if (dir === "down")
    return (
      <TrendingDown
        className="h-3.5 w-3.5 text-teal-600"
        aria-label="falling vs 24h ago"
      />
    );
  return (
    <Minus
      className="h-3.5 w-3.5 text-muted-foreground"
      aria-label="steady vs 24h ago"
    />
  );
}

function download(filename: string, mime: string, text: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(data: Telemetry): string {
  const rows: Array<[string, string]> = [
    ["wardId", String(data.wardId)],
    ["ward", data.ward !== null ? String(data.ward) : ""],
    ["wardName", data.wardName ?? ""],
    ["timezone", data.timezone],
    ["readingAt", data.macro.timestamp ?? ""],
    ["tempC", data.macro.temp !== null ? String(data.macro.temp) : ""],
    [
      "realFeelC",
      data.macro.realFeel !== null ? String(data.macro.realFeel) : "",
    ],
    [
      "humidityPct",
      data.macro.humidity !== null ? String(data.macro.humidity) : "",
    ],
    ["windMs", data.macro.wind !== null ? String(data.macro.wind) : ""],
    ["solarWm2", data.macro.solar !== null ? String(data.macro.solar) : ""],
    ["risk", data.risk ? String(data.risk.value) : ""],
    ["riskCategory", data.risk?.category ?? ""],
    ["totalPopulation", String(data.demographics.totalPopulation)],
  ];
  const esc = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return ["metric,value", ...rows.map(([k, v]) => `${k},${esc(v)}`)].join("\n");
}

/**
 * Ward Telemetry & Microclimate Profile: macro readings as qualifier
 * sub-cards with 24h deltas, plus a demographic snapshot sub-card
 * (defaults flagged, never silent). Alert history was removed with the ops
 * tables — alerts are evaluated client-side (lib/alerts.ts) instead.
 */
export function TelemetryPanel({
  data,
  forecastDays,
}: {
  data: Telemetry | null;
  forecastDays?: Array<{
    date: string;
    risk: number;
    category: string;
    tempMin: number;
    tempMax: number;
  }>;
}) {
  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Ward Telemetry & Microclimate Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const m = data.macro;
  const d = data.demographics;
  const ts = m.timestamp
    ? new Date(m.timestamp).toLocaleString("en-IN", { timeZone: data.timezone })
    : "";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base">
            Ward Telemetry & Microclimate Profile{" "}
            {data.ward !== null
              ? `Ward ${data.ward}`
              : `Location ${data.wardId}`}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Reading at {ts} ({data.timezone})
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              download(
                `telemetry-ward-${data.ward ?? data.wardId}.json`,
                "application/json",
                JSON.stringify(
                  { ...data, forecast: forecastDays ?? [] },
                  null,
                  2,
                ),
              )
            }
          >
            <Download /> JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              download(
                `telemetry-ward-${data.ward ?? data.wardId}.csv`,
                "text/csv",
                toCSV(data),
              )
            }
          >
            <Download /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Macro-Environmental Readings
          </h3>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <SubCard
              icon={Thermometer}
              label="Dry Bulb Temp"
              value={m.temp !== null ? m.temp.toFixed(1) : ""}
              unit={m.temp !== null ? "°C" : undefined}
              qualifier={m.qualifiers.temp}
              qualifierTone={toneFor(m.qualifiers.temp)}
              tooltip={METRIC_EXPLANATIONS.thermal}
              footer={
                <span className="mt-1.5 inline-flex">
                  <Arrow dir={m.deltas.temp} />
                </span>
              }
            />
            <SubCard
              icon={Droplet}
              label="Relative Humidity"
              value={m.humidity !== null ? m.humidity.toFixed(0) : ""}
              unit={m.humidity !== null ? "%" : undefined}
              qualifier={m.qualifiers.humidity}
              qualifierTone={toneFor(m.qualifiers.humidity)}
              tooltip="Relative Humidity (%): Percentage of moisture in air compared to maximum saturation."
              footer={
                <span className="mt-1.5 inline-flex">
                  <Arrow dir={m.deltas.humidity} />
                </span>
              }
            />
            <SubCard
              icon={Wind}
              label="Wind Velocity"
              value={m.wind !== null ? m.wind.toFixed(1) : ""}
              unit={m.wind !== null ? "m/s" : undefined}
              qualifier={m.qualifiers.wind ? `${m.qualifiers.wind}` : null}
              qualifierTone={toneFor(m.qualifiers.wind)}
              tooltip="Wind Speed (m/s): Higher air movement enhances convective heat dissipation."
              footer={
                <span className="mt-1.5 inline-flex">
                  <Arrow dir={m.deltas.wind} />
                </span>
              }
            />
            <SubCard
              icon={Sun}
              label="Solar Irradiance"
              value={m.solar !== null ? m.solar.toFixed(0) : ""}
              unit={m.solar !== null ? "W/m²" : undefined}
              qualifier={m.qualifiers.solar}
              qualifierTone={toneFor(m.qualifiers.solar)}
              tooltip="Shortwave Solar Radiation (W/m²): Direct solar heat flux load."
              footer={
                <span className="mt-1.5 inline-flex">
                  <Arrow dir={m.deltas.solar} />
                </span>
              }
            />
          </div>
          {m.realFeel !== null && (
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              “Real Feel” apparent temperature: {m.realFeel.toFixed(1)} °C
              (model field, not engine-derived)
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Demographics
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <SubCard
              icon={Users}
              label="Total Population"
              value={d.totalPopulation.toLocaleString("en-IN")}
              tooltip={METRIC_EXPLANATIONS.exposure}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
