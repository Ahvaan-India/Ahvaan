"use client";

import { useMemo, useRef, useState } from "react";
import { Expand, ZoomIn, ZoomOut, Maximize, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "./RiskBadge";

export interface HeatCell {
  wardId: number;
  ward: number | null;
  wardName: string | null;
  riskScore: number | null;
  category: string | null;
  displayCategory: string | null;
  step: number | null;
  wbgt: number | null;
  population: number | null;
  ring: Array<[number, number]>;
}

/** Five-step sequential risk scale: teal → yellow → orange → red → deep red. */
export const RISK_STEPS = ["#14b8a6", "#eab308", "#f97316", "#ef4444", "#991b1b"];
const NO_DATA = "#9aa4b2";

const W = 640;
const H = 560;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export interface MapBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

function project(lon: number, lat: number, bounds: MapBounds): [number, number] {
  const midLat = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat);
  const x = ((lon - bounds.minLon) * kx) / ((bounds.maxLon - bounds.minLon) * kx || 1);
  const y = 1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1);
  return [x * W, y * H];
}

function boundsOf(cells: HeatCell[]): MapBounds {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const c of cells) {
    for (const [lon, lat] of c.ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!cells.length || !Number.isFinite(minLon)) {
    return { minLon: 88.2, maxLon: 88.5, minLat: 22.4, maxLat: 22.7 };
  }
  const padLon = (maxLon - minLon) * 0.05 || 0.01;
  const padLat = (maxLat - minLat) * 0.05 || 0.01;
  return { minLon: minLon - padLon, maxLon: maxLon + padLon, minLat: minLat - padLat, maxLat: maxLat + padLat };
}

/**
 * Zoomable ward choropleth with a cursor-following hover tooltip.
 * Zoom is a centered viewBox crop (buttons only — no scroll hijack);
 * each instance (inline + expanded) keeps independent zoom state.
 */
function Choropleth({
  cells,
  bounds,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: {
  cells: HeatCell[];
  bounds: MapBounds;
  selectedId: number | null;
  hoveredId: number | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; cell: HeatCell } | null>(null);
  const [zoom, setZoom] = useState(1);

  const onMove = (e: React.MouseEvent, cell: HeatCell) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(e.clientX - rect.left + 14, rect.width - 190);
    const y = Math.min(e.clientY - rect.top + 14, rect.height - 120);
    setTip({ x: Math.max(x, 4), y: Math.max(y, 4), cell });
  };

  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const vb = `${W / 2 - W / (2 * z)} ${H / 2 - H / (2 * z)} ${W / z} ${H / z}`;

  return (
    <div className="map-wrap relative" ref={wrapRef}>
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => setZoom((v) => Math.min(MAX_ZOOM, +(v + 0.5).toFixed(1)))} aria-label="Zoom in">
          <ZoomIn />
        </Button>
        <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => setZoom((v) => Math.max(MIN_ZOOM, +(v - 0.5).toFixed(1)))} aria-label="Zoom out" disabled={z <= MIN_ZOOM}>
          <ZoomOut />
        </Button>
        <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => setZoom(1)} aria-label="Reset zoom" disabled={z <= MIN_ZOOM}>
          <Maximize />
        </Button>
      </div>
      <svg
        viewBox={vb}
        role="img"
        aria-label="Kolkata ward risk choropleth"
        onMouseLeave={() => {
          onHover(null);
          setTip(null);
        }}
      >
        {cells.map((c) => {
          if (c.ring.length === 0) return null;
          const pts = c.ring
            .map(([lon, lat]) => project(lon, lat, bounds).join(","))
            .join(" ");
          const isSel = c.wardId === selectedId;
          const isHov = c.wardId === hoveredId;
          return (
            <polygon
              key={c.wardId}
              points={pts}
              fill={c.step ? RISK_STEPS[c.step - 1] : NO_DATA}
              fillOpacity={isSel || isHov ? 1 : 0.82}
              stroke={isSel || isHov ? "#111" : "#ffffff"}
              strokeWidth={isSel || isHov ? 1.4 / z : 0.4 / z}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => onHover(c.wardId)}
              onMouseMove={(e) => onMove(e, c)}
              onClick={() => onSelect(c.wardId)}
            />
          );
        })}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 w-44 rounded border border-border bg-popover p-2.5 text-popover-foreground shadow-lg"
          style={{ left: tip.x, top: tip.y }}
          aria-hidden
        >
          <p className="text-xs font-bold">
            {tip.cell.ward !== null ? `Ward ${tip.cell.ward}` : `Loc ${tip.cell.wardId}`}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-lg font-extrabold tabular-nums">
              {tip.cell.riskScore !== null ? tip.cell.riskScore.toFixed(3) : "—"}
            </span>
            {tip.cell.category && <RiskBadge category={tip.cell.category} />}
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            WBGT {tip.cell.wbgt !== null ? `${tip.cell.wbgt.toFixed(1)}°C` : "—"} · pop{" "}
            {tip.cell.population !== null ? tip.cell.population.toLocaleString("en-IN") : "—"}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Metropolitan Ward Risk Heatmap panel: legend, zoomable choropleth with
 * hover tooltip, expand-to-large-view, and the inline popover (sub-cards).
 */
export function HeatmapPanel({
  cells,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  popover,
}: {
  cells: HeatCell[];
  selectedId: number | null;
  hoveredId: number | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  popover: React.ReactNode;
}) {
  const bounds = useMemo(() => boundsOf(cells), [cells]);
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Metropolitan Ward Risk Heatmap</CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground" aria-label="Risk legend: low to extreme">
            {["Low", "Moderate", "Elevated", "High", "Extreme"].map((l, i) => (
              <span key={l} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-4 rounded-sm"
                  style={{ background: RISK_STEPS[i] }}
                  aria-hidden
                />
                {i === 0 || i === 4 ? l : null}
              </span>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
            <Expand /> Large view
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {cells.length === 0 ? (
          <Skeleton className="h-[380px] w-full" />
        ) : (
          <Choropleth
            cells={cells}
            bounds={bounds}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={onSelect}
            onHover={onHover}
          />
        )}
        <div className="mt-3">{popover}</div>
      </CardContent>
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ward map large view"
        >
          <Card className="max-h-[92vh] w-full max-w-5xl overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Ward Risk Map — Large View</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setExpanded(false)} aria-label="Close large view">
                <X />
              </Button>
            </CardHeader>
            <CardContent>
              <Choropleth
                cells={cells}
                bounds={bounds}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={onSelect}
                onHover={onHover}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  );
}
