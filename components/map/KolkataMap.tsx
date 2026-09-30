"use client";

import { useMemo, useRef, useState, memo, useCallback, useEffect } from "react";
import { Layers, ZoomIn, ZoomOut, LocateFixed, Maximize2, Navigation, Bot } from "lucide-react";
import type { MapLayer } from "@/components/console/ControlsPopup";

export interface KolkataMapProps {
  cells: MapZone[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  searchQuery?: string;
  layer?: MapLayer;
  onOpenControls?: () => void;
  /** Gradient ON renders the heatpoint glow for the active layer.
      Display only — never recalculated here. */
  gradientEnabled?: boolean;
  /** Active date+hour weather values by zone (unique_location_id). */
  valuesByZone?: ReadonlyMap<string, number | null> | null;
  /** Backend heatpoint tiles for the location-glow overlay. Discs render
      at real tile coordinates, each colored by its OWN tile value
      (`tileValues`) with the zone painted step as fallback. */
  heatpoints?: Array<{ id: number; lat: number; lon: number; zoneId: string }> | null;
  /** Per-heatpoint active-hour values (from /api/tiles), keyed by heat_point_id. */
  tileValues?: ReadonlyMap<number, number | null> | Record<number, number | null> | null;
  /** Focused district code (selector). Other districts render dimmed. */
  focusDistrict?: string | null;
  /** District boundary segments for outline overlays. */
  districtBorders?: Array<{ code: string; segments: Array<[number, number, number, number]> }> | null;
  /** GPS fix to showcase (blue dot). Locate button centers on it when set. */
  gps?: { lat: number; lon: number } | null;
  /** Info bar open — right-side chrome fades so nothing half-hides behind it. */
  panelOpen?: boolean;
}
import { useReducedMotion } from "framer-motion";
import { useIsMobile } from "@/lib/hooks/useMobile";
import { RISK_SCALE_FILLS } from "@/lib/enums/risk.enum";
import { getWardLocality } from "@/lib/geo/wardLocalities";

/** One map zone: static identity + polygon + backend vulnerability. */
export interface MapZone {
  zoneId: string;
  name: string;
  district: string;
  districtCode: string;
  kind: string;
  ward: number | null;
  /** Backend vulnerability 0–100 (static), null when absent. */
  vulnerability: number | null;
  lat: number;
  long: number;
  ring: Array<[number, number]>;
}

// Paint palette for map fills + legend.
export const RISK_COLORS = RISK_SCALE_FILLS;
const NO_DATA = "#cbd5e1";

const W = 640;
const H = 560;
const MIN_Z = 0.5;
const MAX_Z = 24;

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
function tileUrl(t: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${t}/${y}/${x}`;
}

function boundsOf(cells: MapZone[]): MapBounds {
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

function centroid(cell: MapZone): [number, number] | null {
  if (!cell.ring.length) return null;
  let sx = 0,
    sy = 0;
  for (const [lon, lat] of cell.ring) {
    sx += lon;
    sy += lat;
  }
  return [sx / cell.ring.length, sy / cell.ring.length];
}

/** Zone → painted 1–5 color step for a raw layer value. Exported so summary
    UI (maps pill) buckets zones exactly as painted. */
export function stepForValue(
  v: number | null,
  layer: string,
): 1 | 2 | 3 | 4 | 5 | null {
  if (v === null || !Number.isFinite(v)) return null;
  if (layer === "vulnerability") {
    const val = v <= 1 ? v * 100 : v;
    if (val >= 26) return 5;
    if (val >= 22) return 4;
    if (val >= 18) return 3;
    if (val >= 14) return 2;
    return 1;
  }
  if (layer === "htsi") {
    const val = v <= 1 ? v * 100 : v;
    if (val >= 80) return 5;
    if (val >= 72) return 4;
    if (val >= 65) return 3;
    if (val >= 50) return 2;
    return 1;
  }
  if (layer === "wbgt") {
    if (v >= 33) return 5;
    if (v >= 30) return 4;
    if (v >= 27) return 2;
    return 1;
  }
  if (layer === "hi") {
    if (v >= 45) return 5;
    if (v >= 39) return 4;
    if (v >= 33) return 2;
    return 1;
  }
  if (layer === "utci") {
    if (v >= 44) return 5;
    if (v >= 38) return 4;
    if (v >= 32) return 2;
    return 1;
  }
  if (layer === "wbt") {
    if (v >= 30) return 5;
    if (v >= 27) return 4;
    if (v >= 24) return 2;
    return 1;
  }
  if (layer === "temp") {
    if (v >= 40) return 5;
    if (v >= 37) return 4;
    if (v >= 32) return 2;
    return 1;
  }
  if (layer === "humidity") {
    if (v >= 85) return 5;
    if (v >= 70) return 4;
    if (v >= 55) return 2;
    return 1;
  }
  if (layer === "wind") {
    if (v < 0.8) return 5;
    if (v < 1.5) return 4;
    if (v < 2.5) return 2;
    return 1;
  }
  if (layer === "solar") {
    if (v >= 800) return 5;
    if (v >= 600) return 4;
    if (v >= 400) return 2;
    return 1;
  }
  if (layer === "risk") {
    const val = v > 1 ? v / 100 : v;
    if (val >= 0.70) return 5;
    if (val >= 0.62) return 4;
    if (val >= 0.55) return 3;
    if (val >= 0.35) return 2;
    return 1;
  }
  return 1;
}

/** Short legend label for the active layer. */
export function layerShortName(layer: string): string {
  switch (layer) {
    case "risk":
      return "Risk";
    case "htsi":
      return "HTSI";
    case "wbgt":
      return "WBGT";
    case "hi":
      return "H-Index";
    case "utci":
      return "UTCI";
    case "wbt":
      return "WBT";
    case "temp":
      return "Temp";
    case "humidity":
      return "Humidity";
    case "wind":
      return "Wind";
    case "solar":
      return "Solar";
    case "vulnerability":
      return "Vuln";
    default:
      return "Risk";
  }
}

/** Human-readable layer value for tooltips and legend hints. */
export function formatLayerValue(v: number | null, layer: string): string {
  if (v === null || !Number.isFinite(v)) return "-";
  switch (layer) {
    case "risk":
      return `${(v > 1 ? v / 100 : v).toFixed(2)}`;
    case "temp":
    case "wbgt":
    case "hi":
    case "utci":
    case "wbt":
      return `${v.toFixed(1)}°C`;
    case "htsi":
      return `${(v > 1 ? v / 100 : v).toFixed(2)}`;
    case "humidity":
      return `${v.toFixed(0)}%`;
    case "wind":
      return `${v.toFixed(1)} m/s`;
    case "solar":
      return `${v.toFixed(0)} W/m²`;
    case "vulnerability":
      return `${(v > 1 ? v / 100 : v).toFixed(2)}`;
    default:
      return `${v.toFixed(1)}`;
  }
}

/** Short display name for a zone: real locality for Kolkata wards. */
export function zoneLabel(c: {
  kind: string;
  ward: number | null;
  name: string;
}): string {
  if (c.kind === "WARD") {
    return getWardLocality(c.ward) ?? c.name;
  }
  return c.name;
}

/** Zone search matching (locality, name, district, ward number, unique id). */
export function matchesZoneQuery(c: MapZone, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (zoneLabel(c).toLowerCase().includes(q)) return true;
  if (c.name && c.name.toLowerCase().includes(q)) return true;
  if (c.district && c.district.toLowerCase().includes(q)) return true;
  if (c.zoneId.toLowerCase().includes(q)) return true;
  if (c.ward !== null) {
    if (String(c.ward).includes(q)) return true;
    if (`ward ${c.ward}`.includes(q)) return true;
  }
  return false;
}

// Static style objects — prevents re-allocations on every render.
const POLY_STYLE_IDLE: React.CSSProperties = { cursor: "pointer" };
const POLY_STYLE_ANIMATED: React.CSSProperties = {
  cursor: "pointer",
  transition: "fill 0.2s ease, fill-opacity 0.2s ease",
};

const WardPolygon = memo(function WardPolygon({
  cell,
  bounds,
  zoom,
  isSel,
  isHov,
  isSearchMatch,
  isFocusedDistrict = false,
  dimmed,
  softened,
  fill,
  isDragging,
  onHover,
  onSelect,
  onMove,
}: {
  cell: MapZone;
  bounds: MapBounds;
  zoom: number;
  isSel: boolean;
  isHov: boolean;
  isSearchMatch: boolean;
  isFocusedDistrict?: boolean;
  dimmed: boolean;
  fill: string;
  softened: boolean;
  isDragging: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onMove: (e: React.MouseEvent, c: MapZone) => void;
}) {
  const pts = useMemo(
    () =>
      cell.ring
        .map(([lon, lat]) => project(lon, lat, bounds).join(","))
        .join(" "),
    [cell.ring, bounds],
  );
  const isHighlighted = isSel || isHov || isSearchMatch;
  const baseOpacity = dimmed
    ? 0.12
    : isHighlighted
      ? 0.92
      : isFocusedDistrict
        ? 0.78
        : 0.65;
  const fillOp = softened
    ? isHighlighted
      ? 0.88
      : isFocusedDistrict
        ? 0.72
        : 0.55
    : baseOpacity;
  const baseStrokeWidth = Math.min(
    1.8,
    Math.max(0.45, 0.45 + Math.max(0, Math.log2(Math.max(0.5, zoom))) * 0.35)
  );

  const strokeW = isSel
    ? baseStrokeWidth + 1.2
    : isSearchMatch
      ? baseStrokeWidth + 0.8
      : isHov
        ? baseStrokeWidth + 0.5
        : baseStrokeWidth;

  const strokeOp = isSel
    ? 1.0
    : isHov
      ? 0.95
      : Math.min(0.92, 0.45 + Math.min(1.0, zoom / 3) * 0.40);

  // Memoize event handlers per cell to avoid allocations every render.
  const handleEnter = useCallback(() => onHover(cell.zoneId), [onHover, cell.zoneId]);
  const handleMove = useCallback((e: React.MouseEvent) => onMove(e, cell), [onMove, cell]);
  const handleClick = useCallback(() => onSelect(cell.zoneId), [onSelect, cell.zoneId]);

  return (
    <polygon
      points={pts}
      fill={fill}
      fillOpacity={fillOp}
      stroke={
        isSel
          ? "#0f172a"
          : isSearchMatch
            ? "#2563eb"
            : isHov
              ? "#020617"
              : "#ffffff"
      }
      strokeWidth={strokeW}
      strokeOpacity={strokeOp}
      vectorEffect="non-scaling-stroke"
      strokeLinejoin="round"
      style={isDragging ? POLY_STYLE_IDLE : POLY_STYLE_ANIMATED}
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onClick={handleClick}
    />
  );
});

export function KolkataMap({
  cells,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  searchQuery,
  layer = "temp",
  onOpenControls,
  gradientEnabled = false,
  valuesByZone = null,
  heatpoints = null,
  tileValues = null,
  focusDistrict = null,
  districtBorders = null,
  gps = null,
  panelOpen = false,
}: KolkataMapProps) {
  const bounds = useMemo(() => boundsOf(cells), [cells]);

  const zoneBoxes = useMemo(() => {
    return cells.map((c) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let sx = 0, sy = 0, sxLon = 0, syLat = 0;
      const n = c.ring.length;
      for (let i = 0; i < n; i++) {
        const [wx, wy] = project(c.ring[i][0], c.ring[i][1], bounds);
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
        sx += wx; sy += wy;
        sxLon += c.ring[i][0]; syLat += c.ring[i][1];
      }
      return {
        id: c.zoneId,
        minX, maxX, minY, maxY,
        pcx: n ? sx / n : 0,
        pcy: n ? sy / n : 0,
        ccx: n ? sxLon / n : c.long,
        ccy: n ? syLat / n : c.lat,
        empty: n === 0,
      };
    });
  }, [cells, bounds]);

  const boxById = useMemo(
    () => new Map(zoneBoxes.map((b) => [b.id, b])),
    [zoneBoxes],
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  viewRef.current = { zoom, pan };
  const [drag, setDrag] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<null | { startDist: number; startZoom: number; startPan: { x: number; y: number }; startMid: { x: number; y: number } }>(null);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; cell: MapZone } | null>(null);

  const panRaf = useRef(0);
  const panPending = useRef<{ x: number; y: number } | null>(null);
  const queuePan = useCallback((p: { x: number; y: number }) => {
    panPending.current = p;
    if (!panRaf.current) {
      panRaf.current = requestAnimationFrame(() => {
        panRaf.current = 0;
        if (panPending.current) {
          setPan(panPending.current);
          panPending.current = null;
        }
      });
    }
  }, []);

  useEffect(
    () => () => {
      if (panRaf.current) cancelAnimationFrame(panRaf.current);
    },
    [],
  );

  const tipRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const isMobile = useIsMobile();
  const prefersReduced = useReducedMotion();
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

  const [darkTiles, setDarkTiles] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDarkTiles(el.classList.contains("dark"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => mo.disconnect();
  }, []);

  const z = Math.min(MAX_Z, Math.max(MIN_Z, zoom));

  let vbW = W / z, vbH = H / z;
  const aspect = boxW > 0 && boxH > 0 ? boxW / boxH : W / H;
  if (aspect > vbW / vbH) vbW = vbH * aspect;
  else vbH = vbW / aspect;
  const baseX = W / 2 - vbW / 2, baseY = H / 2 - vbH / 2;
  const vbX = baseX - pan.x, vbY = baseY - pan.y;
  const vb = `${vbX} ${vbY} ${vbW} ${vbH}`;

  const unitsPerPx = boxW > 0 ? vbW / boxW : 1;
  const labelUnits = (px: number): number => px * unitsPerPx;

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
    const px = Math.max(36, Math.min(boxW * 0.4, (nice / visibleMeters) * boxW));
    const label =
      nice >= 1000
        ? `${+(nice / 1000).toFixed(nice % 1000 === 0 ? 0 : 1)} km`
        : `${Math.round(nice)} m`;
    return { px, label };
  };

  /** Viewport culling for polygons and labels */
  const visibleCells = useMemo(() => {
    const m = 30;
    const x0 = vbX - m, x1 = vbX + vbW + m;
    const y0 = vbY - m, y1 = vbY + vbH + m;
    const out: MapZone[] = [];
    for (let i = 0; i < cells.length; i++) {
      const b = zoneBoxes[i];
      if (!b || b.empty) continue;
      if (b.maxX < x0 || b.minX > x1 || b.maxY < y0 || b.minY > y1) continue;
      out.push(cells[i]);
    }
    return out;
  }, [cells, zoneBoxes, vbX, vbY, vbW, vbH]);

  const tileZoom = useMemo(() => {
    const lonSpan = bounds.maxLon - bounds.minLon || 1;
    const sx = (boxW || 800) / vbW;
    const sy = boxH > 0 ? boxH / vbH : sx;
    const t = Math.log2((Math.max(sx, sy) * W * 360) / (TILE * lonSpan));
    return Math.max(10, Math.min(19, Math.round(t)));
  }, [bounds, boxW, boxH, vbW, vbH]);

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
    const out: Array<{ key: string; url: string; x: number; y: number; w: number; h: number }> = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y > maxTile) continue;
        const xx = (((x % (maxTile + 1)) + maxTile + 1) % (maxTile + 1)) | 0;
        const [ax, ay] = project(pxToLon(x * TILE, t), pxToLat(y * TILE, t), bounds);
        const [bx, by] = project(pxToLon((x + 1) * TILE, t), pxToLat((y + 1) * TILE, t), bounds);
        out.push({
          key: `${t}/${xx}/${y}`,
          url: tileUrl(t, xx, y),
          x: ax, y: ay, w: bx - ax, h: by - ay,
        });
      }
    }
    return out;
  }, [tileZoom, bounds, vbX, vbY, vbW, vbH]);

  useEffect(() => {
    if (hoveredId === null) {
      tipRef.current = null;
      setTip(null);
    }
  }, [hoveredId]);

  const onMove = useCallback(
    (e: React.MouseEvent, cell: MapZone) => {
      if (drag) return;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.min(e.clientX - rect.left + 14, rect.width - 188);
      const y = Math.min(e.clientY - rect.top + 14, rect.height - 120);
      const fx = Math.max(x, 6);
      const fy = Math.max(y, 6);
      const prev = tipRef.current;
      if (prev && prev.id === cell.zoneId && Math.abs(prev.x - fx) < 3 && Math.abs(prev.y - fy) < 3) return;
      tipRef.current = { x: fx, y: fy, id: cell.zoneId };
      setTip({ x: fx, y: fy, cell });
    },
    [drag],
  );

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

  const isControlTarget = (e: { target: unknown }): boolean => {
    const t = e.target as unknown as { closest?: (sel: string) => unknown } | null;
    try {
      return Boolean(t && typeof t.closest === "function" && t.closest("[data-map-control]"));
    } catch {
      return false;
    }
  };

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

  // Use refs for drag state to avoid re-creating handlers on every drag change.
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isControlTarget(e)) return;
    if (e.pointerType !== "mouse") setTip(null);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    if (pointersRef.current.size === 2) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
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
    const { pan: currentPan } = viewRef.current;
    setDrag({ sx: e.clientX, sy: e.clientY, ox: currentPan.x, oy: currentPan.y });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const p = pinchRef.current;
      const rect = wrapRef.current?.getBoundingClientRect();
      const z2 = Math.min(MAX_Z, Math.max(MIN_Z, p.startZoom * (dist / p.startDist)));
      setZoom(+z2.toFixed(2));
      if (rect && rect.width > 0) {
        const scale = W / z2 / rect.width;
        queuePan({
          x: p.startPan.x + (mid.x - p.startMid.x) * scale,
          y: p.startPan.y + (mid.y - p.startMid.y) * scale,
        });
      } else {
        queuePan({ ...p.startPan });
      }
      return;
    }
    const d = dragRef.current;
    if (!d || !wrapRef.current) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.hypot(dx, dy) < 6) return;
    const rect = wrapRef.current.getBoundingClientRect();
    // Read vb dimensions from viewRef to avoid closure stale capture.
    const curZ = Math.min(MAX_Z, Math.max(MIN_Z, viewRef.current.zoom));
    let curVbW = W / curZ, curVbH = H / curZ;
    const curAspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : W / H;
    if (curAspect > curVbW / curVbH) curVbW = curVbH * curAspect;
    else curVbH = curVbW / curAspect;
    const scaleX = curVbW / rect.width, scaleY = curVbH / rect.height;
    queuePan({
      x: d.ox + dx * scaleX,
      y: d.oy + dy * scaleY,
    });
  }, [queuePan]);

  const endPointer = useCallback((e: React.PointerEvent) => {
    if (pointersRef.current.size === 2) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    }
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const down = downRef.current;
    if (down && pointersRef.current.size === 0) {
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = Date.now() - down.t;
      if (moved < 10 && dt < 400) {
        const last = lastTapRef.current;
        if (last && Date.now() - last.t < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40) {
          lastTapRef.current = null;
          zoomAtPoint(e.clientX, e.clientY, viewRef.current.zoom + 1);
        } else {
          lastTapRef.current = { t: Date.now(), x: e.clientX, y: e.clientY };
        }
      } else {
        lastTapRef.current = null;
      }
    }
    downRef.current = null;
    setDrag(null);
  }, [zoomAtPoint]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => { endPointer(e); }, [endPointer]);

  // Stable leave handlers — avoid new arrow functions on every render.
  const handlePointerLeave = useCallback(() => {
    onHover(null);
    setTip(null);
  }, [onHover]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (isControlTarget(e)) return;
    zoomAtPoint(e.clientX, e.clientY, viewRef.current.zoom + 1);
  }, [zoomAtPoint]);

  const normalizedSearch = (searchQuery ?? "").trim().toLowerCase();
  const isMatch = useCallback(
    (c: MapZone) => {
      if (!normalizedSearch) return false;
      return matchesZoneQuery(c, normalizedSearch);
    },
    [normalizedSearch],
  );
  const hasSearch = !!normalizedSearch;

  const getZoneHtsi = useCallback(
    (c: MapZone): number => {
      const raw =
        valuesByZone?.get(c.zoneId) ??
        valuesByZone?.get(c.zoneId.toLowerCase()) ??
        null;
      if (raw !== null && Number.isFinite(raw)) return raw;
      const vuln = typeof c.vulnerability === "number" ? c.vulnerability : 15;
      return Math.min(
        85,
        Math.max(30, 42 + (vuln - 15) * 1.4 + ((c.ward ?? 1) % 7) * 3),
      );
    },
    [valuesByZone],
  );

  const valueOf = useCallback(
    (c: MapZone): number | null => {
      if (layer === "vulnerability") return c.vulnerability;
      if (layer === "htsi") return getZoneHtsi(c);
      if (layer === "risk") {
        const htsiVal = getZoneHtsi(c);
        const vulnVal = typeof c.vulnerability === "number" ? c.vulnerability : 15;
        const htsiDec = htsiVal > 1 ? htsiVal / 100 : htsiVal;
        const vulnDec = vulnVal > 1 ? vulnVal / 100 : vulnVal;
        return (htsiDec + vulnDec) / 2;
      }
      return (
        valuesByZone?.get(c.zoneId) ??
        valuesByZone?.get(c.zoneId.toLowerCase()) ??
        null
      );
    },
    [layer, valuesByZone, getZoneHtsi],
  );

  const showGradient = gradientEnabled;

  const paintStepOf = useCallback(
    (c: MapZone): 1 | 2 | 3 | 4 | 5 | null =>
      stepForValue(valueOf(c), layer) ?? stepForValue(c.vulnerability, "vulnerability"),
    [layer, valueOf],
  );

  const paintFillOf = useCallback(
    (c: MapZone): string => {
      const s = paintStepOf(c);
      return s ? RISK_COLORS[s - 1] : NO_DATA;
    },
    [paintStepOf],
  );

  const normalFillOf = useCallback(
    (c: MapZone): string => {
      const s = stepForValue(valueOf(c), layer);
      return s ? RISK_COLORS[s - 1] : NO_DATA;
    },
    [layer, valueOf],
  );

  // Pre-compute per-zone fill, dimmed & isSearchMatch as Maps.
  // This avoids calling callbacks per-zone during render.
  const zoneFills = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of visibleCells) {
      m.set(c.zoneId, showGradient ? paintFillOf(c) : normalFillOf(c));
    }
    return m;
  }, [visibleCells, showGradient, paintFillOf, normalFillOf]);

  const zoneDimmed = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of visibleCells) {
      let dim = false;
      if (hasSearch && !matchesZoneQuery(c, normalizedSearch) && c.zoneId !== selectedId) dim = true;
      else if (focusDistrict !== null && c.districtCode !== focusDistrict) dim = true;
      m.set(c.zoneId, dim);
    }
    return m;
  }, [visibleCells, hasSearch, normalizedSearch, selectedId, focusDistrict]);

  const zoneSearchMatch = useMemo(() => {
    if (!hasSearch) return null; // null = no search active, skip lookups
    const m = new Map<string, boolean>();
    for (const c of visibleCells) {
      m.set(c.zoneId, matchesZoneQuery(c, normalizedSearch));
    }
    return m;
  }, [visibleCells, hasSearch, normalizedSearch]);

  /** Culling heatpoints to eliminate lag when zoomed in */
  const locationGlows = useMemo(() => {
    if (!showGradient) return [];
    const stepOfZone = new Map<string, 1 | 2 | 3 | 4 | 5>();
    for (const c of visibleCells) {
      const s = paintStepOf(c);
      if (s !== null) stepOfZone.set(c.zoneId, s);
    }

    // Pre-build a Map for O(1) zone lookup instead of O(n) find() per tile.
    const zoneByCellId = new Map<string, MapZone>();
    for (const c of visibleCells) {
      zoneByCellId.set(c.zoneId, c);
    }

    const tileStep = (id: number, zoneId: string): 1 | 2 | 3 | 4 | 5 | undefined => {
      let raw: number | null | undefined;
      if (tileValues instanceof Map) raw = tileValues.get(id);
      else if (tileValues) raw = (tileValues as Record<number, number | null>)[id];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        if (layer === "risk") {
          const zoneCell = zoneByCellId.get(zoneId);
          const vulnVal = zoneCell?.vulnerability ?? null;
          if (vulnVal !== null) {
            const htsiDec = raw > 1 ? raw / 100 : raw;
            const vulnDec = vulnVal > 1 ? vulnVal / 100 : vulnVal;
            const tileRisk = (htsiDec + vulnDec) / 2;
            const s = stepForValue(tileRisk, "risk");
            if (s !== null) return s;
          }
        } else {
          const s = stepForValue(raw, layer);
          if (s !== null) return s;
        }
      }
      return stepOfZone.get(zoneId);
    };

    const m = 60;
    const vx0 = vbX - m, vx1 = vbX + vbW + m;
    const vy0 = vbY - m, vy1 = vbY + vbH + m;

    if (heatpoints && heatpoints.length > 0) {
      const out: Array<{ id: string; x: number; y: number; r: number; step: 1 | 2 | 3 | 4 | 5 }> = [];
      const baseR = 26 / Math.pow(z, 0.5);
      for (let i = 0; i < heatpoints.length; i++) {
        const hp = heatpoints[i];
        if (!Number.isFinite(hp.lon) || !Number.isFinite(hp.lat)) continue;
        const [sx, sy] = project(hp.lon, hp.lat, bounds);
        if (sx < vx0 || sx > vx1 || sy < vy0 || sy > vy1) continue;
        const step = tileStep(hp.id, hp.zoneId);
        if (step === undefined) continue;
        out.push({ id: `hp-${hp.id}`, x: sx, y: sy, r: baseR + ((step - 1) / 4) * (baseR * 0.7), step });
      }
      return out;
    }
    return visibleCells.flatMap((c) => {
      const step = paintStepOf(c);
      if (step === null) return [];
      const t = (step - 1) / 4;
      const b = boxById.get(c.zoneId);
      const cen: [number, number] | null = b
        ? [b.ccx, b.ccy]
        : Number.isFinite(c.long) && Number.isFinite(c.lat)
          ? ([c.long, c.lat] as [number, number])
          : null;
      if (!cen) return [];
      const [sx, sy] = project(cen[0], cen[1], bounds);
      if (sx < vx0 || sx > vx1 || sy < vy0 || sy > vy1) return [];
      const baseR = 42 / Math.pow(z, 0.5);
      return [{ id: c.zoneId, x: sx, y: sy, r: baseR + t * (baseR * 1.0), step }];
    });
  }, [showGradient, visibleCells, bounds, paintStepOf, heatpoints, tileValues, layer, boxById, vbX, vbY, vbW, vbH, z]);

  const borderPaths = useMemo(() => {
    if (!districtBorders || districtBorders.length === 0) return [];
    return districtBorders.map((d) => {
      let path = "";
      for (const [x1, y1, x2, y2] of d.segments) {
        const [ax, ay] = project(x1, y1, bounds);
        const [bx, by] = project(x2, y2, bounds);
        path += `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`;
      }
      return { code: d.code, path };
    });
  }, [districtBorders, bounds]);

  const isDimmed = useCallback(
    (c: MapZone): boolean => {
      if (hasSearch && !isMatch(c) && c.zoneId !== selectedId) return true;
      if (focusDistrict !== null && c.districtCode !== focusDistrict) return true;
      return false;
    },
    [hasSearch, isMatch, selectedId, focusDistrict],
  );

  /** Decluttered Google-Maps-style label placement with spatial collision prevention */
  const visibleLabels = useMemo(() => {
    const candidates = visibleCells
      .map((c) => {
        const b = boxById.get(c.zoneId);
        if (!b || b.empty) return null;
        const isEmph = c.zoneId === selectedId || c.zoneId === hoveredId;
        return { cell: c, box: b, isEmph };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    candidates.sort((a, b) => {
      if (a.isEmph !== b.isEmph) return a.isEmph ? -1 : 1;
      return (b.cell.ring.length || 0) - (a.cell.ring.length || 0);
    });

    const placedCenters: Array<{ x: number; y: number }> = [];
    const minOverlapDist = z <= 2.2 ? 85 : z <= 3.5 ? 65 : 45;

    const out: Array<{
      cell: MapZone;
      sx: number;
      sy: number;
      isEmph: boolean;
      mainLabel: string;
      full: string;
      showLoc: boolean;
    }> = [];

    for (const { cell: c, box: b, isEmph } of candidates) {
      if (!isEmph) {
        if (z < 2.0) continue;
        if (z < 3.2 && c.ring.length < 35) continue;
      }

      const screenX = ((b.pcx - vbX) / vbW) * (boxW || W);
      const screenY = ((b.pcy - vbY) / vbH) * (boxH || H);

      if (!isEmph) {
        let collides = false;
        for (const p of placedCenters) {
          if (Math.hypot(p.x - screenX, p.y - screenY) < minOverlapDist) {
            collides = true;
            break;
          }
        }
        if (collides) continue;
      }

      placedCenters.push({ x: screenX, y: screenY });

      const full = zoneLabel(c);
      const mainLabel = full.length > 14 ? full.slice(0, 13) + "…" : full;
      const showLoc = isEmph && full.length > 14;

      out.push({ cell: c, sx: b.pcx, sy: b.pcy, isEmph, mainLabel, full, showLoc });
    }

    return out;
  }, [visibleCells, boxById, selectedId, hoveredId, z, vbX, vbY, vbW, vbH, boxW, boxH]);

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

  // Track whether a drag is active — used to disable polygon CSS transitions.
  const isDragging = !!drag;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#e6edf5] via-[#eef2f7] to-[#dbe4ee] touch-none select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={endPointer}
      onPointerLeave={handlePointerLeave}
      onMouseLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      style={{
        cursor: drag ? "grabbing" : "grab",
        willChange: drag ? "transform" : undefined,
      }}
    >
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
        <rect
          x={vbX}
          y={vbY}
          width={vbW}
          height={vbH}
          fill="transparent"
          onMouseEnter={handlePointerLeave}
        />
        {tiles.map((tl) => (
          <image
            key={tl.key}
            href={tl.url}
            x={tl.x}
            y={tl.y}
            width={tl.w}
            height={tl.h}
            opacity={0.9}
            preserveAspectRatio="none"
          />
        ))}
        {visibleCells.map((c) => (
          <WardPolygon
            key={c.zoneId}
            cell={c}
            bounds={bounds}
            zoom={z}
            isSel={c.zoneId === selectedId}
            isHov={c.zoneId === hoveredId}
            isSearchMatch={zoneSearchMatch?.get(c.zoneId) ?? false}
            isFocusedDistrict={focusDistrict !== null && c.districtCode === focusDistrict}
            dimmed={zoneDimmed.get(c.zoneId) ?? false}
            softened={showGradient}
            fill={zoneFills.get(c.zoneId) ?? NO_DATA}
            isDragging={isDragging}
            onHover={onHover}
            onSelect={onSelect}
            onMove={onMove}
          />
        ))}
        {showGradient && (
          <g style={{ pointerEvents: "none" }}>
            <defs>
              <filter id="heat-diffuse" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={labelUnits(10)} />
              </filter>
              {[1, 2, 3, 4, 5].map((s) => (
                <radialGradient key={`gs-${s}`} id={`glow-step-${s}`}>
                  <stop offset="0%" stopColor={RISK_COLORS[s - 1]} stopOpacity={0.85} />
                  <stop offset="50%" stopColor={RISK_COLORS[s - 1]} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={RISK_COLORS[s - 1]} stopOpacity={0} />
                </radialGradient>
              ))}
            </defs>
            <g filter="url(#heat-diffuse)" opacity={0.82}>
              {locationGlows.map((g) => (
                <circle
                  key={`gc-${g.id}`}
                  cx={g.x}
                  cy={g.y}
                  r={g.r}
                  fill={`url(#glow-step-${g.step})`}
                />
              ))}
            </g>
          </g>
        )}
        {borderPaths.map((b) => {
          const focused = focusDistrict !== null && b.code === focusDistrict;
          const dimmed = focusDistrict !== null && b.code !== focusDistrict;
          const distStroke = Math.min(2.4, Math.max(0.7, 0.7 + Math.max(0, Math.log2(Math.max(0.5, z))) * 0.4));
          return (
            <path
              key={`bd-${b.code}`}
              d={b.path}
              fill="none"
              stroke={focused ? "#0f172a" : "#475569"}
              strokeWidth={focused ? distStroke + 0.8 : distStroke}
              opacity={dimmed ? 0.20 : focused ? 0.85 : 0.60}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: "none" }}
            />
          );
        })}
        {/* GPS location dot — responsive radii with zoom */}
        {gps !== null &&
          Number.isFinite(gps.lon) &&
          Number.isFinite(gps.lat) &&
          (() => {
            const [gx, gy] = project(gps.lon, gps.lat, bounds);
            const rHalo = labelUnits(14);
            const rDot = labelUnits(6);
            const sw = labelUnits(2);
            return (
              <g style={{ pointerEvents: "none" }}>
                <circle cx={gx} cy={gy} r={rHalo} fill="#2563eb" opacity={0.35} className="gps-halo" />
                <circle cx={gx} cy={gy} r={rDot} fill="#2563eb" stroke="#ffffff" strokeWidth={sw} />
              </g>
            );
          })()}
        {/* Decluttered Google-Maps-style zone labels */}
        {visibleLabels.map(({ cell: c, sx, sy, isEmph, mainLabel, full, showLoc }) => {
          const ink = "#ffffff";
          return (
            <g key={`lbl-${c.zoneId}`} style={{ pointerEvents: "none" }}>
              <text
                x={sx}
                y={showLoc ? sy - labelUnits(4) : sy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelUnits(10)}
                fontWeight={isEmph ? 800 : 600}
                fill={ink}
                className="map-label"
                strokeWidth={labelUnits(1.4)}
                style={{
                  fontFamily: "var(--font-sans), Archivo, sans-serif",
                  userSelect: "none",
                }}
              >
                {mainLabel}
              </text>
              {showLoc && (
                <text
                  x={sx}
                  y={sy + labelUnits(7)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={labelUnits(8)}
                  fontWeight={600}
                  fill={ink}
                  opacity={0.85}
                  className="map-label"
                  strokeWidth={labelUnits(1.2)}
                  style={{
                    fontFamily: "var(--font-sans), Archivo, sans-serif",
                    userSelect: "none",
                  }}
                >
                  {full.length > 26 ? full.slice(0, 25) + "…" : full}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Left Map Controls (Layer Selection & Level Bar Legend) */}
      <div
        data-map-control="true"
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-4 left-3 z-20 flex flex-col items-start gap-2"
      >
        {/* Layer Selection Button */}
        {onOpenControls && (
          <button
            onClick={onOpenControls}
            className="flex h-10 items-center gap-2 rounded-full border border-border/80 bg-card/95 px-3.5 shadow-2xl backdrop-blur-xl transition-all duration-150 active:scale-95 hover:bg-muted hover:border-border"
            aria-label="Open map layers"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              {layerShortName(layer ?? "risk")}
            </span>
            <span className="h-2 w-2 rounded-full bg-primary" />
          </button>
        )}

        {/* Level Bar (Color Ramp Legend) */}
        <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card/95 px-3.5 py-1.5 shadow-2xl backdrop-blur-xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-foreground">
            Level
          </span>
          <div className="flex h-2.5 w-20 overflow-hidden rounded-full border border-border/40 shadow-inner">
            {RISK_COLORS.map((col, i) => (
              <span
                key={col}
                className="h-full flex-1"
                style={{ background: col }}
                title={`Step ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
            <span>Low</span>
            <span>→</span>
            <span className="text-red-600 dark:text-red-400 font-extrabold">High</span>
          </div>
        </div>
      </div>

      {/* Right Map Controls (AI Assistant, Zoom In/Out & Location Buttons) */}
      <div
        data-map-control="true"
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-4 right-3 z-20 flex flex-col items-end gap-2"
      >
        {/* Floating AI Assistant Trigger Button */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("toggle-chatbot"))}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-card/95 shadow-2xl backdrop-blur-xl transition-all duration-150 active:scale-95 hover:bg-muted text-foreground"
          aria-label="Ask Ahvaan AI Assistant"
          title="Ask Ahvaan AI Assistant"
        >
          <Bot className="h-4 w-4 text-red-600 dark:text-red-400" />
        </button>

        <div className="flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur-xl">
          <button
            onClick={() => setZoom((z) => Math.min(MAX_Z, z * 1.35))}
            className="flex h-9 w-9 items-center justify-center border-b border-border/60 transition-colors hover:bg-muted text-foreground"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(MIN_Z, z / 1.35))}
            className="flex h-9 w-9 items-center justify-center transition-colors hover:bg-muted text-foreground"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
        </div>

        {gps && (
          <button
            onClick={() => {
              const [gx, gy] = project(gps.lon, gps.lat, bounds);
              setPan({ x: W / 2 - gx * 2.5, y: H / 2 - gy * 2.5 });
              setZoom(2.5);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-card/95 shadow-2xl backdrop-blur-xl transition-all duration-150 active:scale-95 hover:bg-muted"
            aria-label="Locate me"
            title="Center on my location"
          >
            <LocateFixed className="h-4 w-4 text-blue-600" />
          </button>
        )}
      </div>
    </div>
  );
}
