"use client";

import dynamic from "next/dynamic";
import { getWardLocality } from "@/lib/geo/wardNames";
import type { MapWard } from "./KolkataMap";
import { RISK_COLORS } from "./KolkataMap";
import "leaflet/dist/leaflet.css";

// Dynamically import Leaflet components to avoid SSR
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false },
);
const Polygon = dynamic(() => import("react-leaflet").then((m) => m.Polygon), {
  ssr: false,
});
const Tooltip = dynamic(() => import("react-leaflet").then((m) => m.Tooltip), {
  ssr: false,
});

function layerValue(c: MapWard, layer: string): number | null {
  switch (layer) {
    case "risk":
      return null; // use category
    case "thermal":
      return c.thermal;
    case "wbgt":
      return c.wbgt;
    case "hi":
      return c.heatIndex;
    case "exposure":
      return c.exposure;
    case "vulnerability":
      return c.vulnerability;
    default:
      return null;
  }
}

function getColorForLayer(c: MapWard, layer: string): string {
  if (layer === "risk") {
    switch (c.category) {
      case "VERY_HIGH":
        return RISK_COLORS[4];
      case "HIGH":
        return RISK_COLORS[3];
      case "MODERATE":
        return RISK_COLORS[2];
      case "LOW":
        return RISK_COLORS[0];
      default:
        return c.step ? RISK_COLORS[c.step - 1] : "#cbd5e1";
    }
  }
  const v = layerValue(c, layer);
  if (v === null || !Number.isFinite(v))
    return c.step ? RISK_COLORS[c.step - 1] : "#cbd5e1";
  let t: number;
  if (layer === "wbgt") t = (v - 15) / 25;
  else if (layer === "hi") t = (v - 20) / 35;
  else t = v;
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped >= 0.8) return RISK_COLORS[4];
  if (clamped >= 0.6) return RISK_COLORS[3];
  if (clamped >= 0.4) return RISK_COLORS[2];
  if (clamped >= 0.2) return RISK_COLORS[1];
  return RISK_COLORS[0];
}

export function KolkataLeafletMap({
  cells,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  searchQuery,
  layer = "risk",
}: {
  cells: MapWard[];
  selectedId: number | null;
  hoveredId: number | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  searchQuery?: string;
  layer?: string;
}) {
  const normalizedSearch = (searchQuery ?? "").trim().toLowerCase();
  const isMatch = (c: MapWard) => {
    if (!normalizedSearch) return false;
    const q = normalizedSearch;
    const loc = getWardLocality(c.ward);
    if (String(c.ward ?? "").includes(q)) return true;
    if (c.wardName?.toLowerCase().includes(q)) return true;
    if (loc?.toLowerCase().includes(q)) return true;
    if (String(c.wardId).includes(q)) return true;
    return false;
  };

  // Center on Kolkata
  const center: [number, number] = [22.5726, 88.3639];

  return (
    <div className="h-full w-full">
      {/* @ts-ignore - Leaflet CSS will be imported via globals */}
      <MapContainer
        center={center}
        zoom={11}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {cells.map((c) => {
          const isSel = c.wardId === selectedId;
          const isHov = c.wardId === hoveredId;
          const matched = isMatch(c);
          const hasSearch = !!normalizedSearch;
          const dimmed = hasSearch && !matched && c.wardId !== selectedId;
          const color = getColorForLayer(c, layer);
          // Convert ring [lon, lat] to [lat, lon] for Leaflet
          const positions = c.ring.map(
            ([lon, lat]) => [lat, lon] as [number, number],
          );
          if (positions.length < 3) return null;
          return (
            <Polygon
              key={c.wardId}
              positions={positions}
              pathOptions={{
                fillColor: color,
                fillOpacity: dimmed
                  ? 0.25
                  : isSel || isHov || matched
                    ? 0.85
                    : 0.7,
                color: isSel
                  ? "#0f172a"
                  : matched
                    ? "#2563eb"
                    : isHov
                      ? "#334155"
                      : "white",
                weight: isSel ? 2 : matched ? 1.5 : isHov ? 1 : 0.8,
              }}
              eventHandlers={{
                click: () => onSelect(c.wardId),
                mouseover: () => onHover(c.wardId),
                mouseout: () => onHover(null),
              }}
            >
              <Tooltip sticky>
                <div className="text-xs">
                  <p className="font-bold">
                    {c.ward !== null
                      ? `Ward ${c.ward}`
                      : `Location ${c.wardId}`}
                  </p>
                  {getWardLocality(c.ward) && (
                    <p className="text-[11px] text-primary">
                      {getWardLocality(c.ward)}
                    </p>
                  )}
                  <p className="tabular-nums">
                    Risk {c.riskScore !== null ? c.riskScore.toFixed(3) : ""} ·
                    WBGT {c.wbgt !== null ? c.wbgt.toFixed(1) + "°C" : ""}
                  </p>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}
      </MapContainer>
    </div>
  );
}
