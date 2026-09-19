/**
 * Map Layer Enums, Labels, Units, and Painted Step Configuration for Ahvaan Console.
 */

export enum MapLayerKey {
  THERMAL = "thermal",
  WBGT = "wbgt",
  HEAT_INDEX = "hi",
  UTCI = "utci",
  TEMPERATURE = "temp",
  HUMIDITY = "humidity",
  WIND = "wind",
  SOLAR = "solar",
  RISK = "risk",
}

export type MapLayer =
  | "thermal"
  | "wbgt"
  | "hi"
  | "utci"
  | "temp"
  | "humidity"
  | "wind"
  | "solar"
  | "risk";

export const LAYER_LABELS: Record<MapLayer, string> = {
  thermal: "Thermal / HTSI",
  wbgt: "WBGT",
  hi: "Heat Index",
  utci: "UTCI",
  temp: "Temperature",
  humidity: "Humidity",
  wind: "Wind Speed",
  solar: "Solar Radiation",
  risk: "Heat Risk",
};

export const LAYER_UNITS: Record<MapLayer, string> = {
  thermal: "",
  wbgt: "°C",
  hi: "°C",
  utci: "°C",
  temp: "°C",
  humidity: "%",
  wind: " m/s",
  solar: " W/m²",
  risk: "",
};

export interface LayerPillMeta {
  units: string;
  stepRange: Array<{ step: number; label: string }>;
}

export const LAYER_PILL_META: Record<Exclude<MapLayer, "risk">, LayerPillMeta> = {
  thermal: {
    units: "",
    stepRange: [
      { step: 1, label: "< 30" },
      { step: 2, label: "30–49" },
      { step: 3, label: "50–64" },
      { step: 4, label: "65–79" },
      { step: 5, label: "≥ 80" },
    ],
  },
  wbgt: {
    units: "°C",
    stepRange: [
      { step: 1, label: "< 22" },
      { step: 2, label: "22–26.9" },
      { step: 3, label: "27–29.9" },
      { step: 4, label: "30–32.9" },
      { step: 5, label: "≥ 33" },
    ],
  },
  hi: {
    units: "°C",
    stepRange: [
      { step: 1, label: "< 27" },
      { step: 2, label: "27–32.9" },
      { step: 3, label: "33–38.9" },
      { step: 4, label: "39–44.9" },
      { step: 5, label: "≥ 45" },
    ],
  },
  utci: {
    units: "°C",
    stepRange: [
      { step: 1, label: "< 26" },
      { step: 2, label: "26–31.9" },
      { step: 3, label: "32–37.9" },
      { step: 4, label: "38–43.9" },
      { step: 5, label: "≥ 44" },
    ],
  },
  temp: {
    units: "°C",
    stepRange: [
      { step: 1, label: "< 28" },
      { step: 2, label: "28–31.9" },
      { step: 3, label: "32–34.9" },
      { step: 4, label: "35–37.9" },
      { step: 5, label: "≥ 38" },
    ],
  },
  humidity: {
    units: "%",
    stepRange: [
      { step: 1, label: "< 40%" },
      { step: 2, label: "40–54%" },
      { step: 3, label: "55–69%" },
      { step: 4, label: "70–84%" },
      { step: 5, label: "≥ 85%" },
    ],
  },
  wind: {
    units: " m/s",
    stepRange: [
      { step: 1, label: "≥ 4.0" },
      { step: 2, label: "2.5–3.9" },
      { step: 3, label: "1.5–2.4" },
      { step: 4, label: "0.8–1.4" },
      { step: 5, label: "< 0.8" },
    ],
  },
  solar: {
    units: " W/m²",
    stepRange: [
      { step: 1, label: "< 200" },
      { step: 2, label: "200–399" },
      { step: 3, label: "400–599" },
      { step: 4, label: "600–799" },
      { step: 5, label: "≥ 800" },
    ],
  },
};
