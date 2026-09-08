"use client";

import { useMemo, useRef, useState, memo, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, LocateFixed, Maximize2 } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/console/RiskBadge";
import { getWardLocality, getWardDisplayName, matchesWardQuery } from "@/lib/geo/wardNames";
import { useIsMobile } from "@/lib/hooks/useMobile";

export interface MapWard {
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

export const RISK_COLORS = ["#14b8a6", "#eab308", "#f97316", "#ef4444", "#991b1b"] as const;
const NO_DATA = "#cbd5e1";

const W = 640;
const H = 560;
const MIN_Z = 1;
const MAX_Z = 6;

export interface MapBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

function project(lon: number, lat: number, b: MapBounds): [number, number] {
  const mid = ((b.minLat + b.maxLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(mid);
  const x = ((lon - b.minLon) * kx) / ((b.maxLon - b.minLon) * kx || 1);
  const y = 1 - (lat - b.minLat) / (b.maxLat - b.minLat || 1);
  return [x * W, y * H];
}

function boundsOf(cells: MapWard[]): MapBounds {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const c of cells) for (const [lon, lat] of c.ring) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  if (!cells.length || !Number.isFinite(minLon)) return { minLon: 88.2, maxLon: 88.5, minLat: 22.4, maxLat: 22.7 };
  const padLon = (maxLon - minLon) * 0.05 || 0.01;
  const padLat = (maxLat - minLat) * 0.05 || 0.01;
  return { minLon: minLon - padLon, maxLon: maxLon + padLon, minLat: minLat - padLat, maxLat: maxLat + padLat };
}

function centroid(cell: MapWard): [number, number] | null {
  if (!cell.ring.length) return null;
  let sx = 0, sy = 0;
  for (const [lon, lat] of cell.ring) { sx += lon; sy += lat; }
  return [sx / cell.ring.length, sy / cell.ring.length];
}

const WardPolygon = memo(function WardPolygon({
  cell, bounds, zoom, isSel, isHov, isSearchMatch, dimmed, onHover, onSelect, onMove
}: {
  cell: MapWard; bounds: MapBounds; zoom: number;
  isSel: boolean; isHov: boolean; isSearchMatch: boolean; dimmed: boolean;
  onHover: (id: number | null) => void; onSelect: (id: number) => void;
  onMove: (e: React.MouseEvent, c: MapWard) => void;
}) {
  const pts = useMemo(() => cell.ring.map(([lon, lat]) => project(lon, lat, bounds).join(",")).join(" "), [cell.ring, bounds]);
  const fill = cell.step ? RISK_COLORS[cell.step - 1] : NO_DATA;
  return (
    <polygon
      points={pts}
      fill={fill}
      fillOpacity={dimmed ? 0.25 : isSel || isHov || isSearchMatch ? 1 : 0.86}
      stroke={isSel ? "#0f172a" : isSearchMatch ? "#2563eb" : isHov ? "#334155" : "white"}
      strokeWidth={isSel ? 1.6 / zoom : isSearchMatch ? 1.2 / zoom : isHov ? 1 / zoom : 0.5 / zoom}
      strokeLinejoin="round"
      style={{ cursor: "pointer", transition: "fill 0.2s ease, fill-opacity 0.2s ease" }}
      onMouseEnter={() => onHover(cell.wardId)}
      onMouseMove={(e) => onMove(e, cell)}
      onClick={() => onSelect(cell.wardId)}
    />
  );
});

/**
 * KolkataMap — Google-Maps-like SVG map.
 * Pan (drag) + zoom (buttons + wheel) + hover tooltip + ward-name labels
 * + search highlight. Optimized: polygons memoized, bounds memoized.
 */
export function KolkataMap({
  cells,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  searchQuery,
}: {
  cells: MapWard[];
  selectedId: number | null;
  hoveredId: number | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  searchQuery?: string;
}) {
  const bounds = useMemo(() => boundsOf(cells), [cells]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; cell: MapWard } | null>(null);
  const isMobile = useIsMobile();
  const prefersReduced = useReducedMotion();
  const reduceMotion = !!prefersReduced || isMobile;

  const z = Math.min(MAX_Z, Math.max(MIN_Z, zoom));

  // Derived viewBox with pan (pan is in viewBox units)
  const vbW = W / z, vbH = H / z;
  const baseX = W / 2 - vbW / 2, baseY = H / 2 - vbH / 2;
  const vbX = baseX - pan.x, vbY = baseY - pan.y;
  const vb = `${vbX} ${vbY} ${vbW} ${vbH}`;

  const onMove = useCallback((e: React.MouseEvent, cell: MapWard) => {
    if (isMobile) return; // no hover tooltip on touch, use tap
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(e.clientX - rect.left + 14, rect.width - 188);
    const y = Math.min(e.clientY - rect.top + 14, rect.height - 120);
    setTip({ x: Math.max(x, 6), y: Math.max(y, 6), cell });
  }, [isMobile]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // require ctrl to zoom so page scroll works
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    setZoom((v) => Math.min(MAX_Z, Math.max(MIN_Z, +(v * (1 + delta)).toFixed(2))));
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const scaleX = vbW / rect.width, scaleY = vbH / rect.height;
    setPan({ x: drag.ox + (e.clientX - drag.sx) * scaleX, y: drag.oy + (e.clientY - drag.sy) * scaleY });
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
    setDrag(null);
  };

  const normalizedSearch = (searchQuery ?? "").trim().toLowerCase();
  const isMatch = useCallback((c: MapWard) => {
    if (!normalizedSearch) return false;
    return matchesWardQuery(c.ward, c.wardName, getWardLocality(c.ward), normalizedSearch);
  }, [normalizedSearch]);
  const hasSearch = !!normalizedSearch;

  // Ward labels — show when zoomed or when hovered/selected/search match
  const showLabels = z > 1.2 && !isMobile ? true : z > 1.0;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-[#eef2f7] dark:bg-[#0f172a] touch-none select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { onHover(null); setTip(null); }}
      onPointerDown={handlePointerDown}
      onWheel={handleWheel}
      style={{ cursor: drag ? "grabbing" : "grab", willChange: drag ? "transform" : undefined }}
    >
      {/* Map tiles subtle grid */}
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(to right, #64748b 1px, transparent 1px), linear-gradient(to bottom, #64748b 1px, transparent 1px)", backgroundSize: "40px 40px" }} aria-hidden />

      <svg
        viewBox={vb}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Kolkata ward map"
      >
        {/* Water / land hint behind polygons */}
        <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="none" />
        {cells.map((c) => (
          <WardPolygon
            key={c.wardId}
            cell={c}
            bounds={bounds}
            zoom={z}
            isSel={c.wardId === selectedId}
            isHov={c.wardId === hoveredId}
            isSearchMatch={isMatch(c)}
            dimmed={hasSearch && !isMatch(c) && c.wardId !== selectedId}
            onHover={onHover}
            onSelect={onSelect}
            onMove={onMove}
          />
        ))}
        {/* Ward name labels — centroid-placed, non-scaling text */}
        {cells.map((c) => {
          const cen = centroid(c);
          if (!cen) return null;
          const [sx, sy] = project(cen[0], cen[1], bounds);
          const show = showLabels || c.wardId === selectedId || c.wardId === hoveredId || isMatch(c);
          if (!show) return null;
          const loc = getWardLocality(c.ward);
          const numLabel = c.ward !== null ? String(c.ward) : String(c.wardId);
          // Hide dense small wards' labels at low zoom to avoid clutter
          const area = c.ring.length;
          if (!showLabels && area < 40) return null;
          const isEmph = c.wardId === selectedId || isMatch(c);
          const showLoc = loc && (isEmph || z > 1.8);
          return (
            <g key={`lbl-${c.wardId}`} style={{ pointerEvents: "none" }}>
              <text
                x={sx}
                y={showLoc ? sy - 3 / z : sy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(5, 9 / Math.pow(z, 0.4))}
                fontWeight={isEmph ? 800 : 600}
                fill={c.wardId === selectedId ? "white" : c.step && c.step >= 4 ? "white" : "#1e293b"}
                stroke={c.wardId === selectedId ? "rgba(0,0,0,0.35)" : "white"}
                strokeWidth={0.6 / z}
                paintOrder="stroke"
                style={{ fontFamily: "var(--font-sans), Archivo, sans-serif", userSelect: "none" }}
              >
                {numLabel}
              </text>
              {showLoc && (
                <text
                  x={sx}
                  y={sy + 6 / z}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.max(4, 6.5 / Math.pow(z, 0.35))}
                  fontWeight={600}
                  fill={c.wardId === selectedId ? "white" : "#334155"}
                  stroke="white"
                  strokeWidth={0.4 / z}
                  paintOrder="stroke"
                  style={{ fontFamily: "var(--font-sans), Archivo, sans-serif", userSelect: "none" }}
                >
                  {loc!.length > 13 ? loc!.slice(0, 12) + "…" : loc!}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Zoom controls — Google Maps style vertical stack */}
      <div className="absolute bottom-4 right-3 flex flex-col overflow-hidden rounded-xl border bg-card shadow-lg will-change-transform">
        <button onClick={() => setZoom((v) => Math.min(MAX_Z, +(v + 0.6).toFixed(1)))} className="flex h-9 w-9 items-center justify-center hover:bg-muted" aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="h-px bg-border" />
        <button onClick={() => setZoom((v) => Math.max(MIN_Z, +(v - 0.6).toFixed(1)))} className="flex h-9 w-9 items-center justify-center hover:bg-muted" aria-label="Zoom out" disabled={z <= MIN_Z + 0.01}>
          <ZoomOut className="h-4 w-4 opacity-60" />
        </button>
        <div className="h-px bg-border" />
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="flex h-9 w-9 items-center justify-center hover:bg-muted" aria-label="Reset view">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={() => {
            const first = cells[0];
            if (first) { const cb = centroid(first); if (cb) { const [sx, sy] = project(cb[0], cb[1], bounds); setPan({ x: W / 2 - sx - vbW / 2 + baseX, y: H / 2 - sy - vbH / 2 + baseY }); setZoom(2); } }
          }}
          className="flex h-9 w-9 items-center justify-center hover:bg-muted" aria-label="Locate Kolkata"
        >
          <LocateFixed className="h-4 w-4" />
        </button>
      </div>

      {/* Legend — floating glass */}
      <div className="absolute bottom-4 left-3 flex items-center gap-1.5 rounded-full border bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Risk</span>
        {["#14b8a6", "#eab308", "#f97316", "#ef4444", "#991b1b"].map((c, i) => (
          <span key={c} className="h-2.5 w-6 rounded-full" style={{ background: c }} />
        ))}
        <span className="ml-1 hidden text-[10px] text-muted-foreground sm:inline">Low → Extreme</span>
      </div>

      {/* Ctrl+scroll hint */}
      <div className="pointer-events-none absolute left-1/2 top-3 hidden -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-xs text-background opacity-0 transition-opacity peer-hover:opacity-100 md:block">
        Hold Ctrl to zoom · Drag to pan
      </div>

      {/* Hover tooltip — small popup summary */}
      <AnimatePresence>
        {tip && !isMobile && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.12 }}
            className="pointer-events-none absolute z-10 w-[220px] rounded-xl border bg-popover p-3 shadow-xl will-change-transform"
            style={{ left: tip.x, top: tip.y }}
          >
            <p className="text-xs font-extrabold leading-none">
              {getWardDisplayName(tip.cell.ward, tip.cell.wardName)}
            </p>
            {(() => { const loc = getWardLocality(tip.cell.ward); return loc ? <p className="mt-0.5 text-[11px] font-medium text-primary">{loc}</p> : null; })()}
            {tip.cell.wardName && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{tip.cell.wardName}</p>}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xl font-black tabular-nums leading-none">{tip.cell.riskScore !== null ? tip.cell.riskScore.toFixed(3) : "—"}</span>
              {tip.cell.category && <RiskBadge category={tip.cell.category} />}
            </div>
            <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
              WBGT {tip.cell.wbgt !== null ? `${tip.cell.wbgt.toFixed(1)}°C` : "—"} · Pop {tip.cell.population !== null ? tip.cell.population.toLocaleString("en-IN") : "—"}
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-primary">Click for full telemetry →</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
