/**
 * Centralized Application Configuration for Ahvaan.
 */

export const APP_CONFIG = {
  name: "Ahvaan",
  subtitle: "KOLKATA",
  fullTitle: "Ahvaan · Urban Heat Resilience Platform",
  logoPath: "/logo.png",
  defaultTimezone: "Asia/Kolkata",
  region: "Kolkata (M Corp.)",
  search: {
    maxSuggestions: 8,
    debounceMs: 250,
    placeholder: "Search ward by number or locality…",
  },
  map: {
    center: [22.5726, 88.3639] as [number, number],
    defaultZoom: 12,
    minZoom: 10,
    maxZoom: 16,
    tileLayerUrl:
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    darkTileLayerUrl:
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  polling: {
    swrDedupingIntervalMs: 10000,
    telemetryRefreshMs: 60000,
  },
  disclaimer:
    "Ahvaan HeatShield is a decision-support platform for municipal heat resilience. Scores represent relative thermal risk, not validated clinical diagnostic outcomes.",
} as const;
