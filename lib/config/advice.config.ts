/**
 * Dynamic Advisory Configuration & Builder for Ahvaan Heat Safety Console.
 */

import { Flame, Activity, Sun, Users, type LucideIcon } from "lucide-react";
import { type RiskCategoryKey } from "@/lib/enums/risk.enum";
import { LAYER_LABELS, type MapLayer } from "@/lib/enums/layer.enum";

export interface AdviceInfo {
  Icon: LucideIcon;
  head: string;
  body: string;
}

export interface AdviceParams {
  catKey: RiskCategoryKey;
  layer: MapLayer;
  wbgtVal?: number | null;
  hiVal?: number | null;
  utciVal?: number | null;
  tempVal?: number | null;
  humidityVal?: number | null;
  htsiVal?: number | null;
}

export function getAdviceForLayerCategory({
  catKey,
  layer,
  wbgtVal,
  hiVal,
  utciVal,
  tempVal,
  humidityVal,
  htsiVal,
}: AdviceParams): AdviceInfo {
  const categoryName =
    catKey === "VERY_HIGH"
      ? "Extreme"
      : catKey === "HIGH"
        ? "High"
        : catKey === "MODERATE"
          ? "Moderate"
          : "Low";

  const layerLabel = LAYER_LABELS[layer] ?? "Heat Risk";

  const valText =
    layer === "wbgt" && typeof wbgtVal === "number"
      ? ` (WBGT ${wbgtVal.toFixed(1)}°C)`
      : layer === "hi" && typeof hiVal === "number"
        ? ` (Heat Index ${hiVal.toFixed(1)}°C)`
        : layer === "utci" && typeof utciVal === "number"
          ? ` (UTCI ${utciVal.toFixed(1)}°C)`
          : layer === "temp" && typeof tempVal === "number"
            ? ` (Temp ${tempVal.toFixed(1)}°C)`
            : layer === "humidity" && typeof humidityVal === "number"
              ? ` (Humidity ${humidityVal.toFixed(0)}%)`
              : layer === "thermal" && typeof htsiVal === "number"
                ? ` (HTSI ${htsiVal.toFixed(1)})`
                : "";

  switch (catKey) {
    case "VERY_HIGH":
      return {
        Icon: Flame,
        head: `${categoryName} Advisory - Immediate Action Required`,
        body: `Extreme thermal stress detected under ${layerLabel} layer${valText}. Avoid peak outdoor exposure 11am–4pm, open emergency cooling shelters, enforce hydration protocols for outdoor workers, and monitor senior citizens hourly.`,
      };
    case "HIGH":
      return {
        Icon: Activity,
        head: `${categoryName} Warning - Limit Exposure`,
        body: `High level conditions detected under ${layerLabel} layer${valText}. Restrict strenuous outdoor labor, schedule mandatory shade breaks, ensure accessible clean drinking water, and watch for symptoms of heat exhaustion.`,
      };
    case "MODERATE":
      return {
        Icon: Sun,
        head: `${categoryName} Caution - Stay Hydrated`,
        body: `Moderate level conditions detected under ${layerLabel} layer${valText}. Increase fluid intake, wear light breathable clothing, limit direct sun exposure during afternoon peak hours, and check on vulnerable populations.`,
      };
    case "LOW":
    default:
      return {
        Icon: Users,
        head: `${categoryName} Conditions - Standard Awareness`,
        body: `Low risk conditions under ${layerLabel} layer${valText}. Maintain regular activities, stay hydrated, and follow standard municipal heat safety guidelines.`,
      };
  }
}
