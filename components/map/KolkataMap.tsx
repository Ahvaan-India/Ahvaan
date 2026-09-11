"use client";

import { useMemo, useRef, useState, memo, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, LocateFixed, Maximize2 } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { RiskBadge } from "@/components/console/RiskBadge";
import {
  getWardLocality,
  getWardDisplayName,
  matchesWardQuery,
} from "@/lib/geo/wardNames";
import { useIsMobile } from "@/lib/hooks/useMobile";
import { RISK_SCALE_FILLS } from "@/lib/risk";

export interface MapWard {
  wardId: number;
  ward: number | null;
  wardName: string | null;
  riskScore: number | null;
  category: string | null;
  displayCategory: string | null;
  step: number | null;
  wbgt: number | null;
  heatIndex: number | null;
  utci: number | null;
  thermal: number | null;
  exposure: number | null;
  vulnerability: number | null;
  population: number | null;
  lat: number;
  long: number;
  ring: Array<[number, number]>;
}

// Alias kept for existing importers (AnalyticsView, LeftSidebar, maps legend).
export const RISK_COLORS = RISK_SCALE_FILLS;
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
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const c of cells)
    for (const [lon, lat] of c.ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  if (!cells.length || !Number.isFinite(minLon))
    return { minLon: 88.2, maxLon: 88.5, minLat: 22.4, maxLat: 22.7 };
  const padLon = (maxLon - minLon) * 0.05 || 0.01;
  const padLat = (maxLat - minLat) * 0.05 || 0.01;
  return {
    minLon: minLon - padLon,
    maxLon: maxLon + padLon,
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
  };
}

function centroid(cell: MapWard): [number, number] | null {
  if (!cell.ring.length) return null;
  let sx = 0,
    sy = 0;
  for (const [lon, lat] of cell.ring) {
    sx += lon;
    sy += lat;
  }
  return [sx / cell.ring.length, sy / cell.ring.length];
}

function layerValue(c: MapWard, layer: string): number | null {
  switch (layer) {
    case "risk":
      return null; // use category, not value
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

/** Ward → painted 1–5 color step for the active layer. Exported so summary UI (maps pill) buckets wards exactly as painted. */
export function layerStepFor(c: MapWard, layer: string): number | null {
  // Risk uses fixed categories (LOW/MODERATE/HIGH/VERY_HIGH)  stable, not decimal-sensitive
  if (layer === "risk") {
    switch (c.category) {
      case "VERY_HIGH":
        return 5;
      case "HIGH":
        return 4;
      case "MODERATE":
        return 3;
      case "LOW":
        return 1;
      default:
        return c.step ?? 2;
    }
  }
  const v = layerValue(c, layer);
  if (v === null || !Number.isFinite(v)) return c.step;
  let n: number;
  if (layer === "wbgt") n = (v - 15) / 25;
  else if (layer === "hi") n = (v - 20) / 35;
  else n = v; // thermal/exposure/vuln already 0–1
  const clamped = Math.max(0, Math.min(1, n));
  if (clamped >= 0.8) return 5;
  if (clamped >= 0.6) return 4;
  if (clamped >= 0.4) return 3;
  if (clamped >= 0.2) return 2;
  return 1;
}

const WardPolygon = memo(function WardPolygon({
  cell,
  bounds,
  zoom,
  layer,
  isSel,
  isHov,
  isSearchMatch,
  dimmed,
  onHover,
  onSelect,
  onMove,
}: {
  cell: MapWard;
  bounds: MapBounds;
  zoom: number;
  layer: string;
  isSel: boolean;
  isHov: boolean;
  isSearchMatch: boolean;
  dimmed: boolean;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
  onMove: (e: React.MouseEvent, c: MapWard) => void;
}) {
  const pts = useMemo(
    () =>
      cell.ring
        .map(([lon, lat]) => project(lon, lat, bounds).join(","))
        .join(" "),
    [cell.ring, bounds],
  );
  const step = layerStepFor(cell, layer);
  const fill = step ? RISK_COLORS[step - 1] : NO_DATA;
  return (
    <polygon
      points={pts}
      fill={fill}
      fillOpacity={dimmed ? 0.25 : isSel || isHov || isSearchMatch ? 1 : 0.86}
      stroke={
        isSel
          ? "#0f172a"
          : isSearchMatch
            ? "#2563eb"
            : isHov
              ? "#334155"
              : "white"
      }
      strokeWidth={
        isSel
          ? 1.6 / zoom
          : isSearchMatch
            ? 1.2 / zoom
            : isHov
              ? 1 / zoom
              : 0.5 / zoom
      }
      strokeLinejoin="round"
      style={{
        cursor: "pointer",
        transition: "fill 0.2s ease, fill-opacity 0.2s ease",
      }}
      onMouseEnter={() => onHover(cell.wardId)}
      onMouseMove={(e) => onMove(e, cell)}
      onClick={() => onSelect(cell.wardId)}
    />
  );
});

/**
 * KolkataMap  Google-Maps-like SVG map.
 * Pan (drag) + zoom (buttons + wheel) + hover tooltip + ward-name labels
 * + search highlight + layer recoloring. Optimized: polygons memoized, bounds memoized.
 */
export function KolkataMap({
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
  layer?: import("@/components/console/LeftSidebar").MapLayer;
}) {
  const bounds = useMemo(() => boundsOf(cells), [cells]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Ref mirror of the view so native listeners (wheel) and gesture
  // callbacks always read the latest zoom/pan without re-subscribing.
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  viewRef.current = { zoom, pan };
  const [drag, setDrag] = useState<{
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);
  // Active pointers for pinch gestures + tap tracking for double-tap zoom
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<null | {
    startDist: number;
    startZoom: number;
    startPan: { x: number; y: number };
    startMid: { x: number; y: number };
  }>(null);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    cell: MapWard;
  } | null>(null);
  const isMobile = useIsMobile();
  const prefersReduced = useReducedMotion();
  const reduceMotion = !!prefersReduced || isMobile;
  // Measured container width (px) for the scale bar.
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      setBoxW(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Real-world scale for the current view: full world width (W units) spans
  // the bounds' longitude range, so meters/unit falls out directly.
  // (Computed below, after vbW is defined.)
  const scaleForWidth = (viewBoxW: number) => {
    if (!boxW) return null;
    const lonSpan = bounds.maxLon - bounds.minLon || 1;
    const midLat = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
    const metersPerUnit = (lonSpan * 111320 * Math.cos(midLat)) / W;
    const visibleMeters = viewBoxW * metersPerUnit;
    if (!Number.isFinite(visibleMeters) || visibleMeters <= 0) return null;
    const target = visibleMeters * 0.22;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const n = target / pow;
    const nice = (n >= 5 ? 5 : n >= 2 ? 2 : 1) * pow;
    const px = Math.max(
      36,
      Math.min(boxW * 0.4, (nice / visibleMeters) * boxW),
    );
    const label =
      nice >= 1000
        ? `${+(nice / 1000).toFixed(nice % 1000 === 0 ? 0 : 1)} km`
        : `${Math.round(nice)} m`;
    return { px, label };
  };

  const z = Math.min(MAX_Z, Math.max(MIN_Z, zoom));

  // Derived viewBox with pan (pan is in viewBox units)
  const vbW = W / z,
    vbH = H / z;
  const baseX = W / 2 - vbW / 2,
    baseY = H / 2 - vbH / 2;
  const vbX = baseX - pan.x,
    vbY = baseY - pan.y;
  const vb = `${vbX} ${vbY} ${vbW} ${vbH}`;

  const onMove = useCallback(
    (e: React.MouseEvent, cell: MapWard) => {
      if (isMobile) return; // no hover tooltip on touch, use tap
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.min(e.clientX - rect.left + 14, rect.width - 188);
      const y = Math.min(e.clientY - rect.top + 14, rect.height - 120);
      setTip({ x: Math.max(x, 6), y: Math.max(y, 6), cell });
    },
    [isMobile],
  );

  // Zoom keeping the point under (clientX, clientY) fixed — proper map feel.
  // Stable identity (reads viewRef) so native listeners can use it safely.
  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, newZoom: number) => {
      const { zoom: z0, pan: p0 } = viewRef.current;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        setZoom(newZoom);
        return;
      }
      const z1 = Math.min(MAX_Z, Math.max(MIN_Z, z0));
      const z2 = Math.min(MAX_Z, Math.max(MIN_Z, newZoom));
      if (z1 === z2) return;
      const fx = (clientX - rect.left) / rect.width;
      const fy = (clientY - rect.top) / rect.height;
      const vbW1 = W / z1;
      const vbH1 = H / z1;
      const worldX = W / 2 - vbW1 / 2 - p0.x + fx * vbW1;
      const worldY = H / 2 - vbH1 / 2 - p0.y + fy * vbH1;
      const vbW2 = W / z2;
      const vbH2 = H / z2;
      setZoom(z2);
      setPan({
        x: W / 2 - vbW2 / 2 + fx * vbW2 - worldX,
        y: H / 2 - vbH2 / 2 + fy * vbH2 - worldY,
      });
    },
    [],
  );

  // Native non-passive wheel listener: React attaches wheel passively at the
  // root, so e.preventDefault() in onWheel is ignored and the page scrolls
  // instead of zooming. This keeps scroll-to-zoom (and trackpad pinch,
  // which arrives as ctrlKey+wheel) on the map.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.ctrlKey ? 0.01 : 0.0025;
      const nz = viewRef.current.zoom * (1 - e.deltaY * step);
      zoomAtPoint(e.clientX, e.clientY, nz);
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [zoomAtPoint]);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    // Two fingers → start pinch, cancel single-finger drag.
    // Capture the pointer so move events keep flowing to the map even if a
    // finger slides off the element mid-gesture (mobile pinch reliability).
    // Single-finger path stays uncaptured so polygon tap/click still works.
    if (pointersRef.current.size === 2) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      pinchRef.current = {
        startDist: dist,
        startZoom: viewRef.current.zoom,
        startPan: { ...viewRef.current.pan },
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      setDrag(null);
      setTip(null);
      return;
    }
    // Don't capture - let polygon clicks through; just track drag start
    setDrag({ sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    // Pinch: zoom around midpoint + pan with midpoint drift
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const p = pinchRef.current;
      const rect = wrapRef.current?.getBoundingClientRect();
      const z2 = Math.min(
        MAX_Z,
        Math.max(MIN_Z, p.startZoom * (dist / p.startDist)),
      );
      setZoom(+z2.toFixed(2));
      if (rect && rect.width > 0) {
        // Pan follows midpoint drift, scaled to viewBox units at new zoom
        const scale = W / z2 / rect.width;
        setPan({
          x: p.startPan.x + (mid.x - p.startMid.x) * scale,
          y: p.startPan.y + (mid.y - p.startMid.y) * scale,
        });
      } else {
        setPan({ ...p.startPan });
      }
      return;
    }
    if (!drag || !wrapRef.current) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    // Small movement = tap, not drag - don't pan, allow click
    if (Math.hypot(dx, dy) < 6) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const scaleX = vbW / rect.width,
      scaleY = vbH / rect.height;
    setPan({
      x: drag.ox + dx * scaleX,
      y: drag.oy + dy * scaleY,
    });
  };
  const endPointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    // Double-tap to zoom in (touch), anchored at tap point
    const down = downRef.current;
    if (down && pointersRef.current.size === 0) {
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = Date.now() - down.t;
      if (moved < 10 && dt < 400) {
        const last = lastTapRef.current;
        if (
          last &&
          Date.now() - last.t < 350 &&
          Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40
        ) {
          lastTapRef.current = null;
          zoomAtPoint(e.clientX, e.clientY, zoom + 1);
        } else {
          lastTapRef.current = { t: Date.now(), x: e.clientX, y: e.clientY };
        }
      } else {
        lastTapRef.current = null;
      }
    }
    downRef.current = null;
    setDrag(null);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    endPointer(e);
  };

  const normalizedSearch = (searchQuery ?? "").trim().toLowerCase();
  const isMatch = useCallback(
    (c: MapWard) => {
      if (!normalizedSearch) return false;
      return matchesWardQuery(
        c.ward,
        c.wardName,
        getWardLocality(c.ward),
        normalizedSearch,
      );
    },
    [normalizedSearch],
  );
  const hasSearch = !!normalizedSearch;

  // Ward labels  show when zoomed or when hovered/selected/search match
  const showLabels = z > 1.2 && !isMobile ? true : z > 1.0;

  // Ensure hover clears even when pointer is captured or leaves window
  useEffect(() => {
    const clear = () => {
      onHover(null);
      setTip(null);
    };
    const onWindowLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) clear();
    };
    window.addEventListener("mouseleave", onWindowLeave);
    document.addEventListener("mouseleave", onWindowLeave as unknown as EventListener);
    return () => {
      window.removeEventListener("mouseleave", onWindowLeave);
      document.removeEventListener("mouseleave", onWindowLeave as unknown as EventListener);
    };
  }, [onHover]);

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-[#eef2f7] dark:bg-[#0f172a] touch-none select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={endPointer}
      onPointerLeave={() => {
        onHover(null);
        setTip(null);
      }}
      onMouseLeave={() => {
        onHover(null);
        setTip(null);
      }}
      onPointerDown={handlePointerDown}
      onDoubleClick={(e) => {
        // Desktop double-click to zoom in, anchored at cursor
        zoomAtPoint(e.clientX, e.clientY, zoom + 1);
      }}
      style={{
        cursor: drag ? "grabbing" : "grab",
        willChange: drag ? "transform" : undefined,
      }}
    >
      {/* Map tiles subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #64748b 1px, transparent 1px), linear-gradient(to bottom, #64748b 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
        aria-hidden
      />

      <svg
        viewBox={vb}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Kolkata ward map"
      >
        {/* Surrounding  light base for metro context */}
        <rect
          x={vbX}
          y={vbY}
          width={vbW}
          height={vbH}
          fill="#f1f5f9"
          className="dark:fill-[#1e293b]/40"
          onMouseEnter={() => {
            onHover(null);
            setTip(null);
          }}
        />
        {/* Hooghly River hint  west of city */}
        <rect
          x={vbX}
          y={vbY}
          width={vbW * 0.12}
          height={vbH}
          fill="#e0f2fe"
          opacity={0.6}
          className="dark:fill-[#0c4a6e]/20"
        />
        {/* Surrounding district labels  subtle */}
        <text
          x={vbX + vbW * 0.06}
          y={vbY + vbH * 0.5}
          textAnchor="middle"
          fontSize={8 / z}
          fill="#94a3b8"
          opacity={0.7}
          style={{ fontFamily: "var(--font-sans), Archivo, sans-serif" }}
        >
          Howrah
        </text>
        <text
          x={vbX + vbW * 0.5}
          y={vbY + 14 / z}
          textAnchor="middle"
          fontSize={7 / z}
          fill="#94a3b8"
          opacity={0.6}
          style={{ fontFamily: "var(--font-sans), Archivo, sans-serif" }}
        >
          North 24 Pgs
        </text>
        <text
          x={vbX + vbW * 0.5}
          y={vbY + vbH - 8 / z}
          textAnchor="middle"
          fontSize={7 / z}
          fill="#94a3b8"
          opacity={0.6}
          style={{ fontFamily: "var(--font-sans), Archivo, sans-serif" }}
        >
          South 24 Pgs
        </text>
        <text
          x={vbX + vbW - 18 / z}
          y={vbY + vbH * 0.5}
          textAnchor="middle"
          fontSize={7 / z}
          fill="#94a3b8"
          opacity={0.6}
          style={{ fontFamily: "var(--font-sans), Archivo, sans-serif" }}
          transform={`rotate(90, ${vbX + vbW - 18 / z}, ${vbY + vbH * 0.5})`}
        >
          East Kolkata Wetlands
        </text>
        {cells.map((c) => (
          <WardPolygon
            key={c.wardId}
            cell={c}
            bounds={bounds}
            zoom={z}
            layer={layer}
            isSel={c.wardId === selectedId}
            isHov={c.wardId === hoveredId}
            isSearchMatch={isMatch(c)}
            dimmed={hasSearch && !isMatch(c) && c.wardId !== selectedId}
            onHover={onHover}
            onSelect={onSelect}
            onMove={onMove}
          />
        ))}
        {/* Ward name labels  centroid-placed, non-scaling text */}
        {cells.map((c) => {
          const cen = centroid(c);
          if (!cen) return null;
          const [sx, sy] = project(cen[0], cen[1], bounds);
          const show =
            showLabels ||
            c.wardId === selectedId ||
            c.wardId === hoveredId ||
            isMatch(c);
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
                fill={
                  c.wardId === selectedId
                    ? "white"
                    : c.step && c.step >= 4
                      ? "white"
                      : "#1e293b"
                }
                stroke={c.wardId === selectedId ? "rgba(0,0,0,0.35)" : "white"}
                strokeWidth={0.6 / z}
                paintOrder="stroke"
                style={{
                  fontFamily: "var(--font-sans), Archivo, sans-serif",
                  userSelect: "none",
                }}
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
                  style={{
                    fontFamily: "var(--font-sans), Archivo, sans-serif",
                    userSelect: "none",
                  }}
                >
                  {loc!.length > 13 ? loc!.slice(0, 12) + "…" : loc!}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Scale bar — real-world distance for the current zoom */}
      {(() => {
        const s = scaleForWidth(vbW);
        if (!s) return null;
        return (
          <div
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2"
            aria-hidden
          >
            <div className="mb-0.5 rounded bg-card/70 px-1 text-center text-[10px] font-bold tabular-nums text-foreground/80">
              {s.label}
            </div>
            <div
              className="mx-auto h-1.5 rounded-sm border border-foreground/60 border-t-0 bg-foreground/10"
              style={{ width: s.px }}
            />
          </div>
        );
      })()}

      {/* Zoom controls  Google Maps style vertical stack */}
      <div className="absolute bottom-4 right-3 flex flex-col overflow-hidden rounded-xl border bg-card shadow-lg will-change-transform">
        <button
          onClick={() => {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (rect) zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, zoom + 0.6);
            else setZoom((v) => Math.min(MAX_Z, +(v + 0.6).toFixed(1)));
          }}
          className="flex h-9 w-9 items-center justify-center hover:bg-muted"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={() => {
            const rect = wrapRef.current?.getBoundingClientRect();
            if (rect) zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, zoom - 0.6);
            else setZoom((v) => Math.max(MIN_Z, +(v - 0.6).toFixed(1)));
          }}
          className="flex h-9 w-9 items-center justify-center hover:bg-muted"
          aria-label="Zoom out"
          disabled={z <= MIN_Z + 0.01}
        >
          <ZoomOut className="h-4 w-4 opacity-60" />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="flex h-9 w-9 items-center justify-center hover:bg-muted"
          aria-label="Reset view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={() => {
            const first = cells[0];
            if (first) {
              const cb = centroid(first);
              if (cb) {
                const [sx, sy] = project(cb[0], cb[1], bounds);
                setPan({
                  x: W / 2 - sx - vbW / 2 + baseX,
                  y: H / 2 - sy - vbH / 2 + baseY,
                });
                setZoom(2);
              }
            }
          }}
          className="flex h-9 w-9 items-center justify-center hover:bg-muted"
          aria-label="Locate Kolkata"
        >
          <LocateFixed className="h-4 w-4" />
        </button>
      </div>

      {/* Legend  fixed categories, not decimal-sensitive */}
      <div className="absolute bottom-4 left-3 flex items-center gap-1.5 rounded-full border bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {layer === "risk"
            ? "Risk"
            : layer === "thermal"
              ? "Thermal"
              : layer === "wbgt"
                ? "WBGT"
                : layer === "hi"
                  ? "H-Index"
                  : layer === "exposure"
                    ? "Exposure"
                    : "Vuln"}
        </span>
        {RISK_COLORS.map((c) => (
          <span
            key={c}
            className="h-2.5 w-6 rounded-full"
            style={{ background: c }}
          />
        ))}
        <span className="ml-1 hidden text-[10px] tabular-nums text-muted-foreground sm:inline">
          {layer === "wbgt"
            ? "15°→40°"
            : layer === "hi"
              ? "20°→55°"
              : "Low → Extreme"}
        </span>
      </div>

      {/* Scroll hint */}
      <div className="pointer-events-none absolute left-1/2 top-3 hidden -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-xs text-background opacity-0 transition-opacity peer-hover:opacity-100 md:block">
        Scroll to zoom · Drag to pan · Double-click to zoom in
      </div>

      {/* Hover tooltip  small popup summary */}
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
              {tip.cell.ward !== null ? `Ward ${tip.cell.ward}` : `Location ${tip.cell.wardId}`}
            </p>
            {(() => {
              const loc = getWardLocality(tip.cell.ward);
              return loc ? (
                <p className="mt-0.5 truncate text-[11px] font-medium text-primary">
                  {loc}
                </p>
              ) : null;
            })()}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xl font-black tabular-nums leading-none">
                {tip.cell.riskScore !== null
                  ? tip.cell.riskScore.toFixed(3)
                  : ""}
              </span>
              {tip.cell.category && <RiskBadge category={tip.cell.category} />}
            </div>
            <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
              WBGT{" "}
              {tip.cell.wbgt !== null ? `${tip.cell.wbgt.toFixed(1)}°C` : ""} ·
              Pop{" "}
              {tip.cell.population !== null
                ? tip.cell.population.toLocaleString("en-IN")
                : ""}
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-primary">
              Click for full telemetry →
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
