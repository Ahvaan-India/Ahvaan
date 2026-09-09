"use client";

import { Activity, HeartPulse, Thermometer, Users, Wind } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubCard } from "./SubCard";
import { computeMortalityIndex } from "@/lib/heatshield/mortality";
import type { Telemetry } from "./TelemetryPanel";

/**
 * Ward heatmap popover: five sub-cards for the hovered/selected ward.
 * Note: the engine has no mortality model (see disclaimer), so the fifth
 * tile shows the composite risk score  never a fabricated mortality %.
 */
export function WardPopover({ telemetry }: { telemetry: Telemetry | null }) {
  if (!telemetry) {
    return (
      <Card>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Hover or click a ward for its five-parameter snapshot.
        </CardContent>
      </Card>
    );
  }
  const m = telemetry.macro;
  const mortality = telemetry.risk
    ? computeMortalityIndex({
        heatIndex: telemetry.risk.heatIndex,
        nighttimeRecovery: telemetry.risk.recovery,
        persistence: telemetry.risk.persistence,
        vulnerability: telemetry.risk.vulnerability,
      })
    : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {telemetry.ward !== null
            ? `Ward ${telemetry.ward}`
            : `Location ${telemetry.wardId}`}
          {telemetry.risk && (
            <span className="ml-2 tabular-nums text-muted-foreground">
              risk {telemetry.risk.value.toFixed(3)} ·{" "}
              {telemetry.risk.displayCategory}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SubCard
          icon={Thermometer}
          label="Dry Bulb Temp"
          value={m.temp !== null ? m.temp.toFixed(1) : ""}
          unit={m.temp !== null ? "°C" : undefined}
          qualifier={m.qualifiers.temp}
        />
        <SubCard
          icon={Wind}
          label="Real Feel"
          value={m.realFeel !== null ? m.realFeel.toFixed(1) : ""}
          unit={m.realFeel !== null ? "°C" : undefined}
        />
        <SubCard
          icon={Activity}
          label="WBGT"
          value={telemetry.risk ? telemetry.risk.wbgt.toFixed(1) : ""}
          unit={telemetry.risk ? "°C" : undefined}
        />
        <SubCard
          icon={HeartPulse}
          label="Mortality Index"
          value={mortality ? String(mortality.index) : ""}
          unit={mortality ? "/100" : undefined}
          qualifier={mortality?.band ?? null}
        />
        <SubCard
          icon={Users}
          label="Population in Zone"
          value={telemetry.demographics.totalPopulation.toLocaleString("en-IN")}
        />
        <SubCard
          icon={Activity}
          label="Composite Risk"
          value={telemetry.risk ? telemetry.risk.value.toFixed(3) : ""}
          qualifier={telemetry.risk?.displayCategory ?? null}
          qualifierTone={
            telemetry.risk?.displayCategory === "Extreme"
              ? "extreme"
              : telemetry.risk?.displayCategory === "High"
                ? "high"
                : telemetry.risk?.displayCategory === "Moderate"
                  ? "moderate"
                  : telemetry.risk
                    ? "low"
                    : null
          }
        />
      </CardContent>
    </Card>
  );
}
