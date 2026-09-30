"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useDeferredValue,
} from "react";
import useSWR from "swr";
import {
  Thermometer,
  Droplet,
  Wind,
  Sun,
  Users,
  Bell,
  Menu,
  X,
  Search,
  Clock,
  Flame,
  ShieldAlert,
  HeartPulse,
  ChevronDown,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useNav } from "@/lib/navContext";
import { RISK_SCALE_FILLS, RISK_CATEGORY_STEP, type RiskCategoryKey } from "@/lib/enums/risk.enum";
import { APP_CONFIG } from "@/lib/config/appConfig";
import { getCategoryForZone } from "@/lib/advisory";
import { wardDisplayName } from "@/lib/geo/wardLocalities";
import { LeftNav } from "@/components/layout/LeftNav";
import {
  KolkataMap,
  type MapZone,
  stepForValue,
  formatLayerValue,
} from "@/components/map/KolkataMap";
import { WardInfoBar } from "@/components/console/WardInfoBar";
import { AlertComposer } from "@/components/console/AlertComposer";
import { ChatAssistant } from "@/components/console/ChatAssistant";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { ChartTooltip } from "@/components/console/ChartTooltip";
import { AXIS_TICK, xLabel, yLabel } from "@/lib/chartAxis";
import {
  ControlsPopup,
  type MapLayer,
} from "@/components/console/ControlsPopup";
import {
  ZONES_JSON_URL,
  ZONES_MANIFEST_URL,
  HEATPOINTS_JSON_URL,
  DISTRICTS_JSON_URL,
  fetchStaticJson,
  type DistrictBordersFile,
  type Heatpoint,
  type StaticZone,
  type StaticZonesFile,
  type ZonesManifest,
} from "@/lib/geo/zones";
import { useWard } from "@/lib/wardContext";

const jsonFetch = (u: string) =>
  fetch(u).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

/** Current hour in Asia/Kolkata (0–23). If minutes > 0 (e.g. 8:15), advances to 9:00. */
function currentIstHour(): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    const hStr = parts.find((p) => p.type === "hour")?.value ?? "12";
    const mStr = parts.find((p) => p.type === "minute")?.value ?? "0";
    const h = Number(hStr) % 24;
    const m = Number(mStr);
    const target = m > 0 ? (h + 1) % 24 : h;
    return Number.isFinite(target) ? target : 12;
  } catch {
    return 12;
  }
}

function fmtVal(v: number | null | undefined, digits = 1): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "-";
}

/** District code containing a lat/lon point (ray-cast over zone rings). */
function detectDistrict(
  lat: number,
  lon: number,
  zones: StaticZone[],
): string | null {
  for (const z of zones) {
    const ring = z.ring;
    if (!ring || ring.length < 3) continue;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (inside) return z.districtCode;
  }
  return null;
}

/** Layers served from the backend `analysis` table (vs raw forecast). */
const ANALYSIS_LAYERS: ReadonlySet<string> = new Set([
  "htsi",
  "wbgt",
  "hi",
  "utci",
  "wbt",
  "risk",
]);

/** Raw layer value per zone (mirrors the map paint). */
function layerNumber(
  zone: StaticZone,
  values: ReadonlyMap<string, number | null> | null,
  lyr: MapLayer,
): number | null {
  if (lyr === "vulnerability") {
    return zone.vulnerability !== null ? (zone.vulnerability > 1 ? zone.vulnerability / 100 : zone.vulnerability) : null;
  }
  const getZoneVal = (ulidKey: string) => {
    if (!values) return null;
    return values.get(ulidKey) ?? values.get(ulidKey.toLowerCase()) ?? null;
  };
  if (lyr === "risk") {
    const htsiRaw = getZoneVal(zone.ulid);
    const vulnRaw = zone.vulnerability;
    if (htsiRaw === null || vulnRaw === null) return null;
    const htsiDecimal = htsiRaw > 1 ? htsiRaw / 100 : htsiRaw;
    const vulnerabilityDecimal = vulnRaw > 1 ? vulnRaw / 100 : vulnRaw;
    return (htsiDecimal + vulnerabilityDecimal) / 2;
  }
  const v = getZoneVal(zone.ulid);
  if (lyr === "htsi" && typeof v === "number" && Number.isFinite(v)) {
    return v > 1 ? v / 100 : v;
  }
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Pill bands per layer (edges match the map's painted steps). */
const LAYER_PILL_META: Record<
  MapLayer,
  {
    bands: { cat: string; label: string; hint: string }[];
    fmt: (v: number) => string;
    suffix: string;
    avgHint: string;
  }
> = {
  temp: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Temp < 28°C" },
      { cat: "MODERATE", label: "Moderate", hint: "Temp 28–35°C" },
      { cat: "HIGH", label: "High", hint: "Temp 35–38°C" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Temp ≥ 38°C" },
    ],
    fmt: (v) => `${v.toFixed(1)}°`,
    suffix: "C",
    avgHint: "Mean temperature across zones",
  },
  humidity: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Humidity < 40%" },
      { cat: "MODERATE", label: "Moderate", hint: "Humidity 40–70%" },
      { cat: "HIGH", label: "High", hint: "Humidity 70–85%" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Humidity ≥ 85%" },
    ],
    fmt: (v) => `${v.toFixed(0)}`,
    suffix: "%",
    avgHint: "Mean relative humidity across zones",
  },
  wind: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Wind ≥ 4.0 m/s" },
      { cat: "MODERATE", label: "Moderate", hint: "Wind 1.5–4.0 m/s" },
      { cat: "HIGH", label: "High", hint: "Wind 0.8–1.5 m/s" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Wind < 0.8 m/s" },
    ],
    fmt: (v) => `${v.toFixed(1)}`,
    suffix: " m/s",
    avgHint: "Mean wind speed across zones",
  },
  solar: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Solar < 200 W/m²" },
      { cat: "MODERATE", label: "Moderate", hint: "Solar 200–600 W/m²" },
      { cat: "HIGH", label: "High", hint: "Solar 600–800 W/m²" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Solar ≥ 800 W/m²" },
    ],
    fmt: (v) => `${v.toFixed(0)}`,
    suffix: " W/m²",
    avgHint: "Mean solar radiation across zones",
  },
  risk: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Risk < 0.35" },
      { cat: "MODERATE", label: "Moderate", hint: "Risk 0.35–0.65" },
      { cat: "HIGH", label: "High", hint: "Risk 0.65–0.80" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Risk ≥ 0.80" },
    ],
    fmt: (v) => `${(v > 1 ? v / 100 : v).toFixed(2)}`,
    suffix: "",
    avgHint: "Mean risk score across zones",
  },
  htsi: {
    bands: [
      { cat: "LOW", label: "Low", hint: "HTSI < 0.30" },
      { cat: "MODERATE", label: "Moderate", hint: "HTSI 0.30–0.65" },
      { cat: "HIGH", label: "High", hint: "HTSI 0.65–0.80" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "HTSI ≥ 0.80" },
    ],
    fmt: (v) => `${(v > 1 ? v / 100 : v).toFixed(2)}`,
    suffix: "",
    avgHint: "Mean HTSI across zones",
  },
  wbgt: {
    bands: [
      { cat: "LOW", label: "Low", hint: "WBGT < 22°C" },
      { cat: "MODERATE", label: "Moderate", hint: "WBGT 22–30°C" },
      { cat: "HIGH", label: "High", hint: "WBGT 30–33°C" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "WBGT ≥ 33°C" },
    ],
    fmt: (v) => `${v.toFixed(1)}°`,
    suffix: "C",
    avgHint: "Mean WBGT across zones",
  },
  hi: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Heat index < 27°C" },
      { cat: "MODERATE", label: "Moderate", hint: "Heat index 27–39°C" },
      { cat: "HIGH", label: "High", hint: "Heat index 39–45°C" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Heat index ≥ 45°C" },
    ],
    fmt: (v) => `${v.toFixed(1)}°`,
    suffix: "C",
    avgHint: "Mean heat index across zones",
  },
  utci: {
    bands: [
      { cat: "LOW", label: "Low", hint: "UTCI < 26°C" },
      { cat: "MODERATE", label: "Moderate", hint: "UTCI 26–38°C" },
      { cat: "HIGH", label: "High", hint: "UTCI 38–44°C" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "UTCI ≥ 44°C" },
    ],
    fmt: (v) => `${v.toFixed(1)}°`,
    suffix: "C",
    avgHint: "Mean UTCI across zones",
  },
  wbt: {
    bands: [
      { cat: "LOW", label: "Low", hint: "WBT < 21°C" },
      { cat: "MODERATE", label: "Moderate", hint: "WBT 21–27°C" },
      { cat: "HIGH", label: "High", hint: "WBT 27–30°C" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "WBT ≥ 30°C" },
    ],
    fmt: (v) => `${v.toFixed(1)}°`,
    suffix: "C",
    avgHint: "Mean wet-bulb temp across zones",
  },
  vulnerability: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Vuln < 0.14" },
      { cat: "MODERATE", label: "Moderate", hint: "Vuln 0.14–0.22" },
      { cat: "HIGH", label: "High", hint: "Vuln 0.22–0.26" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Vuln ≥ 0.26" },
    ],
    fmt: (v) => `${(v > 1 ? v / 100 : v).toFixed(2)}`,
    suffix: "",
    avgHint: "Mean vulnerability across zones",
  },
};

function ZoneDetailBody({
  zone,
  detail,
  isLoading,
  layer,
  date,
  hourIdx,
  hours,
  email,
  subscribed,
  subBusy,
  subMsg,
  onSubscribe,
  onUnsubscribe,
  onLoginRequired,
  dates,
  activeDate,
  onDateChange,
  hour,
  onHourChange,
  isExpanded = false,
  onToggleExpand,
}: {
  zone: StaticZone | null;
  detail: any;
  isLoading: boolean;
  layer: MapLayer;
  date: string | null;
  hourIdx: number;
  hours: string[];
  email: string | null;
  subscribed: boolean;
  subBusy: boolean;
  subMsg: string | null;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
  onLoginRequired: () => void;
  dates: string[];
  activeDate: string | null;
  onDateChange: (d: string) => void;
  hour: number;
  onHourChange: (h: number) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const [showAdvisories, setShowAdvisories] = useState(false);
  const series = detail?.series?.[date ?? ""] ?? null;
  const hourly = useMemo(() => {
    if (!series) return [];
    return (hours.length ? hours : Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`)).map(
      (h, i) => ({
        label: h.slice(0, 2),
        temp: series.temp?.[i] ?? null,
        humidity: series.humidity?.[i] ?? null,
        wind: series.wind?.[i] ?? null,
        solar: series.solar?.[i] ?? null,
        rain: series.rain?.[i] ?? null,
      }),
    );
  }, [series, hours]);
  const analysisDateKey = useMemo(() => {
    if (!detail?.analysisSeries) return null;
    if (date && detail.analysisSeries[date]) return date;
    const avail = Object.keys(detail.analysisSeries).sort();
    return avail.length ? avail[avail.length - 1] : null;
  }, [detail, date]);

  const idxDay = analysisDateKey ? (detail?.analysisSeries?.[analysisDateKey] ?? null) : null;
  const idxHourly = useMemo(() => {
    if (!idxDay) return [];
    return (hours.length ? hours : Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`)).map(
      (h, i) => ({
        label: h.slice(0, 2),
        htsi: typeof idxDay.htsi?.[i] === "number" ? idxDay.htsi[i] / 100 : null,
        wbgt: idxDay.wbgt?.[i] ?? null,
        hi: idxDay.hi?.[i] ?? null,
      }),
    );
  }, [idxDay, hours]);

  const multiDayData = useMemo(() => {
    if (!detail?.series || !dates.length) return [];
    return dates.map((d) => {
      const s = detail.series[d];
      const temps = (s?.temp ?? []).filter((v: any): v is number => typeof v === "number");
      const maxTemp = temps.length ? Math.max(...temps) : 34;
      const minTemp = temps.length ? Math.min(...temps) : 26;
      const avgTemp = temps.length ? temps.reduce((a: number, b: number) => a + b, 0) / temps.length : 30;

      const humidities = (s?.humidity ?? []).filter((v: any): v is number => typeof v === "number");
      const avgHum = humidities.length ? humidities.reduce((a: number, b: number) => a + b, 0) / humidities.length : 70;

      return {
        date: d.slice(5),
        fullDate: d,
        MaxTemp: Number(maxTemp.toFixed(1)),
        MinTemp: Number(minTemp.toFixed(1)),
        AvgTemp: Number(avgTemp.toFixed(1)),
        AvgHumidity: Math.round(avgHum),
      };
    });
  }, [detail, dates]);

  const atIdx = (arr: Array<number | null> | undefined) =>
    typeof arr?.[hourIdx] === "number" ? (arr as number[])[hourIdx] : null;

  const htsiRaw = atIdx(idxDay?.htsi);
  const htsiVal = typeof htsiRaw === "number" ? htsiRaw : null;
  const vulnVal = typeof zone?.vulnerability === "number" ? zone.vulnerability : null;
  const hpCount = zone?.heatpoints?.length || 1;
  const totalPopulation = hpCount * 3500;

  // Formula: risk is a decimal number between 0 and 1, calculated accounting vulnerability and htsi
  const riskValue = useMemo(() => {
    if (htsiVal === null || vulnVal === null) return null;
    const htsiDecimal = htsiVal > 1 ? htsiVal / 100 : htsiVal;
    const vulnerabilityDecimal = vulnVal > 1 ? vulnVal / 100 : vulnVal;
    return (htsiDecimal + vulnerabilityDecimal) / 2;
  }, [htsiVal, vulnVal]);

  const atHour = (arr: Array<number | null> | undefined) =>
    typeof arr?.[hourIdx] === "number" ? (arr as number[])[hourIdx] : null;
  const v = {
    temp: atHour(series?.temp),
    humidity: atHour(series?.humidity),
    wind: atHour(series?.wind),
    solar: atHour(series?.solar),
  };

  const categoryInfo = useMemo(() => {
    return getCategoryForZone(riskValue, htsiVal, atIdx(idxDay?.wbgt), v.temp, layer);
  }, [riskValue, htsiVal, idxDay, v.temp, layer]);

  const htsiStyle = useMemo(() => {
    if (htsiVal === null)
      return {
        border: "border-orange-500/30",
        bg: "bg-orange-500/10",
        text: "text-orange-600 dark:text-orange-400",
        label: "HTSI",
      };
    const val = htsiVal > 1 ? htsiVal / 100 : htsiVal;
    if (val >= 0.80)
      return {
        border: "border-red-500/40",
        bg: "bg-red-500/15",
        text: "text-red-600 dark:text-red-400",
        label: "EXTREME HTSI",
      };
    if (val >= 0.65)
      return {
        border: "border-orange-500/40",
        bg: "bg-orange-500/15",
        text: "text-orange-600 dark:text-orange-400",
        label: "HIGH HTSI",
      };
    if (val >= 0.50)
      return {
        border: "border-amber-500/40",
        bg: "bg-amber-500/15",
        text: "text-amber-600 dark:text-amber-400",
        label: "MODERATE HTSI",
      };
    return {
      border: "border-emerald-500/40",
      bg: "bg-emerald-500/15",
      text: "text-emerald-600 dark:text-emerald-400",
      label: "LOW HTSI",
    };
  }, [htsiVal]);

  if (!zone || isLoading) {
    return (
      <div className="space-y-3 p-1 animate-pulse">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const metrics: Array<{
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
  }> = [
    {
      icon: <Thermometer className="h-3.5 w-3.5 text-orange-500" />,
      label: "Temperature",
      value: v.temp !== null ? `${v.temp.toFixed(1)}°C` : "-",
    },
    {
      icon: <Droplet className="h-3.5 w-3.5 text-sky-500" />,
      label: "Humidity",
      value: v.humidity !== null ? `${v.humidity.toFixed(0)}%` : "-",
    },
    {
      icon: <Wind className="h-3.5 w-3.5 text-teal-500" />,
      label: "Wind",
      value: v.wind !== null ? `${v.wind.toFixed(1)} m/s` : "-",
    },
    {
      icon: <Sun className="h-3.5 w-3.5 text-amber-500" />,
      label: "Solar",
      value: v.solar !== null ? `${v.solar.toFixed(0)} W/m²` : "-",
    },
  ];

  const idxSeries = idxDay;
  const idx = idxSeries
    ? [
        { label: "WBGT", value: atIdx(idxSeries.wbgt), unit: "°C" },
        { label: "Heat Index", value: atIdx(idxSeries.hi), unit: "°C" },
        { label: "UTCI", value: atIdx(idxSeries.utci), unit: "°C" },
        { label: "WBT", value: atIdx(idxSeries.wbt), unit: "°C" },
      ]
    : [];

  const mainColumnContent = (
    <div className="space-y-5">
      {/* Forecast time — date pills + hour slider drive the whole map. */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" /> Forecast Time
          </span>
          <span className="tabular-nums text-[11px] font-bold text-primary">
            {(hours[hour] ?? "").slice(0, 5)} IST
          </span>
        </div>
        <div className="custom-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {dates.map((d, i) => (
            <button
              key={d}
              onClick={() => onDateChange(d)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums ${d === activeDate ? "bg-red-600 text-white" : "border border-border bg-card hover:bg-muted"}`}
            >
              {i === 0 ? "Today" : d.slice(5)}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <span className="text-[10px] font-bold text-muted-foreground">00</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, hours.length - 1)}
            step={1}
            value={Math.min(hour, Math.max(0, hours.length - 1))}
            onChange={(e) => onHourChange(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary focus:outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
            aria-label="Hour of day"
          />
          <span className="text-[10px] font-bold text-muted-foreground">23</span>
        </div>
      </div>

      {/* HIGHLIGHTED HERO SECTION: RISK, HTSI, VULNERABILITY */}
      <div className="space-y-2 rounded-2xl border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-red-500" /> Key Ward Metrics
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            Pop. ~{totalPopulation.toLocaleString("en-IN")} ({hpCount} heatpoints)
          </span>
        </div>

        {/* Hero Card for RISK */}
        <div className={`relative overflow-hidden rounded-2xl border-2 ${categoryInfo.borderClass} bg-gradient-to-br ${categoryInfo.bgGradientClass} p-3.5 shadow-xs transition-all duration-200`}>
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-[11px] font-black uppercase tracking-wider ${categoryInfo.badgeTextClass} flex items-center gap-1.5`}>
                <ShieldAlert className="h-4 w-4" /> RISK SCORE
              </p>
              <p className="mt-1 text-3xl font-black tabular-nums tracking-tight text-foreground">
                {riskValue !== null ? riskValue.toFixed(2) : "—"}
              </p>
            </div>
            <span className={`rounded-full ${categoryInfo.badgeBgClass} border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${categoryInfo.badgeTextClass}`}>
              {riskValue !== null ? `${categoryInfo.level} RISK` : "NO DATA"}
            </span>
          </div>
        </div>

        {/* 2-Column Grid for HTSI and VULNERABILITY */}
        <div className="grid grid-cols-2 gap-2">
          {/* HTSI Card */}
          <div className={`rounded-xl border-2 ${htsiStyle.border} ${htsiStyle.bg} p-3 transition-all duration-200`}>
            <p className={`text-[11px] font-black uppercase tracking-wider ${htsiStyle.text} flex items-center gap-1`}>
              <Flame className="h-3.5 w-3.5" /> {htsiStyle.label}
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-foreground">
              {htsiVal !== null ? `${(htsiVal / 100).toFixed(2)}` : "—"}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
              Heat Stress Index
            </p>
          </div>

          {/* Vulnerability Card */}
          <div className="rounded-xl border-2 border-violet-500/30 bg-violet-500/10 p-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> VULNERABILITY
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-foreground">
              {vulnVal !== null ? `${(vulnVal / 100).toFixed(2)}` : "—"}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
              Vulnerability Index
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic Health Advisories & Safety Guidelines Section */}
      <div className={`rounded-2xl border ${categoryInfo.borderClass} bg-gradient-to-r ${categoryInfo.bgGradientClass} p-3.5 shadow-xs transition-all duration-200`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`flex h-7 w-7 items-center justify-center rounded-xl ${categoryInfo.badgeBgClass} ${categoryInfo.badgeTextClass} font-bold shrink-0`}>
              <HeartPulse className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs font-black uppercase tracking-wider text-foreground truncate">
                  Health Advisories
                </p>
                <span className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${categoryInfo.badgeBgClass} ${categoryInfo.badgeTextClass} border`}>
                  {categoryInfo.level} RISK
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground font-semibold truncate">
                {showAdvisories ? "Tap to hide safety actions" : `${categoryInfo.items.length} Active Guidelines for ${categoryInfo.title}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAdvisories((v) => !v)}
            className={`rounded-full ${categoryInfo.badgeBgClass} px-3 py-1 text-xs font-bold ${categoryInfo.badgeTextClass} hover:opacity-80 transition-all flex items-center gap-1 shrink-0 border`}
          >
            <span>{showAdvisories ? "Hide" : "View Advisories"}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showAdvisories ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showAdvisories && (
          <div className="mt-3 pt-3 border-t border-border/40 space-y-2 animate-in fade-in zoom-in-95 duration-200">
            {/* Category Threshold Ranges Bar */}
            <div className={`rounded-xl border ${categoryInfo.cardBorderClass} p-2 flex items-center justify-between text-[10px] font-bold flex-wrap gap-1`}>
              <span className={categoryInfo.accentTextClass}>Risk: {categoryInfo.riskRangeLabel}</span>
              <span className="text-muted-foreground">HTSI: {categoryInfo.htsiRangeLabel}</span>
              <span className="text-muted-foreground">WBGT: {categoryInfo.wbgtRangeLabel}</span>
            </div>

            {/* Dynamic Category Action Items */}
            {categoryInfo.items.map((item) => (
              <div key={item.title} className={`rounded-xl border ${categoryInfo.cardBorderClass} p-2.5 transition-all`}>
                <p className={`text-[11px] font-extrabold ${categoryInfo.accentTextClass} flex items-center gap-1.5`}>
                  <span>{item.icon}</span> {item.title}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed font-medium">
                  {item.action}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-amber-500/5 to-transparent p-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold text-foreground flex items-center gap-1.5 shrink-0">
            <Bell className="h-4 w-4 text-red-500" /> Ward Email Alerts
          </p>
          {subscribed ? (
            <button
              onClick={onUnsubscribe}
              disabled={subBusy}
              className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60 shrink-0"
            >
              {subBusy ? "Working…" : "✓ Subscribed — Tap to remove"}
            </button>
          ) : (
            <button
              onClick={onSubscribe}
              disabled={subBusy}
              className="rounded-full bg-red-600 px-3.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-red-700 disabled:opacity-60 shrink-0"
            >
              Subscribe to Ward Alerts
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Subscribe to receive automated email alerts for this ward whenever heat stress or risk scores surge.
        </p>
        {subMsg && (
          <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
            {subMsg}
          </p>
        )}
      </div>

      <div>
        <SectionLabel>
          Mean Heat Indices across Ward Heat points{" "}
          {analysisDateKey ? `(${analysisDateKey})` : ""}
        </SectionLabel>
        {idx.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {idx.map((m) => (
              <div key={m.label} className="rounded-xl border bg-card p-2.5">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {m.label}
                </p>
                <p className="mt-0.5 text-base font-black tabular-nums">
                  {m.value !== null ? `${m.value.toFixed(1)}${m.unit}` : "-"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            No analysis data for this zone yet — indices appear here once data is updated.
          </div>
        )}
      </div>

      <div>
        <SectionLabel>
          <span className="flex items-center gap-1.5">
            <Thermometer className="h-3.5 w-3.5 text-sky-500" /> Microclimate
          </span>
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl border bg-card p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                {m.icon} {m.label}
              </p>
              <p className="mt-0.5 text-base font-black tabular-nums">{m.value}</p>
              {m.sub && (
                <p className="text-[10px] text-muted-foreground">{m.sub}</p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {detail?.heatpoints?.length ?? zone.heatpoints.length} heatpoint
          {(detail?.heatpoints?.length ?? zone.heatpoints.length) === 1
            ? ""
            : "s"}{" "}
          in this zone · values are tile means
        </p>
      </div>
    </div>
  );

  if (!isExpanded) {
    return mainColumnContent;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Column: Metrics & Controls */}
        <div className="space-y-4">{mainColumnContent}</div>

        {/* Right Column: Full Graph Analytics Dashboard */}
        <div className="space-y-5 border-t lg:border-t-0 lg:border-l lg:pl-5 pt-4 lg:pt-0">
          {/* Graph 1: Diurnal Thermal Indices Evolution */}
          {idxHourly.length > 0 && (
            <div>
              <SectionLabel>24-Hour Diurnal Thermal Indices Evolution</SectionLabel>
              <Card className="min-w-0 overflow-hidden shadow-xs">
                <CardContent className="h-[220px] w-full p-2 pr-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={idxHourly} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="htsiGlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="label" tick={AXIS_TICK} interval={2} />
                      <YAxis yAxisId="left" tick={AXIS_TICK} domain={[0, 1]} tickCount={5} width={30} />
                      <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} domain={[20, 45]} width={30} />
                      <Tooltip animationDuration={0} content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area yAxisId="left" type="monotone" dataKey="htsi" name="HTSI" stroke="#ef4444" strokeWidth={2.5} fill="url(#htsiGlow)" />
                      <Line yAxisId="right" type="monotone" dataKey="wbgt" name="WBGT (°C)" stroke="#f97316" strokeWidth={2} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="hi" name="Heat Index (°C)" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Graph 2: Microclimate Weather Drivers */}
          {hourly.length > 0 && (
            <div>
              <SectionLabel>Microclimate Weather Drivers (Temp & Humidity)</SectionLabel>
              <Card className="min-w-0 overflow-hidden shadow-xs">
                <CardContent className="h-[220px] w-full p-2 pr-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hourly} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="label" tick={AXIS_TICK} interval={2} />
                      <YAxis yAxisId="left" tick={AXIS_TICK} domain={["auto", "auto"]} width={32} />
                      <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} domain={[0, 100]} width={30} />
                      <Tooltip animationDuration={0} content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line yAxisId="left" type="monotone" dataKey="temp" name="Temp (°C)" stroke="#f97316" strokeWidth={2.5} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                      <Line yAxisId="left" type="monotone" dataKey="wind" name="Wind (m/s)" stroke="#10b981" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Graph 3: Diurnal Solar Flux & Microclimate Thermal Absorption */}
          {hourly.length > 0 && (
            <div>
              <SectionLabel>Diurnal Solar Flux & Urban Heat Absorption</SectionLabel>
              <Card className="min-w-0 overflow-hidden shadow-xs">
                <CardContent className="h-[220px] w-full p-2 pr-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourly} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="solarGlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="label" tick={AXIS_TICK} interval={2} />
                      <YAxis yAxisId="left" tick={AXIS_TICK} domain={[0, "auto"]} width={34} />
                      <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} domain={["auto", "auto"]} width={30} />
                      <Tooltip animationDuration={0} content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area yAxisId="left" type="monotone" dataKey="solar" name="Solar Radiation (W/m²)" stroke="#f59e0b" strokeWidth={2} fill="url(#solarGlow)" />
                      <Line yAxisId="right" type="monotone" dataKey="temp" name="Temp (°C)" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
  );
}

export default function MapsPage() {
  const { selectedId, setSelectedId } = useWard();
  const { navOpen, setNavOpen } = useNav();
  // Hover only highlights + tooltip on the map — it never opens or swaps the
  // info bar (click pins the selection).
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const debouncedSearch = useDebounced(search, 180);
  const deferredSearch = useDeferredValue(debouncedSearch);

  const [layer, setLayer] = useState<MapLayer>("temp");
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [hour, setHour] = useState<number>(() => currentIstHour());
  // Focused district (selector). Null = all districts, nothing dimmed.
  const [district, setDistrict] = useState<string | null>(null);
  // Panels: assistant (AI), manual alert composer.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [infoBarExpanded, setInfoBarExpanded] = useState(false);
  useEffect(() => {
    const toggle = () => setAssistantOpen((v) => !v);
    window.addEventListener("toggle-chatbot", toggle);
    return () => window.removeEventListener("toggle-chatbot", toggle);
  }, []);

  const swrOpts = useMemo(
    () => ({
      keepPreviousData: true,
      dedupingInterval: 60000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshInterval: 0,
    }),
    [],
  );

  // Static runtime datasets (generated by `npm run sync:zones`, served as
  // plain files — no database query per map load).
  const { data: zonesFile } = useSWR<StaticZonesFile>(ZONES_JSON_URL, (u) => fetchStaticJson<StaticZonesFile>(u), swrOpts);
  const { data: manifest } = useSWR<ZonesManifest>(ZONES_MANIFEST_URL, (u) => fetchStaticJson<ZonesManifest>(u), swrOpts);
  const { data: bordersFile } = useSWR<DistrictBordersFile>(DISTRICTS_JSON_URL, (u) => fetchStaticJson<DistrictBordersFile>(u), swrOpts);
  // Backend heatpoint tiles (real coordinates) for the location-glow overlay.
  const { data: heatpointsFile } = useSWR<Heatpoint[]>(HEATPOINTS_JSON_URL, (u) => fetchStaticJson<Heatpoint[]>(u), swrOpts);
  const glowTiles = useMemo(() => {
    const list = Array.isArray(heatpointsFile) ? heatpointsFile : [];
    return list
      .filter(
        (h) =>
          Number.isFinite(h.id) &&
          Number.isFinite(h.latitude) &&
          Number.isFinite(h.longitude) &&
          typeof h.uniqueLocationId === "string",
      )
      .map((h) => ({ id: h.id, lat: h.latitude, lon: h.longitude, zoneId: h.uniqueLocationId }));
  }, [heatpointsFile]);
  // Live forecast dates (backend adds dates on its own schedule).
  const { data: datesResp } = useSWR("/api/dates", jsonFetch, swrOpts);

  const zones: StaticZone[] = useMemo(
    () => (zonesFile as any)?.zones ?? [],
    [zonesFile],
  );
  const dates: string[] = useMemo(
    () => (datesResp as any)?.dates ?? (manifest as any)?.dates ?? [],
    [datesResp, manifest],
  );
  const analysisDates: string[] = useMemo(
    () => (datesResp as any)?.analysisDates ?? [],
    [datesResp],
  );
  // Effective date: explicit pick when it carries data for the layer,
  // else the latest date that does (analysis lags forecast — e.g. Oct 5
  // has forecast but no analysis rows, so index layers fall back).
  const activeDate = useMemo(() => {
    const pool = ANALYSIS_LAYERS.has(layer) ? analysisDates : dates;
    if (date !== null && pool.includes(date)) return date;
    return pool[pool.length - 1] ?? dates[dates.length - 1] ?? null;
  }, [date, dates, analysisDates, layer]);

  // Zone alert subscriptions.
  const { data: subsResp, mutate: mutateSubs } = useSWR(
    "/api/subscriptions",
    jsonFetch,
    { ...swrOpts, dedupingInterval: 30000 },
  );
  const email: string | null = null;
  const subscriptions: Array<{ ulid: string; label: string; district: string | null }> =
    (subsResp as any)?.subscriptions ?? [];

  // GPS fix → blue dot + default district (once, unless already chosen).
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null);
  const districtAutoDone = useRef(false);
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setGps({ lat: latitude, lon: longitude });
      },
      () => {},
      { timeout: 9000, maximumAge: 600000 },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!gps || districtAutoDone.current || district !== null || zones.length === 0) return;
    districtAutoDone.current = true;
    const found = detectDistrict(gps.lat, gps.lon, zones);
    if (found) setDistrict(found);
  }, [gps, zones, district]);

  // Choropleth field for the active date+layer (weather layers only;
  // vulnerability reads off the static zones). Cached per (date, layer).
  const { data: field } = useSWR(
    activeDate && layer !== "vulnerability"
      ? `/api/field?date=${activeDate}&layer=${layer === "risk" ? "htsi" : layer}`
      : null,
    jsonFetch,
    swrOpts,
  );
  const hours: string[] = useMemo(() => {
    const h = (field as any)?.hours;
    return Array.isArray(h) && h.length ? h : Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
  }, [field]);
  const hourIdx = useMemo(() => {
    const ix = hours.findIndex((h) => Number(h.slice(0, 2)) === hour);
    return ix >= 0 ? ix : hours.length - 1;
  }, [hours, hour]);

  const valuesByZone = useMemo(() => {
    const map = new Map<string, number | null>();
    const values = (field as any)?.values as
      | Record<string, Array<number | null>>
      | undefined;
    if (!values) return map;
    for (const [ulidKey, arr] of Object.entries(values)) {
      const v = arr?.[hourIdx];
      const val = typeof v === "number" && Number.isFinite(v) ? v : null;
      map.set(ulidKey, val);
      map.set(ulidKey.toLowerCase(), val);
    }
    return map;
  }, [field, hourIdx]);

  // Per-heatpoint active-hour values from /api/tiles for heatpoint gradient overlay
  const { data: tilesData } = useSWR(
    activeDate && layer
      ? `/api/tiles?date=${activeDate}&layer=${layer === "risk" ? "htsi" : layer}`
      : null,
    jsonFetch,
    swrOpts,
  );
  const tileValues = useMemo(() => {
    const map = new Map<number, number | null>();
    const values = (tilesData as any)?.values as
      | Record<string, Array<number | null>>
      | undefined;
    if (!values) return map;
    for (const [hpIdStr, arr] of Object.entries(values)) {
      const hpId = Number(hpIdStr);
      const v = arr?.[hourIdx];
      map.set(hpId, typeof v === "number" && Number.isFinite(v) ? v : null);
    }
    return map;
  }, [tilesData, hourIdx]);

  const cells: MapZone[] = useMemo(
    () =>
      zones.map((z) => ({
        zoneId: z.ulid,
        name: z.name,
        district: z.district,
        districtCode: z.districtCode,
        kind: z.kind,
        ward: z.ward,
        vulnerability: z.vulnerability,
        lat: z.lat,
        long: z.long,
        ring: z.ring,
      })),
    [zones],
  );
  const districtBorders = useMemo(
    () => (bordersFile as any)?.districts ?? [],
    [bordersFile],
  );
  const districts = useMemo(
    () => (manifest as any)?.districts ?? [],
    [manifest],
  );

  const selectedZone = useMemo(
    () => zones.find((z) => z.ulid === selectedId) ?? null,
    [zones, selectedId],
  );

  const { data: detail, isLoading: isDetailLoading } = useSWR(
    selectedId ? `/api/zone/${selectedId}` : null,
    jsonFetch,
    { ...swrOpts, dedupingInterval: 30000 },
  );

  // Floating search suggestions (locality + name + district + ward + ulid,
  // so every ward of every district is indexed).
  const searchSuggestions = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    const ql = q.toLowerCase();
    return zones
      .filter((z) => {
        const locality = wardDisplayName(z.ward, z.name).toLowerCase();
        return (
          locality.includes(ql) ||
          z.name.toLowerCase().includes(ql) ||
          z.district.toLowerCase().includes(ql) ||
          z.ulid.toLowerCase().includes(ql) ||
          (z.ward !== null &&
            (String(z.ward).includes(ql) || `ward ${z.ward}`.includes(ql)))
        );
      })
      .slice(0, APP_CONFIG.search.maxSuggestions);
  }, [zones, search]);

  // Layer-aware pill: painted-step distribution + mean for the active hour.
  // Scoped to the selected district when one is focused.
  const pill = useMemo(() => {
    const meta = LAYER_PILL_META[layer];
    const counts: Record<string, number> = {
      LOW: 0,
      MODERATE: 0,
      HIGH: 0,
      VERY_HIGH: 0,
    };
    let sum = 0;
    let n = 0;
    for (const z of zones) {
      if (district !== null && z.districtCode !== district) continue;
      const v = layerNumber(z, valuesByZone, layer);
      const step =
        stepForValue(v, layer) ??
        stepForValue(z.vulnerability, "vulnerability") ??
        1;
      if (v !== null) {
        sum += v;
        n += 1;
      }
      const band =
        step <= 1 ? "LOW" : step <= 3 ? "MODERATE" : step === 4 ? "HIGH" : "VERY_HIGH";
      counts[band] += 1;
    }
    return {
      bands: meta.bands.map((b) => ({ ...b, v: counts[b.cat] ?? 0 })),
      avg: n > 0 ? meta.fmt(sum / n) : "—",
      avgSuffix: meta.suffix,
      avgHint: meta.avgHint,
    };
  }, [layer, zones, valuesByZone, district]);

  const downloadZone = useCallback(() => {
    const z = selectedZone;
    if (!z) return;
    const blob = new Blob(
      [JSON.stringify({ zone: z, date: activeDate, detail: detail ?? null }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zone-${z.ulid}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [selectedZone, activeDate, detail]);

  const totalHeatpoints = useMemo(
    () => (manifest as any)?.counts?.heatpoints ?? zones.reduce((s, z) => s + z.heatpoints.length, 0),
    [manifest, zones],
  );

  // Ward alert subscription for the selected zone (login-gated). Subscribing
  // immediately dispatches an automated alert for the zone.
  const [subBusy, setSubBusy] = useState(false);
  const [subMsg, setSubMsg] = useState<string | null>(null);
  useEffect(() => {
    setSubMsg(null);
    setSubBusy(false);
  }, [selectedId]);
  const isSubscribed = useMemo(
    () => (selectedId ? subscriptions.some((s) => s.ulid === selectedId) : false),
    [subscriptions, selectedId],
  );
  const subscribeZone = useCallback(() => {
    setAlertOpen(true);
  }, []);
  const unsubscribeZone = useCallback(async () => {
    if (!selectedId) return;
    setSubBusy(true);
    try {
      await fetch("/api/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ulid: selectedId }),
      });
      mutateSubs();
      setSubMsg("Removed from ward alerts.");
    } finally {
      setSubBusy(false);
    }
  }, [selectedId, mutateSubs]);

  // Manual alert composer prefill from the selected zone's latest values.
  const alertPrefill = useMemo(() => {
    if (!selectedZone) return "";
    const s = (detail as any)?.series?.[activeDate ?? ""];
    const a = (detail as any)?.analysisSeries?.[activeDate ?? ""];
    const at = (arr: any) =>
      typeof arr?.[hourIdx] === "number" ? (arr[hourIdx] as number) : null;
    const parts = [
      `Ahvaan update — ${wardDisplayName(selectedZone.ward, selectedZone.name)}, ${selectedZone.district} (${activeDate} ${(hours[hourIdx] ?? "").slice(0, 5)} IST):`,
    ];
    const t = at(s?.temp);
    if (t !== null) parts.push(`Temp ${t.toFixed(1)}°C`);
    const h = at(a?.htsi);
    if (h !== null) parts.push(`HTSI ${h.toFixed(0)}`);
    const w = at(a?.wbgt);
    if (w !== null) parts.push(`WBGT ${w.toFixed(1)}°C`);
    return parts.join(" ");
  }, [selectedZone, detail, activeDate, hours, hourIdx]);

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-background">
      {/* Fullscreen map: fills the viewport; search, nav and zone details
          float over it Google-Maps-style. */}
      <div className="absolute inset-0">
        <LeftNav overlay />
        <div
          className="absolute inset-0 bg-muted/20"
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="relative h-full w-full">
            {cells.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Skeleton className="h-10 w-10 rounded-full" />
              </div>
            ) : (
              <KolkataMap
                cells={cells}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={(id) => setSelectedId(id)}
                onHover={setHoveredId}
                searchQuery={deferredSearch}
                layer={layer}
                onOpenControls={() => setControlsOpen(true)}
                gradientEnabled={gradientEnabled}
                valuesByZone={valuesByZone}
                heatpoints={glowTiles}
                tileValues={tileValues}
                focusDistrict={district}
                districtBorders={districtBorders}
                gps={gps}
              />
            )}
            {/* Floating search with embedded menu button. */}
            <div className="absolute left-3 top-3 z-30 w-[280px] max-w-[calc(100%-24px)] sm:w-[360px]">
              <div className="flex h-11 items-center gap-1 rounded-full border bg-card pl-1.5 pr-1.5 shadow-lg">
                <button
                  onClick={() => setNavOpen((v) => !v)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
                  aria-label="Toggle menu"
                >
                  {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                  placeholder="Search zones, wards, districts…"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  aria-label="Search zones"
                />
                {search ? (
                  <button
                    onClick={() => setSearch("")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
              </div>
              {searchFocused && searchSuggestions.length > 0 && (
                <div className="custom-scrollbar mt-2 max-h-[320px] overflow-y-auto rounded-2xl border bg-card p-1.5 shadow-2xl">
                  {searchSuggestions.map((w) => (
                    <button
                      key={w.ulid}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedId(w.ulid);
                        setSearchFocused(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                        {w.kind === "WARD" && w.ward !== null ? w.ward : "·"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold leading-tight">
                          {wardDisplayName(w.ward, w.name)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {w.district}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* District selector — focus one district, dim the rest. */}
            {districts.length > 0 && (
              <div className="absolute left-3 top-[68px] z-10 flex max-w-[calc(100%-24px)] gap-1.5 overflow-x-auto pb-1">
                <button
                  onClick={() => setDistrict(null)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold shadow-lg backdrop-blur transition-colors ${district === null ? "bg-foreground text-background" : "bg-card/90 hover:bg-muted"}`}
                >
                  All
                </button>
                {districts.map((d: any) => (
                  <button
                    key={d.code}
                    onClick={() => setDistrict(district === d.code ? null : d.code)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold shadow-lg backdrop-blur transition-colors ${district === d.code ? "bg-foreground text-background" : "bg-card/90 hover:bg-muted"}`}
                    title={`${d.zones.toLocaleString("en-IN")} zones`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
            {/* Top-right action: Send Alert button */}
            <div className="absolute right-3 top-3 z-20 flex gap-2">
              <button
                onClick={() => setAlertOpen(true)}
                className="flex h-10 items-center gap-2 rounded-full bg-red-600 px-4 text-xs font-extrabold text-white shadow-xl transition-transform active:scale-95 hover:bg-red-700 sm:text-sm"
                aria-label="Send alert"
              >
                <Bell className="h-4 w-4" />
                <span className="hidden sm:inline">Send Alert</span>
                <span className="sm:hidden">Alert</span>
              </button>
            </div>
            {/* Layer-aware summary pill */}
            {zones.length > 0 && (
              <div className="pointer-events-auto absolute left-1/2 top-3 z-20 hidden -translate-x-1/2 cursor-default md:flex">
                <div className="flex items-center gap-1.5 rounded-full border bg-card p-1.5 shadow-xl backdrop-blur">
                  {pill.bands.map((k) => {
                    const stepIdx = RISK_CATEGORY_STEP[k.cat as RiskCategoryKey] ?? 1;
                    const fillColor = RISK_SCALE_FILLS[stepIdx - 1] ?? RISK_SCALE_FILLS[0];
                    return (
                      <span
                        key={k.label}
                        title={k.hint}
                        className="flex cursor-help items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: fillColor }}
                        />
                        {k.label}{" "}
                        <span className="font-black tabular-nums">{k.v}</span>
                      </span>
                    );
                  })}
                  <span
                    title={pill.avgHint}
                    className="flex cursor-help items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
                  >
                    Avg{" "}
                    <span className="font-black tabular-nums">{pill.avg}</span>
                    <span className="font-normal text-muted-foreground">
                      {pill.avgSuffix}
                    </span>
                  </span>
                </div>
              </div>
            )}
            {/* Zone count chip */}
            {zones.length > 0 && (
              <div
                className="pointer-events-none absolute left-1/2 top-[68px] z-20 hidden -translate-x-1/2 md:block"
                aria-hidden
              >
                <div className="rounded-full bg-card/80 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground backdrop-blur">
                  {zones.length.toLocaleString("en-IN")} zones ·{" "}
                  {totalHeatpoints.toLocaleString("en-IN")} heatpoints
                  {activeDate ? ` · ${activeDate}` : ""}
                </div>
              </div>
            )}
          </div>
        </div>
        <WardInfoBar
          zone={selectedZone}
          onClose={() => setSelectedId(null)}
          onDownload={downloadZone}
          isExpanded={infoBarExpanded}
          onToggleExpand={() => setInfoBarExpanded((v) => !v)}
        >
          <ZoneDetailBody
            zone={selectedZone}
            detail={detail}
            isLoading={isDetailLoading || !selectedZone}
            layer={layer}
            date={activeDate}
            hourIdx={hourIdx}
            hours={hours}
            email={email}
            subscribed={isSubscribed}
            subBusy={subBusy}
            subMsg={subMsg}
            onSubscribe={subscribeZone}
            onUnsubscribe={unsubscribeZone}
            onLoginRequired={() => setAlertOpen(true)}
            dates={dates}
            activeDate={activeDate}
            onDateChange={setDate}
            hour={hour}
            onHourChange={setHour}
            isExpanded={infoBarExpanded}
            onToggleExpand={() => setInfoBarExpanded((v) => !v)}
          />
        </WardInfoBar>
      </div>
      <ControlsPopup
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        layer={layer}
        onLayerChange={setLayer}
        gradientEnabled={gradientEnabled}
        onGradientToggle={setGradientEnabled}
      />
      <AlertComposer
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        zones={zones}
        districts={districts}
        selectedZone={selectedZone}
        onSubscribedSuccess={() => {
          mutateSubs();
        }}
      />
      <ChatAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        ulid={selectedId}
      />
    </div>
  );
}
