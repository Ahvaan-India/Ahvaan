"use client";

import { useMemo, useRef, useState, memo, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, LocateFixed, Maximize2, Navigation } from "lucide-react";
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

/**
 * Web-Mercator projection into viewBox units. Mercator (not equirectangular)
 * so slippy-map base tiles underneath align exactly with the ward polygons.
 */
function mercX(lon: number): number {
  return (lon + 180) / 360;
}
function mercY(lat: number): number {
  const c = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (c * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}
function project(lon: number, lat: number, b: MapBounds): [number, number] {
  const fx =
    (mercX(lon) - mercX(b.minLon)) / (mercX(b.maxLon) - mercX(b.minLon) || 1);
  const fy =
    (mercY(lat) - mercY(b.minLat)) / (mercY(b.maxLat) - mercY(b.minLat) || 1);
  return [fx * W, (1 - fy) * H];
}

// Slippy-map tile math (Esri basemaps — keyless, attribution required).
const TILE = 256;
function lonToPx(lon: number, t: number): number {
  return mercX(lon) * TILE * 2 ** t;
}
function latToPx(lat: number, t: number): number {
  return mercY(lat) * TILE * 2 ** t;
}
function pxToLon(px: number, t: number): number {
  return (px / (TILE * 2 ** t)) * 360 - 180;
}
function pxToLat(px: number, t: number): number {
  const n = Math.PI * (1 - (2 * px) / (TILE * 2 ** t));
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}
/**
 * Keyless Esri endpoints (no signup/token). NOTE the z/y/x order — Esri's
 * cached /tile path takes {z}/{y}/{x}, unlike OSM-style {z}/{x}/{y}.
 */
function tileUrl(t: number, x: number, y: number, dark: boolean): string {
  return dark
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${t}/${y}/${x}`
    : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${t}/${y}/${x}`;
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
  // Measured container size (px) for the scale bar + tile resolution.
  const [boxW, setBoxW] = useState(0);
  const [boxH, setBoxH] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      setBoxW(r?.width ?? 0);
      setBoxH(r?.height ?? 0);
    });
    ro.observe(el);
    setBoxW(el.clientWidth);
    setBoxH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  // Base-map tiles follow the app theme (topo / dark-gray).
  const [darkTiles, setDarkTiles] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDarkTiles(el.classList.contains("dark"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => mo.disconnect();
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

  // Derived viewBox with pan (pan is in viewBox units).
  // Aspect-fitted: the short axis expands to the container aspect, so at
  // min zoom the whole ward map fits on one screen — never cropped, never
  // letterboxed — at every zoom level.
  let vbW = W / z,
    vbH = H / z;
  const aspect = boxW > 0 && boxH > 0 ? boxW / boxH : W / H;
  if (aspect > vbW / vbH) vbW = vbH * aspect;
  else vbH = vbW / aspect;
  const baseX = W / 2 - vbW / 2,
    baseY = H / 2 - vbH / 2;
  const vbX = baseX - pan.x,
    vbY = baseY - pan.y;
  const vb = `${vbX} ${vbY} ${vbW} ${vbH}`;

  // Slippy-map zoom picked so 1 tile px ≈ 1 screen px (crisp, not wasteful).
  // Uses cover-scale (max of the two axes) to match the slice mapping.
  const tileZoom = useMemo(() => {
    const lonSpan = bounds.maxLon - bounds.minLon || 1;
    const sx = (boxW || 800) / vbW;
    const sy = boxH > 0 ? boxH / vbH : sx;
    const t = Math.log2((Math.max(sx, sy) * W * 360) / (TILE * lonSpan));
    return Math.max(10, Math.min(17, Math.round(t)));
  }, [bounds, boxW, boxH, vbW, vbH]);

  // Tiles covering the current view, positioned in viewBox units so they
  // sit exactly under the ward polygons (same Mercator projection).
  const tiles = useMemo(() => {
    const t = tileZoom;
    const S = TILE * 2 ** t;
    const mxMin = mercX(bounds.minLon) * S;
    const mxMax = mercX(bounds.maxLon) * S;
    const myMin = mercY(bounds.maxLat) * S;
    const myMax = mercY(bounds.minLat) * S;
    const u2mx = (vx: number) => mxMin + (vx / W) * (mxMax - mxMin);
    const u2my = (vy: number) => myMin + (vy / H) * (myMax - myMin);
    const x0 = Math.floor(u2mx(vbX) / TILE);
    const x1 = Math.floor(u2mx(vbX + vbW) / TILE);
    const y0 = Math.floor(u2my(vbY) / TILE);
    const y1 = Math.floor(u2my(vbY + vbH) / TILE);
    const maxTile = 2 ** t - 1;
    const out: Array<{
      key: string;
      url: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y > maxTile) continue;
        const xx = (((x % (maxTile + 1)) + maxTile + 1) % (maxTile + 1)) | 0;
        const [ax, ay] = project(pxToLon(x * TILE, t), pxToLat(y * TILE, t), bounds);
        const [bx, by] = project(
          pxToLon((x + 1) * TILE, t),
          pxToLat((y + 1) * TILE, t),
          bounds,
        );
        out.push({
          key: `${t}/${xx}/${y}`,
          url: tileUrl(t, xx, y, darkTiles),
          // ay = north edge (smaller screen-y), by = south edge: origin at
          // the top with positive height (was flipped before).
          x: ax,
          y: ay,
          w: bx - ax,
          h: by - ay,
        });
      }
    }
    return out;
  }, [tileZoom, bounds, vbX, vbY, vbW, vbH, darkTiles]);

  // Belt-and-braces: whenever the parent clears the hover (page-level
  // mouse-leave, overlay enter), drop the tooltip too — never show a popup
  // for a ward the pointer is no longer on.
  useEffect(() => {
    if (hoveredId === null) setTip(null);
  }, [hoveredId]);

  const onMove = useCallback(
    (e: React.MouseEvent, cell: MapWard) => {
      if (drag) return; // suppress tooltip while dragging
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.min(e.clientX - rect.left + 14, rect.width - 188);
      const y = Math.min(e.clientY - rect.top + 14, rect.height - 120);
      setTip({ x: Math.max(x, 6), y: Math.max(y, 6), cell });
    },
    [drag],
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

  // Map gestures (drag/pinch/wheel/double-click) must only start on the
  // map + layout itself — never on overlay controls (zoom stack, legend).
  // Control containers carry `data-map-control`; anything inside them is
  // left alone so buttons stay clickable and drags starting there don't pan.
  const isControlTarget = (e: { target: unknown }): boolean => {
    const t = e.target as unknown as
      | { closest?: (sel: string) => unknown }
      | null;
    try {
      return Boolean(t && typeof t.closest === "function" && t.closest("[data-map-control]"));
    } catch {
      return false;
    }
  };

  // Native non-passive wheel listener: React attaches wheel passively at the
  // root, so e.preventDefault() in onWheel is ignored and the page scrolls
  // instead of zooming. This keeps scroll-to-zoom (and trackpad pinch,
  // which arrives as ctrlKey+wheel) on the map.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (isControlTarget(e)) return;
      e.preventDefault();
      const step = e.ctrlKey ? 0.01 : 0.0025;
      const nz = viewRef.current.zoom * (1 - e.deltaY * step);
      zoomAtPoint(e.clientX, e.clientY, nz);
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [zoomAtPoint]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isControlTarget(e)) return;
    if (e.pointerType !== "mouse") setTip(null);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    // Two fingers → start pinch, cancel single-finger drag. Only pinches
    // capture the pointer (so moves keep flowing mid-gesture); single-finger
    // drags stay uncaptured so ward polygon taps/clicks still fire.
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
      return;
    }
    // Any pointer can start a pan (mouse on PC, touch/pen on mobile);
    // a tiny movement is still treated as a tap so ward clicks work.
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
    if (pointersRef.current.size === 2) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    }
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
      className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#e6edf5] via-[#eef2f7] to-[#dbe4ee] touch-none select-none dark:from-[#0a1120] dark:via-[#0f172a] dark:to-[#131e32]"
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
        // Desktop double-click to zoom in, anchored at cursor (not on controls)
        if (isControlTarget(e)) return;
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
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Kolkata ward map"
      >
        {/* Invisible hit layer: clears hover over empty (non-ward) areas */}
        <rect
          x={vbX}
          y={vbY}
          width={vbW}
          height={vbH}
          fill="transparent"
          onMouseEnter={() => {
            onHover(null);
            setTip(null);
          }}
        />
        {/* Real base map (CARTO light/dark, OSM data) under the wards */}
        {tiles.map((tl) => (
          <image
            key={tl.key}
            href={tl.url}
            x={tl.x}
            y={tl.y}
            width={tl.w}
            height={tl.h}
            opacity={darkTiles ? 0.8 : 0.9}
            preserveAspectRatio="none"
          />
        ))}
        {/* Base-map tiles carry their own place labels — none drawn here. */}
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
          // All-white labels; legibility on bright fills comes from the
          // dark .map-label halo (~3px screen).
          const ink = "#ffffff";
          return (
            <g key={`lbl-${c.wardId}`} style={{ pointerEvents: "none" }}>
              <text
                x={sx}
                y={showLoc ? sy - 5 / z : sy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(5.5, 10 / Math.pow(z, 0.35))}
                fontWeight={isEmph ? 800 : 700}
                fill={ink}
                className="map-label"
                strokeWidth={3 / z}
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
                  y={sy + 8 / z}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.max(4.5, 7 / Math.pow(z, 0.35))}
                  fontWeight={600}
                  fill={ink}
                  opacity={0.82}
                  className="map-label"
                  strokeWidth={2.5 / z}
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

      {/* Soft vignette for depth (non-interactive) */}
      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_110px_rgba(15,23,42,0.14)] dark:shadow-[inset_0_0_130px_rgba(0,0,0,0.5)]"
        aria-hidden
      />

      {/* Tile attribution (required by Esri/OSM terms) */}
      <div
        className="pointer-events-none absolute left-3 top-3 rounded bg-card/80 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground backdrop-blur"
        aria-hidden
      >
        © Esri · © OpenStreetMap contributors
      </div>

      {/* North indicator */}
      <div
        className="pointer-events-none absolute right-3 top-3 flex h-9 w-9 flex-col items-center justify-center rounded-full border bg-card/90 leading-none shadow-lg backdrop-blur"
        aria-hidden
      >
        <Navigation className="h-3 w-3 fill-primary text-primary" />
        <span className="text-[8px] font-black tracking-wide">N</span>
      </div>

      {/* Zoom controls  Google Maps style vertical stack (above hover popup) */}
      <div
        data-map-control
        onMouseEnter={() => {
          onHover(null);
          setTip(null);
        }}
        className="absolute bottom-4 right-3 z-20 flex flex-col overflow-hidden rounded-xl border bg-card shadow-lg will-change-transform"
      >
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
      <div data-map-control className="absolute bottom-4 left-3 flex items-center gap-1.5 rounded-full border bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur">
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
