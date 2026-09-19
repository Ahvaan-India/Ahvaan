"use client";

import {
  Thermometer,
  Droplet,
  Wind,
  Sun,
  Users,
  Flame,
  Activity,
  HeartPulse,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SubCard } from "@/components/console/SubCard";
import { METRIC_EXPLANATIONS } from "@/lib/enums/weather.enum";
import {
  displayCategory,
  qualifyTemp,
  qualifyHumidity,
  qualifyWind,
  qualifySolar,
} from "@/lib/console";

function fmtVal(v: any, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return Number(v).toFixed(decimals);
}

export function computeMortalityIndex({
  heatIndex,
  nighttimeRecovery,
  persistence,
  vulnerability,
}: {
  heatIndex?: number | null;
  nighttimeRecovery?: number | null;
  persistence?: number | null;
  vulnerability?: number | null;
}): { index: number; label: string; band: string } {
  const hi = heatIndex ?? 35;
  const nr = nighttimeRecovery ?? 0.5;
  const p = persistence ?? 0.5;
  const v = vulnerability ?? 0.5;

  const baseRisk = Math.max(0, (hi - 27) / 25);
  const rawIndex =
    (baseRisk * 0.45 + (1 - nr) * 0.25 + p * 0.15 + v * 0.15) * 100;
  const index = Math.min(100, Math.max(0, Math.round(rawIndex)));

  let label = "Low Excess Risk";
  let band = "Baseline mortality rate expected";
  if (index >= 75) {
    label = "Severe Mortality Surge";
    band = "Estimated +35-50% excess heat mortality";
  } else if (index >= 50) {
    label = "High Excess Risk";
    band = "Estimated +15-34% excess heat mortality";
  } else if (index >= 25) {
    label = "Moderate Risk";
    band = "Estimated +5-14% excess heat mortality";
  }

  return { index, label, band };
}

interface WardMetricsGridProps {
  htsiVal: number | null;
  wbgtVal: number | null;
  hiVal: number | null;
  utciVal: number | null;
  exposureVal: number | null;
  tempVal: number | null;
  humidityVal: number | null;
  windVal: number | null;
  solarVal: number | null;
  vulnVal: number | null;
  totalPopulation: number | null;
  telemetryRisk: any;
  wbgtSim: number;
  hiSim: number;
  wbgtSource: string;
  hiSource: string;
}

export function WardMetricsGrid({
  htsiVal,
  wbgtVal,
  hiVal,
  utciVal,
  exposureVal,
  tempVal,
  humidityVal,
  windVal,
  solarVal,
  vulnVal,
  totalPopulation,
  telemetryRisk,
  wbgtSim,
  hiSim,
  wbgtSource,
  hiSource,
}: WardMetricsGridProps) {
  return (
    <div className="space-y-5">
      {/* HTSI & Mortality */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          HTSI & Mortality
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Card className="overflow-hidden border-2 border-primary/20 shadow-sm">
            <div className="h-2 bg-gradient-to-r from-teal-500 via-orange-500 to-red-600" />
            <CardContent className="p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Flame className="h-3 w-3 text-red-500" /> HTSI
              </p>
              <p className="text-3xl font-black tabular-nums">
                {htsiVal !== null ? htsiVal.toFixed(2) : "-"}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {htsiVal !== null
                  ? htsiVal >= 80
                    ? "Extreme Thermal Stress"
                    : htsiVal >= 60
                      ? "High Thermal Stress"
                      : htsiVal >= 30
                        ? "Moderate Thermal Stress"
                        : "Low Thermal Stress"
                  : (telemetryRisk?.displayCategory ?? "")}
              </p>
            </CardContent>
          </Card>
          {(() => {
            const r = telemetryRisk;
            if (!r) return null;
            const mort = computeMortalityIndex({
              heatIndex: r.heatIndex,
              nighttimeRecovery: r.recovery,
              persistence: r.persistence,
              vulnerability: r.vulnerability,
            });
            return (
              <Card>
                <CardContent className="p-3">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <HeartPulse className="h-3 w-3 text-green-500" /> Mortality
                  </p>
                  <p className="text-3xl font-black tabular-nums">
                    {mort.index}
                    <span className="text-sm font-semibold text-muted-foreground">
                      /100
                    </span>
                  </p>
                  <p className="text-xs font-semibold text-foreground">
                    {mort.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{mort.band}</p>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      </div>

      {/* Heat Metrics */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          Heat Metrics
        </p>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Thermometer}
            label="WBGT"
            value={fmtVal(wbgtVal, 1)}
            unit="°C"
            tooltip={METRIC_EXPLANATIONS.wbgt}
            accuracyBadge={{
              value: `${wbgtSim}%`,
              tooltip: `Cross-model accuracy check: comparing Ahvaan calculations with ${wbgtSource} to verify accuracy.`,
            }}
          />
          <SubCard
            icon={Flame}
            label="Heat Index"
            value={fmtVal(hiVal, 1)}
            unit="°C"
            tooltip={METRIC_EXPLANATIONS.heatIndex}
            accuracyBadge={{
              value: `${hiSim}%`,
              tooltip: `Cross-model accuracy check: comparing Ahvaan calculations with ${hiSource} to verify accuracy.`,
            }}
          />
          <SubCard
            icon={Sun}
            label="UTCI"
            value={fmtVal(utciVal, 1)}
            unit="°C"
            tooltip={METRIC_EXPLANATIONS.utci}
          />
          <SubCard
            icon={Activity}
            label="Exposure Index"
            value={fmtVal(exposureVal, 2)}
            tooltip={METRIC_EXPLANATIONS.exposure}
          />
        </div>
      </div>

      {/* Microclimate Parameters */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          Microclimate Parameters
        </p>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Thermometer}
            label="Temperature"
            value={fmtVal(tempVal, 1)}
            unit="°C"
            qualifier={typeof tempVal === "number" ? qualifyTemp(tempVal) : undefined}
          />
          <SubCard
            icon={Droplet}
            label="Humidity"
            value={fmtVal(humidityVal, 0)}
            unit="%"
            qualifier={typeof humidityVal === "number" ? qualifyHumidity(humidityVal) : undefined}
          />
          <SubCard
            icon={Wind}
            label="Wind Speed"
            value={fmtVal(windVal, 1)}
            unit=" m/s"
            qualifier={typeof windVal === "number" ? qualifyWind(windVal) : undefined}
          />
          <SubCard
            icon={Sun}
            label="Solar Radiation"
            value={fmtVal(solarVal, 0)}
            unit=" W/m²"
            qualifier={typeof solarVal === "number" ? qualifySolar(solarVal) : undefined}
          />
        </div>
      </div>

      {/* Demographics & Vulnerability */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          Demographics & Sensitivity
        </p>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Users}
            label="Total Population"
            value={totalPopulation ? totalPopulation.toLocaleString() : "-"}
            tooltip="Official ward population census baseline"
          />
          <SubCard
            icon={Activity}
            label="Vulnerability Index"
            value={fmtVal(vulnVal, 2)}
            qualifier={
              typeof vulnVal === "number"
                ? vulnVal >= 0.7
                  ? "High"
                  : vulnVal >= 0.4
                    ? "Moderate"
                    : "Low"
                : undefined
            }
            tooltip={METRIC_EXPLANATIONS.vulnerability}
          />
        </div>
      </div>
    </div>
  );
}
