"use client";

import type { RiskResponse } from "@/lib/heatshield/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskBadge } from "@/components/console/RiskBadge";
import { AlertTriangle, Thermometer } from "lucide-react";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-border py-1 last:border-0">
      <span className="text-sm text-muted-foreground">{k}</span>
      <strong className="text-sm">{v}</strong>
    </div>
  );
}

/**
 * Full parameter panel for the selected ward: indicators, all five
 * sub-scores, composite risk, why-summary (top drivers), data warnings,
 * and confidence/quality flags. Renders every field the engine returns so
 * nothing important stays hidden in the JSON.
 */
export function RiskDetail({
  risk,
  wardLabel,
}: {
  risk: RiskResponse | null;
  wardLabel: string;
}) {
  if (!risk) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{wardLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {wardLabel}
          <RiskBadge category={risk.compositeRisk.category} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-5xl font-extrabold tracking-tight">
          {risk.compositeRisk.value.toFixed(3)}
        </p>

        <p className="mt-3 text-sm">
          <strong>Why:</strong> {risk.explanation.summary}
        </p>
      {risk.explanation.top_drivers.length > 0 && (
        <div className="mt-2">
          {risk.explanation.top_drivers.map((d) => (
            <Badge key={d} variant="secondary" className="mb-1.5 mr-1.5">
              {d}
            </Badge>
          ))}
        </div>
      )}

        <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Thermometer className="mr-1 inline h-3.5 w-3.5" />
          Indicators (current hour)
        </h3>
        <Row k="WBGT" v={`${risk.indicators.wbgt.toFixed(1)} °C`} />
        <Row k="Heat index" v={`${risk.indicators.heatIndex.toFixed(1)} °C`} />
        <Row k="UTCI" v={risk.indicators.utciAvailable ? String(risk.indicators.utci) : "n/a (not implemented)"} />

        <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Scores (0–1)
        </h3>
        <Row k="Thermal stress (T)" v={risk.scores.thermalStress.toFixed(3)} />
        <Row k="Exposure (E)" v={risk.scores.exposure.toFixed(3)} />
        <Row k="Vulnerability (V)" v={risk.scores.vulnerability.toFixed(3)} />
        <Row k="Persistence (P)" v={risk.scores.persistence.toFixed(3)} />
        <Row k="Night recovery (R, 1 = worst)" v={risk.scores.nighttimeRecovery.toFixed(3)} />

        <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Confidence
        </h3>
        <Row k="Score" v={risk.confidence.score.toFixed(2)} />
        {risk.confidence.dataQualityFlags.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Flags: {risk.confidence.dataQualityFlags.join(", ")}
          </p>
        )}
        {risk.confidence.missingInputs.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Missing: {risk.confidence.missingInputs.join(", ")}
          </p>
        )}

        {risk.warnings.length > 0 && (
          <>
            <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              Method warnings
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {risk.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Source: {risk.meta.weather_source} ({risk.meta.source_note}) · Engine v
          {risk.meta.science_engine_version} · computed {risk.computedAt}
        </p>
        <p className="text-xs text-muted-foreground">{risk.disclaimer}</p>
      </CardContent>
    </Card>
  );
}
