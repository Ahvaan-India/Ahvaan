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
import {
  computeMortalityBreakdown,
  mortalityBand,
} from "@/lib/heatshield/mortality";

function fmtVal(v: any, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return Number(v).toFixed(decimals);
}

// Back-compat re-export: now delegates to the canonical weighted model
// (35% HI + 25% night + 20% persistence + 20% vulnerability) instead of the
// old buggy 45/25/15/15 that scaled vulnerability 0-100 → always 100.
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
  const breakdown = computeMortalityBreakdown({
    heatIndex: heatIndex ?? 35,
    nighttimeRecovery: nighttimeRecovery ?? 0.5,
    persistence: persistence ?? 0.5,
    vulnerability: vulnerability ?? 0.5,
  });
  const band = breakdown.band;
  let label = "Low Excess Risk";
  let desc = "Baseline mortality rate expected";
  if (breakdown.index >= 80) {
    label = "Extreme";
    desc = "Extreme burden";
  } else if (breakdown.index >= 60) {
    label = "Very high";
    desc = "Very high burden";
  } else if (breakdown.index >= 40) {
    label = "High Excess Risk";
    desc = "High burden";
  } else if (breakdown.index >= 20) {
    label = "Elevated Risk";
    desc = "Elevated burden";
  }
  return { index: breakdown.index, label, band: desc };
}

function mortalityLabel(index: number): string {
  if (index >= 80) return "Extreme";
  if (index >= 60) return "Very high";
  if (index >= 40) return "High";
  if (index >= 20) return "Elevated";
  return "Low";
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
            </CardContent>
          </Card>
          {(() => {
            const r = telemetryRisk;
            if (!r) return null;
            // Prefer board's precomputed mortality (from analysis peak HI, varies per ward) — fixes “fixed at 30” (morning low HI).
            const boardMort = r.mortality && typeof r.mortality.index === "number" ? r.mortality.index : null;
            const idx = boardMort !== null ? boardMort : computeMortalityBreakdown({
              heatIndex: r.heatIndex ?? 35,
              nighttimeRecovery: r.recovery ?? 0.6,
              persistence: r.persistence ?? 0.5,
              vulnerability: r.vulnerability ?? 0.4,
            }).index;
            return (
              <Card>
                <CardContent className="p-3">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <HeartPulse className="h-3 w-3 text-red-500" /> Mortality
                  </p>
                  <p className="text-3xl font-black tabular-nums">
                    {idx}
                    <span className="text-sm font-semibold text-muted-foreground">/100</span>
                  </p>
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
