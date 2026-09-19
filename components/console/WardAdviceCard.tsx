"use client";

import { cn } from "@/lib/utils";
import { RiskBadge } from "@/components/console/RiskBadge";
import {
  riskFillForCategory,
  riskFillForStep,
  riskPanelClass,
  type RiskCategoryKey,
} from "@/lib/risk";
import { LAYER_LABELS, type MapLayer } from "@/lib/enums/layer.enum";
import { getAdviceForLayerCategory } from "@/lib/config/advice.config";

interface WardAdviceCardProps {
  currentCategory?: string;
  activeLayerStep?: number | null;
  layer: MapLayer;
  wbgtVal?: number | null;
  hiVal?: number | null;
  utciVal?: number | null;
  tempVal?: number | null;
  humidityVal?: number | null;
  htsiVal?: number | null;
  showBadge?: boolean;
}

export function WardAdviceCard({
  currentCategory,
  activeLayerStep,
  layer,
  wbgtVal,
  hiVal,
  utciVal,
  tempVal,
  humidityVal,
  htsiVal,
  showBadge = true,
}: WardAdviceCardProps) {
  const catKey: RiskCategoryKey =
    layer === "risk"
      ? ((currentCategory === "EXTREME" ? "VERY_HIGH" : (currentCategory ?? "LOW")) as RiskCategoryKey)
      : activeLayerStep === 5
        ? "VERY_HIGH"
        : activeLayerStep === 4
          ? "HIGH"
          : activeLayerStep === 2 || activeLayerStep === 3
            ? "MODERATE"
            : "LOW";

  const stepColor =
    activeLayerStep !== null && activeLayerStep !== undefined
      ? riskFillForStep(activeLayerStep)
      : riskFillForCategory(catKey);

  const layerLabel = LAYER_LABELS[layer] ?? "Heat Risk";

  const advice = getAdviceForLayerCategory({
    catKey,
    layer,
    wbgtVal,
    hiVal,
    utciVal,
    tempVal,
    humidityVal,
    htsiVal,
  });

  return (
    <>
      {showBadge && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <RiskBadge category={currentCategory} step={activeLayerStep} />
            <span>{layerLabel} Category</span>
          </p>
        </div>
      )}
      <div className="mt-3">
        <div
          className={cn(
            "rounded-xl border p-3.5 transition-colors",
            riskPanelClass(catKey),
          )}
        >
          <p className="flex items-center gap-2 text-xs font-extrabold tracking-tight">
            <advice.Icon
              className="h-4 w-4 shrink-0"
              style={{ color: stepColor }}
              aria-hidden
            />
            <span>{advice.head}</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground font-medium">
            {advice.body}
          </p>
        </div>
      </div>
    </>
  );
}
