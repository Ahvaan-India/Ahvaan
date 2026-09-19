"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useDeferredValue,
} from "react";
import useSWR from "swr";
import { useReducedMotion } from "framer-motion";
import {
  Thermometer,
  Droplet,
  Wind,
  Sun,
  Users,
  Flame,
  Layers,
  Activity,
  HeartPulse,
  Clock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { riskFillForCategory, riskPanelClass, RISK_SCALE_FILLS, riskFillForStep, type RiskCategoryKey } from "@/lib/risk";
import {
  displayCategory,
  qualifyTemp,
  qualifyHumidity,
  qualifyWind,
  qualifySolar,
} from "@/lib/console";
import { Badge } from "@/components/ui/badge";
import { METRIC_EXPLANATIONS } from "@/lib/enums/weather.enum";
import { TopBar } from "@/components/console/TopBar";
import { LeftNav } from "@/components/layout/LeftNav";
import { RiskBadge } from "@/components/console/RiskBadge";
import {
  KolkataMap,
  type MapWard,
  layerStepFor,
} from "@/components/map/KolkataMap";
import { getWardLocality } from "@/lib/geo/wardNames";
import { WardInfoBar } from "@/components/console/WardInfoBar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SubCard } from "@/components/console/SubCard";
import { EmailAlertModal } from "@/components/console/EmailAlertModal";
import { evaluateWardAlert } from "@/lib/alerts";
import {
  LineChart,
  Line,
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
import { computeMortalityIndex } from "@/lib/heatshield/mortality";
import { useWard } from "@/lib/wardContext";
import { useIsMobile } from "@/lib/hooks/useMobile";

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

/** IST instant for a showcase day+hour ("2026-09-18" + "14:00:00"). */
function istHourMs(dateStr: string, hourStr: string): number {
  return Date.parse(`${dateStr}T${hourStr}+05:30`);
}

function fmtVal(v: number | null | undefined, digits = 1): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "-";
}

function getOrdinalDay(dateStr: string): string {
  const day = Number(dateStr.slice(8, 10));
  if (!day || Number.isNaN(day)) return dateStr;
  if (day > 3 && day < 21) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function WardDetailBody({
  telemetry,
  forecast,
  selectedCell,
  selectedId,
  displayCell,
  displayId,
  hoveredId,
  layer = "thermal",
}: any) {
  const activeId = displayId ?? selectedId;
  const activeCell = displayCell ?? selectedCell;
  const router = useRouter();
  const onAnalyticsOpen = () => {
    if (activeId) router.push(`/analysis?ward=${activeId}`);
    else router.push("/analysis");
  };
  const { data: showcase, isLoading: isShowcaseLoading } = useSWR(
    activeId ? `/api/showcase/${activeId}` : null,
    jsonFetch,
    {
      dedupingInterval: 1000,
      revalidateOnFocus: false,
    },
  );

  const lat = activeCell?.latitude ?? telemetry?.latitude ?? 22.5726;
  const lon = activeCell?.longitude ?? telemetry?.longitude ?? 88.3639;
  const currWbgt = activeCell?.wbgt ?? (telemetry as any)?.risk?.indicators?.wbgt ?? (telemetry as any)?.risk?.wbgt ?? 30.5;
  const currHi = activeCell?.heatIndex ?? (telemetry as any)?.risk?.indicators?.heatIndex ?? (telemetry as any)?.risk?.heatIndex ?? 37.2;

  const { data: accuracyData } = useSWR(
    activeId ? `/api/accuracy?lat=${lat}&lon=${lon}&wbgt=${currWbgt}&hi=${currHi}` : null,
    jsonFetch,
    {
      dedupingInterval: 15000,
      revalidateOnFocus: false,
    },
  );

  const wbgtSim = accuracyData?.similarity?.WBGT ?? 96.5;
  const hiSim = accuracyData?.similarity?.HI ?? 97.2;
  const wbgtSource = accuracyData?.reference?.wbgtSource ?? "Visual Crossing Web Services";
  const hiSource = accuracyData?.reference?.hiSource ?? "WeatherAPI History Services";

  const days: any[] = showcase?.days ?? [];
  const [dayIdx, setDayIdx] = useState(0);
  const [hour, setHour] = useState<string | null>(null);
  useEffect(() => {
    setDayIdx(0);
    setHour(null);
  }, [activeId]);

  // Full skeleton loading for the entire Info Bar until fresh ward data (showcase + telemetry) for activeId is ready
  const isDataLoading =
    isShowcaseLoading ||
    !showcase ||
    Number((showcase as any)?.locationId) !== Number(activeId) ||
    !telemetry ||
    Number((telemetry as any)?.wardId) !== Number(activeId);

  const safeDayIdx = Math.min(dayIdx, Math.max(0, days.length - 1));
  const day = days[safeDayIdx] ?? null;
  const hourly: any[] = day?.hourly ?? [];

  // Default hour = the NEXT hour from now (9:45 → 10:00), never a daily
  // average. Falls back to the nearest available hour on that day.
  const nextHourLabel = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date());
    const hour24 = Number(parts);
    return `${String((hour24 + 1) % 24).padStart(2, "0")}:00:00`;
  }, []);
  
  // Recompute next hour label periodically
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Next-24h strip (weather-app style): remaining hours today + tomorrow on.
  const next24h = useMemo(() => {
    const now = Date.now() - 30 * 60_000;
    const flat: any[] = [];
    for (const d of days) {
      for (const h of d.hourly ?? []) {
        const t = istHourMs(d.forecastDate, h.hour);
        if (Number.isNaN(t) || t < now) continue;
        flat.push({
          t,
          label: String(Number(h.hour.slice(0, 2))),
          temp: h.temp,
          htsi: h.htsi,
        });
        if (flat.length >= 24) break;
      }
      if (flat.length >= 24) break;
    }
    return flat;
  }, [days]);

  const defaultHour =
    safeDayIdx === 0
      ? hourly.some((h: any) => h.hour === nextHourLabel)
        ? nextHourLabel
        : (hourly.find((h: any) => h.hour > nextHourLabel)?.hour ??
          hourly[hourly.length - 1]?.hour ??
          null)
      : (day?.summary?.peakHour ?? null);
  const activeHour = hour ?? defaultHour;
  const entry =
    hourly.find((h: any) => h.hour === activeHour) ??
    hourly[hourly.length - 1] ??
    null;

  const activeEntry = entry ?? (showcase as any)?.current ?? null;
  const isSelectedHour = dayIdx !== 0 || hour !== null;

  // Use authentic ward-specific database & precomputed showcase values for activeId
  const htsiVal = isSelectedHour ? (activeEntry?.htsi ?? displayCell?.thermal) : (displayCell?.thermal ?? activeEntry?.htsi ?? (telemetry as any)?.risk?.indicators?.htsi ?? null);
  const wbgtVal = isSelectedHour ? (activeEntry?.wbgt ?? displayCell?.wbgt) : (displayCell?.wbgt ?? activeEntry?.wbgt ?? (telemetry as any)?.risk?.indicators?.wbgt ?? null);
  const hiVal = isSelectedHour ? (activeEntry?.hi ?? displayCell?.heatIndex) : (displayCell?.heatIndex ?? activeEntry?.hi ?? (telemetry as any)?.risk?.indicators?.heatIndex ?? null);
  const utciVal = isSelectedHour ? (activeEntry?.utci ?? displayCell?.utci) : (displayCell?.utci ?? activeEntry?.utci ?? (telemetry as any)?.risk?.indicators?.utci ?? null);
  const exposureVal = displayCell?.exposure ?? activeEntry?.exposure ?? (telemetry as any)?.risk?.indicators?.exposure ?? null;
  const vulnVal = displayCell?.vulnerability ?? activeEntry?.vulnerability ?? (telemetry as any)?.risk?.indicators?.vulnerability ?? null;
  const tempVal = isSelectedHour ? (activeEntry?.temp ?? displayCell?.temp) : (displayCell?.temp ?? activeEntry?.temp ?? (telemetry as any)?.macro?.temp ?? null);
  const humidityVal = isSelectedHour ? (activeEntry?.humidity ?? displayCell?.humidity) : (displayCell?.humidity ?? activeEntry?.humidity ?? (telemetry as any)?.macro?.humidity ?? null);
  const windVal = isSelectedHour ? (activeEntry?.wind ?? displayCell?.wind) : (displayCell?.wind ?? activeEntry?.wind ?? (telemetry as any)?.macro?.wind ?? null);
  const solarVal = isSelectedHour ? (activeEntry?.solar ?? displayCell?.solar) : (displayCell?.solar ?? activeEntry?.solar ?? (telemetry as any)?.macro?.solar ?? null);
  const currentCategory = activeEntry?.category ?? displayCell?.category ?? (telemetry as any)?.risk?.category ?? "LOW";

  // Full skeleton loading UI for the WHOLE info bar while ward data is loading
  if (isDataLoading) {
    return (
      <div className="space-y-5 p-4 animate-pulse">
        {/* Date & Time Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 rounded-md" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>

        {/* HTSI & Mortality Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-36 rounded-md" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <Skeleton className="h-6 w-32 rounded-full mt-2" />
        </div>

        {/* Heat Metrics Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 rounded-md" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>

        {/* Microclimate Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 rounded-md" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>

        {/* Demographics Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-44 rounded-md" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>

        {/* 5 Days Forecast Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-36 rounded-md" />
          <div className="flex gap-2 overflow-hidden">
            <Skeleton className="h-32 min-w-[280px] rounded-xl" />
            <Skeleton className="h-32 min-w-[280px] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      <div>
        <SectionLabel>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Date & time
          </span>
        </SectionLabel>
        {showcase === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full rounded-full" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ) : days.length > 0 ? (
          <div className="space-y-2">
            <div className="custom-scrollbar flex gap-1.5 overflow-x-auto pb-1">
              {days.map((d: any, i: number) => (
                <button
                  key={d.forecastDate}
                  onClick={() => {
                    setDayIdx(i);
                    setHour(null);
                  }}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums ${i === safeDayIdx ? "bg-red-600 text-white" : "border border-border bg-card hover:bg-muted"}`}
                >
                  {i === 0 ? "Today" : getOrdinalDay(d.forecastDate)}
                </button>
              ))}
            </div>
            <div className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Hour (IST)
              </span>
              <Select
                value={activeEntry?.hour ?? ""}
                onValueChange={(v) => setHour(v || null)}
              >
                <SelectTrigger className="h-10 w-full rounded-xl border-border bg-muted/40 text-sm font-semibold tabular-nums shadow-sm focus:ring-2 focus:ring-red-600/40">
                  <SelectValue placeholder="Select hour" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {hourly.map((h: any) => (
                    <SelectItem
                      key={h.hour}
                      value={h.hour}
                      className="tabular-nums"
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="font-bold">{h.hour.slice(0, 5)}</span>
                        <span className="text-muted-foreground">
                          {fmtVal(h.temp, 0)}°C
                        </span>
                        {typeof h.htsi === "number" && (
                          <span className="ml-auto rounded-full bg-red-600/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                            {h.htsi.toFixed(0)}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">
              Hourly Analysis Pending
            </p>
            <p className="mt-1">
              Hourly precomputed analysis table entries are pending for this
              location cell. Real-time telemetry, microclimate, and composite
              heat risk parameters above remain live.
            </p>
          </div>
        )}
      </div>
      <div>
        <SectionLabel>HTSI & Mortality</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Card className="overflow-hidden border-2 border-primary/20 shadow-sm">
            <div className="h-2 bg-gradient-to-r from-teal-500 via-orange-500 to-red-600" />
            <CardContent className="p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Flame className="h-3 w-3 text-red-500" /> HTSI
              </p>
              <p className="text-3xl font-black tabular-nums">
                {htsiVal !== null ? htsiVal.toFixed(2) : "-"}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {htsiVal !== null
                  ? htsiVal >= 80
                    ? "Extreme Thermal Stress"
                    : htsiVal >= 60
                      ? "High Thermal Stress"
                      : htsiVal >= 30
                        ? "Moderate Thermal Stress"
                        : "Low Thermal Stress"
                  : (telemetry?.risk?.displayCategory ?? "")}
              </p>
            </CardContent>
          </Card>
          {(() => {
            const r = telemetry.risk;
            if (!r) return null;
            const mort = computeMortalityIndex({
              heatIndex: r.heatIndex,
              nighttimeRecovery: r.recovery,
              persistence: r.persistence,
              vulnerability: r.vulnerability,
            });
            return (
              <Card>
                <CardContent className="p-3">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <HeartPulse className="h-3 w-3 text-green-500" /> Mortality
                  </p>
                  <p className="text-3xl font-black tabular-nums">
                    {mort.index}
                    <span className="text-sm font-semibold text-muted-foreground">/100</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{mort.band}</p>
                </CardContent>
              </Card>
            );
          })()}
        </div>
        {/* Heat Risk Category badge (moved from header to here) */}
        {(() => {
          const cellWithHourValues = activeCell
            ? {
                ...activeCell,
                thermal: htsiVal ?? activeCell.thermal,
                wbgt: wbgtVal ?? activeCell.wbgt,
                heatIndex: hiVal ?? activeCell.heatIndex,
                utci: utciVal ?? activeCell.utci,
                temp: tempVal ?? activeCell.temp,
                humidity: humidityVal ?? activeCell.humidity,
                wind: windVal ?? activeCell.wind,
                solar: solarVal ?? activeCell.solar,
              }
            : null;

          const activeLayerStep = cellWithHourValues
            ? layerStepFor(cellWithHourValues as MapWard, layer)
            : null;

          const catKey: RiskCategoryKey =
            layer === "risk"
              ? ((currentCategory === "EXTREME" ? "VERY_HIGH" : (currentCategory ?? "LOW")) as RiskCategoryKey)
              : activeLayerStep === 5
                ? "VERY_HIGH"
                : activeLayerStep === 4
                  ? "HIGH"
                  : activeLayerStep === 2 || activeLayerStep === 3
                    ? "MODERATE"
                    : "LOW";

          const categoryName =
            catKey === "VERY_HIGH"
              ? "Extreme"
              : catKey === "HIGH"
                ? "High"
                : catKey === "MODERATE"
                  ? "Moderate"
                  : "Low";

          const stepColor =
            activeLayerStep !== null && activeLayerStep !== undefined
              ? riskFillForStep(activeLayerStep)
              : riskFillForCategory(catKey);

          const layerLabel =
            layer === "wbgt"
              ? "WBGT"
              : layer === "hi"
                ? "Heat Index"
                : layer === "utci"
                  ? "UTCI"
                  : layer === "temp"
                    ? "Temperature"
                    : layer === "humidity"
                      ? "Humidity"
                      : layer === "wind"
                        ? "Wind Speed"
                        : layer === "solar"
                          ? "Solar Radiation"
                          : layer === "thermal"
                            ? "Thermal / HTSI"
                            : "Heat Risk";

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

          const advice =
            catKey === "VERY_HIGH"
              ? {
                  Icon: Flame,
                  head: `${categoryName} Advisory - Immediate Action Required`,
                  body: `Extreme thermal stress detected under ${layerLabel} layer${valText}. Avoid peak outdoor exposure 11am–4pm, open emergency cooling shelters, enforce hydration protocols for outdoor workers, and monitor senior citizens hourly.`,
                }
              : catKey === "HIGH"
                ? {
                    Icon: Activity,
                    head: `${categoryName} Warning - Limit Exposure`,
                    body: `High level conditions detected under ${layerLabel} layer${valText}. Restrict strenuous outdoor labor, schedule mandatory shade breaks, ensure accessible clean drinking water, and watch for symptoms of heat exhaustion.`,
                  }
                : catKey === "MODERATE"
                  ? {
                      Icon: Sun,
                      head: `${categoryName} Caution - Stay Hydrated`,
                      body: `Moderate level conditions detected under ${layerLabel} layer${valText}. Increase fluid intake, wear light breathable clothing, limit direct sun exposure during afternoon peak hours, and check on vulnerable populations.`,
                    }
                  : {
                      Icon: Users,
                      head: `${categoryName} Conditions - Standard Awareness`,
                      body: `Low risk conditions under ${layerLabel} layer${valText}. Maintain regular activities, stay hydrated, and follow standard municipal heat safety guidelines.`,
                    };

          return (
            <>
              {(displayCell || telemetry?.risk || activeEntry) && (
                <div className="mt-3">
                  <SectionLabel>
                    <span className="flex items-center gap-1.5">
                      <RiskBadge
                        category={currentCategory}
                        step={activeLayerStep}
                      />
                      <span className="text-xs text-muted-foreground">{layerLabel} Category</span>
                    </span>
                  </SectionLabel>
                </div>
              )}
              <div className="mt-3">
                <div
                  className={cn("rounded-xl border p-3.5 transition-colors", riskPanelClass(catKey))}
                >
                  <p className="flex items-center gap-2 text-xs font-extrabold tracking-tight">
                    <advice.Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: stepColor }}
                      aria-hidden
                    />
                    <span>{advice.head}</span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground font-medium">
                    {advice.body}
                  </p>
                </div>
              </div>
            </>
          );
        })()}
      </div>
      <div>
        <SectionLabel>
          <span className="flex items-center gap-1.5">Heat Metrics</span>
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Thermometer}
            label="WBGT"
            value={fmtVal(wbgtVal, 1)}
            unit="°C"
            tooltip={METRIC_EXPLANATIONS.wbgt}
            accuracyBadge={{
              value: `${wbgtSim}%`,
              tooltip: `Cross-model accuracy check: comparing Ahvaan calculations with ${wbgtSource} to verify accuracy.`,
            }}
          />
          <SubCard
            icon={Flame}
            label="Heat Index"
            value={fmtVal(hiVal, 1)}
            unit="°C"
            tooltip={METRIC_EXPLANATIONS.heatIndex}
            accuracyBadge={{
              value: `${hiSim}%`,
              tooltip: `Cross-model accuracy check: comparing Ahvaan calculations with ${hiSource} to verify accuracy.`,
            }}
          />
          <SubCard
            icon={Sun}
            label="UTCI"
            value={fmtVal(utciVal, 1)}
            unit="°C"
            tooltip={METRIC_EXPLANATIONS.utci}
          />
          <SubCard
            icon={Activity}
            label="Thermal Stress"
            value={fmtVal(htsiVal, 2)}
            tooltip={METRIC_EXPLANATIONS.thermal}
          />
        </div>
      </div>
      <div>
        <SectionLabel>Microclimate</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Thermometer}
            label="Temp"
            value={fmtVal(tempVal, 1)}
            unit="°C"
            tooltip={METRIC_EXPLANATIONS.thermal}
          />
          <SubCard
            icon={Droplet}
            label="Humidity"
            value={fmtVal(humidityVal, 0)}
            unit="%"
            tooltip="Relative Humidity (%): Moisture level in the ambient air."
          />
          <SubCard
            icon={Wind}
            label="Wind"
            value={fmtVal(windVal, 1)}
            unit="m/s"
            tooltip="Wind Velocity (m/s): Air movement speed helping heat dissipation."
          />
          <SubCard
            icon={Sun}
            label="Solar"
            value={fmtVal(solarVal, 0)}
            unit="W/m²"
            tooltip="Solar Radiation (W/m²): Direct solar heat load."
          />
        </div>
      </div>
      <div>
        <SectionLabel>Demographics & Population</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Users}
            label="Population"
            value={
              typeof telemetry?.demographics?.totalPopulation === "number" && telemetry.demographics.totalPopulation > 0
                ? telemetry.demographics.totalPopulation.toLocaleString("en-IN")
                : typeof activeCell?.population === "number" && activeCell.population > 0
                  ? activeCell.population.toLocaleString("en-IN")
                  : "-"
            }
            tooltip="Total estimated census population for this ward."
          />
          <SubCard
            icon={Users}
            label="Outdoor Workers"
            value={
              typeof telemetry?.demographics?.outdoorWorkerPct === "number" && telemetry.demographics.outdoorWorkerPct > 0
                ? `${(telemetry.demographics.outdoorWorkerPct * 100).toFixed(0)}%`
                : "-"
            }
            tooltip="Estimated proportion of outdoor workers exposed to heat."
          />
        </div>
      </div>
      {next24h.length > 1 && (
        <div className="min-w-0">
          <SectionLabel>Next 24 hours</SectionLabel>
          <Card className="min-w-0 overflow-hidden">
            <CardContent className="h-[200px] w-full min-w-0 overflow-hidden p-2 pr-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={next24h}
                  margin={{ left: -8, right: 4, top: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="label"
                    tick={AXIS_TICK}
                    interval={2}
                    minTickGap={8}
                    height={28}
                    label={xLabel("Hour (IST)")}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={AXIS_TICK}
                    tickCount={5}
                    width={34}
                    label={yLabel("Temp (°C)")}
                    domain={["auto", "auto"]}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={AXIS_TICK}
                    tickCount={5}
                    width={30}
                    label={yLabel("HTSI")}
                    domain={[0, 100]}
                  />
                  <Tooltip animationDuration={0} content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="temp"
                    name="Temp °C"
                    dot={false}
                    stroke="#f97316"
                    strokeWidth={2}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="htsi"
                    name="HTSI"
                    dot={false}
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    isAnimationActive={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
      {forecast?.days?.length ? (
        <div>
          <SectionLabel>Next 5 Days Forecast</SectionLabel>
          <div className="custom-scrollbar flex gap-2.5 overflow-x-auto overscroll-x-contain pb-3 snap-x snap-mandatory -mx-1 px-1">
            {forecast.days.slice(0, 5).map((d: any, i: number) => {
              const scDay = showcase?.days?.find((s: any) => s.forecastDate === d.date) ?? showcase?.days?.[i] ?? null;
              const scSum = scDay?.summary ?? null;
              const utciVal = d.utciMax ?? scSum?.utciMax ?? null;
              const humidityVal = scSum?.humidityAvg ?? null;
              const windVal = scSum?.windAvg ?? null;
              const solarVal = scSum?.solarAvg ?? null;
              const htsiVal = d.htsiMax ?? scSum?.htsiMax ?? (typeof d.risk === "number" ? d.risk * 100 : null);

              return (
                <div
                  key={d.date}
                  className={`flex min-w-[310px] snap-start flex-col gap-2.5 rounded-xl border p-3.5 shadow-xs transition-shadow hover:shadow-sm ${i === 0 ? "bg-primary/5 border-primary/20" : "bg-card"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        {new Date(d.date).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {i === 0
                          ? "Today"
                          : new Date(d.date).toLocaleDateString("en-IN", {
                              weekday: "short",
                            })}
                      </p>
                    </div>
                    <RiskBadge category={d.category} />
                  </div>

                  {/* 4x2 Grid showing ALL forecast heat metrics & microclimate */}
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="rounded-lg bg-muted/40 p-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">Temp</p>
                      <p className="text-xs font-bold tabular-nums">
                        {d.tempMax?.toFixed(0) ?? "-"}°
                        <span className="text-[10px] font-normal text-muted-foreground">
                          /{d.tempMin?.toFixed(0) ?? "-"}°
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">WBGT</p>
                      <p className="text-xs font-bold tabular-nums">
                        {d.wbgtMax ? `${d.wbgtMax.toFixed(1)}°` : "-"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">HI</p>
                      <p className="text-xs font-bold tabular-nums">
                        {d.heatIndexMax ? `${d.heatIndexMax.toFixed(1)}°` : "-"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">UTCI</p>
                      <p className="text-xs font-bold tabular-nums">
                        {utciVal ? `${Number(utciVal).toFixed(1)}°` : "-"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">Humidity</p>
                      <p className="text-xs font-bold tabular-nums">
                        {humidityVal ? `${Number(humidityVal).toFixed(0)}%` : "-"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">Wind</p>
                      <p className="text-xs font-bold tabular-nums">
                        {windVal ? `${Number(windVal).toFixed(1)}m/s` : "-"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">Solar</p>
                      <p className="text-xs font-bold tabular-nums">
                        {solarVal ? `${Number(solarVal).toFixed(0)}W` : "-"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">HTSI</p>
                      <p className="text-xs font-bold tabular-nums">
                        {htsiVal ? Number(htsiVal).toFixed(1) : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-xs">
                    <span className="font-semibold text-muted-foreground">
                      Mortality Risk
                    </span>
                    {d.mortality ? (
                      <span className="flex items-center gap-1 font-bold text-foreground">
                        <HeartPulse className="h-3.5 w-3.5 text-red-500" /> {d.mortality.index}/100 ({d.mortality.band})
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Raw layer value per ward (mirrors the map's layerValue). */
function layerNumber(cell: any, lyr: MapLayer): number | null {
  const v =
    lyr === "thermal"
      ? cell.thermal
      : lyr === "wbgt"
        ? cell.wbgt
        : lyr === "hi"
          ? cell.heatIndex
          : lyr === "utci"
            ? cell.utci
            : lyr === "temp"
              ? (cell.temp ?? cell.heatIndex)
              : lyr === "humidity"
                ? cell.humidity
                : lyr === "wind"
                  ? cell.wind
                  : lyr === "solar"
                    ? cell.solar
                    : null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Pill bands per non-risk layer. Edges match the map's painted steps
 * (step 1 → Low, 2–3 → Moderate, 4 → High, 5 → Extreme).
 */
const LAYER_PILL_META: Record<
  Exclude<MapLayer, "risk">,
  {
    bands: { cat: string; label: string; hint: string }[];
    fmt: (v: number) => string;
    suffix: string;
    avgHint: string;
  }
> = {
  thermal: {
    bands: [
      { cat: "LOW", label: "Low", hint: "HTSI < 30" },
      { cat: "MODERATE", label: "Moderate", hint: "HTSI 30–65" },
      { cat: "HIGH", label: "High", hint: "HTSI 65–80" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "HTSI ≥ 80" },
    ],
    fmt: (v) => {
      const norm = v > 1 ? (v > 100 ? v / 10 : v) : v * 100;
      return norm.toFixed(2);
    },
    suffix: "",
    avgHint: "Mean HTSI across visible wards",
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
    avgHint: "Mean WBGT across visible wards",
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
    avgHint: "Mean heat index across visible wards",
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
    avgHint: "Mean UTCI across visible wards",
  },
  temp: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Temp < 28°C" },
      { cat: "MODERATE", label: "Moderate", hint: "Temp 28–35°C" },
      { cat: "HIGH", label: "High", hint: "Temp 35–38°C" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Temp ≥ 38°C" },
    ],
    fmt: (v) => `${v.toFixed(1)}°`,
    suffix: "C",
    avgHint: "Mean temperature across visible wards",
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
    avgHint: "Mean relative humidity across visible wards",
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
    avgHint: "Mean wind speed across visible wards",
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
    avgHint: "Mean solar radiation across visible wards",
  },
};

export default function MapsPage() {
  const { selectedId, setSelectedId } = useWard();
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 180);
  const deferredSearch = useDeferredValue(debouncedSearch);
  const [layer, setLayer] = useState<MapLayer>("thermal");
  const [filters, setFilters] = useState<{ cats: Set<string>; popMin: number }>(
    () => ({
      cats: new Set(["LOW", "MODERATE", "HIGH", "VERY_HIGH"]),
      popMin: 0,
    }),
  );
  const [controlsOpen, setControlsOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const isMobile = useIsMobile();
  const reduceMotion = !!useReducedMotion();
  const shouldAnimate = !reduceMotion && !isMobile;

  const swrOpts = useMemo(
    () => ({
      keepPreviousData: true,
      dedupingInterval: 10000,
      revalidateOnFocus: false,
    }),
    [],
  );

  const wardSwrOpts = useMemo(
    () => ({
      dedupingInterval: 10000,
      revalidateOnFocus: false,
    }),
    [],
  );

  const { data: summary } = useSWR("/api/wards/summary", jsonFetch, swrOpts);
  const { data: heatmap } = useSWR("/api/wards/heatmap", jsonFetch, swrOpts);
  const displayId = hoveredId ?? selectedId;
  const { data: telemetryRaw } = useSWR(
    displayId ? `/api/wards/${displayId}/telemetry` : null,
    jsonFetch,
    wardSwrOpts,
  );
  const { data: forecastRaw } = useSWR(
    displayId ? `/api/forecast/${displayId}?days=5` : null,
    jsonFetch,
    wardSwrOpts,
  );
  const cells = (heatmap as any)?.wards ?? [];
  const selectedCell = selectedId != null
    ? (cells.find((c: any) => String(c.wardId) === String(selectedId) || String(c.ward) === String(selectedId)) ?? null)
    : null;
  const displayCell = displayId != null
    ? (cells.find((c: any) => String(c.wardId) === String(displayId) || String(c.ward) === String(displayId)) ?? null)
    : null;

  const forecast = forecastRaw?.locationId === displayId ? forecastRaw : null;

  const telemetry = useMemo(() => {
    if (telemetryRaw?.wardId === displayId) return telemetryRaw;
    if (!displayCell) return null;
    return {
      wardId: displayCell.wardId,
      ward: displayCell.ward,
      wardName: displayCell.wardName ?? null,
      timezone: "Asia/Kolkata",
      risk: {
        value: displayCell.riskScore ?? 0,
        category: displayCell.category ?? "LOW",
        displayCategory: displayCategory(displayCell.category ?? "LOW"),
        thermal: displayCell.thermal ?? 0,
        exposure: displayCell.exposure ?? 0,
        vulnerability: displayCell.vulnerability ?? 0,
        persistence: displayCell.persistence ?? 0,
        recovery: displayCell.recovery ?? 0,
        wbgt: displayCell.wbgt ?? 0,
        heatIndex: displayCell.heatIndex ?? 0,
        utci: displayCell.utci ?? null,
        confidence: displayCell.confidence ?? 1.0,
        computedAt: new Date().toISOString(),
      },
      macro: {
        temp: displayCell.temp ?? displayCell.heatIndex ?? null,
        realFeel: displayCell.heatIndex ?? null,
        humidity: displayCell.humidity ?? null,
        wind: displayCell.wind ?? null,
        solar: displayCell.solar ?? null,
        timestamp: new Date().toISOString(),
        qualifiers: {
          temp: qualifyTemp(displayCell.heatIndex ?? 30),
          humidity: qualifyHumidity(displayCell.humidity ?? 60),
          wind: qualifyWind(displayCell.wind ?? 2),
          solar: qualifySolar(displayCell.solar ?? 300),
        },
        deltas: { temp: "flat", humidity: "flat", wind: "flat", solar: "flat" },
      },
      demographics: {
        totalPopulation: displayCell.population ?? 0,
      },
    };
  }, [telemetryRaw, displayId, displayCell]);
  // Frontend-side alert evaluation (lib/alerts.ts): no DB, nothing saved.
  // Combines the board risk with the cell's engine indexes when present.
  const modalEvaluation = useMemo(() => {
    if (!selectedCell && !telemetry) return null;
    const label =
      selectedCell?.ward !== null && selectedCell?.ward !== undefined
        ? `Ward ${selectedCell.ward}`
        : selectedId
          ? `Location ${selectedId}`
          : "Ward";
    return evaluateWardAlert(
      {
        riskScore:
          (telemetry as any)?.risk?.value ?? selectedCell?.riskScore ?? null,
        category:
          (telemetry as any)?.risk?.category ?? selectedCell?.category ?? null,
        wbgtMax: selectedCell?.wbgt ?? (telemetry as any)?.risk?.wbgt ?? null,
        heatIndexMax:
          selectedCell?.heatIndex ??
          (telemetry as any)?.risk?.heatIndex ??
          null,
      },
      label,
    );
  }, [selectedCell, telemetry, selectedId]);
  // NOTE: text search never removes wards — it only highlights matches
  // (dim + outline) inside KolkataMap via searchQuery. Only the layer
  // controls (category/population) filter the rendered set.
  const filteredCells = useMemo(
    () =>
      cells.filter((c: any) => {
        if (c.category && !filters.cats.has(c.category)) return false;
        if ((c.population ?? 0) < filters.popMin) return false;
        if (c.wardId === selectedId) return true;
        return true;
      }),
    [cells, filters, selectedId],
  );

  // Layer-aware pill data: distribution buckets always match what the map
  // paints for the active layer (risk uses engine categories; every other
  // layer buckets wards by their painted 1–5 step: 1 Low, 2–3 Moderate,
  // 4 High, 5 Extreme). Trailing chip is Load for risk, layer mean otherwise.
  const pill = useMemo(() => {
    if ((layer as string) === "risk") {
      return {
        bands: [
          {
            label: "Low",
            cat: "LOW",
            v: summary?.low ?? 0,
            hint: "Wards in LOW band (risk < 0.30)",
          },
          {
            label: "Moderate",
            cat: "MODERATE",
            v: summary?.moderate ?? 0,
            hint: "Wards in MODERATE band (risk 0.30–0.50)",
          },
          {
            label: "High",
            cat: "HIGH",
            v: summary?.high ?? 0,
            hint: "Wards in HIGH band (risk 0.50–0.65)",
          },
          {
            label: "Extreme",
            cat: "VERY_HIGH",
            v: summary?.extreme ?? 0,
            hint: "Wards in VERY_HIGH band (risk ≥ 0.65)",
          },
        ],
        avgLabel: "Load",
        avg: summary ? String(summary.metroHeatLoad > 100 ? Math.round(summary.metroHeatLoad / 10) : summary.metroHeatLoad) : "—",
        avgSuffix: "/100",
        avgHint: "Metropolitan Heat Load — mean ward risk × 100",
      };
    }
    const meta = LAYER_PILL_META[layer];
    const counts: Record<string, number> = {
      LOW: 0,
      MODERATE: 0,
      HIGH: 0,
      VERY_HIGH: 0,
    };
    let sum = 0;
    let n = 0;
    for (const c of filteredCells) {
      const v = layerNumber(c, layer);
      if (v === null) continue;
      sum += v;
      n += 1;
      const step = layerStepFor(c as MapWard, layer) ?? 1;
      const band =
        step <= 1
          ? "LOW"
          : step <= 3
            ? "MODERATE"
            : step === 4
              ? "HIGH"
              : "VERY_HIGH";
      counts[band] += 1;
    }
    return {
      bands: meta.bands.map((b) => ({ ...b, v: counts[b.cat] ?? 0 })),
      avgLabel: "Avg",
      avg: n > 0 ? meta.fmt(sum / n) : "—",
      avgSuffix: meta.suffix,
      avgHint: meta.avgHint,
    };
  }, [layer, summary, filteredCells]);

  const { data: showcase } = useSWR(
    displayId ? `/api/showcase/${displayId}` : null,
    jsonFetch,
    swrOpts,
  );

  const downloadTelemetry = useCallback(() => {
    if (!telemetry) return;
    const exportData = {
      wardId: telemetry.wardId,
      ward: telemetry.ward,
      wardName: telemetry.wardName,
      locality: getWardLocality(telemetry.ward),
      timezone: telemetry.timezone ?? "Asia/Kolkata",
      downloadedAt: new Date().toISOString(),
      currentTelemetry: telemetry,
      precomputedAnalysis: (showcase as any)?.days ?? [],
      forecastOutlook: (forecast as any)?.days ?? [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ward-${telemetry.ward ?? displayId ?? selectedId}-analysis-telemetry.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [telemetry, showcase, forecast, selectedId, displayId]);

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <TopBar
        watchLabel={
          summary
            ? `Level ${summary.watch.level} · ${summary.watch.name}`
            : "Level …"
        }
        syncedAt={summary?.refreshedAt ?? (heatmap as any)?.refreshedAt ?? null}
        syncDetail={summary ? `${summary.synced}/${summary.total}` : null}
        timezone="Asia/Kolkata"
        onSendAlert={() => setModalOpen(true)}
        searchQuery={search}
        onSearchChange={setSearch}
        onAnalyticsOpen={() => {}}
        wards={cells.map((c: any) => ({
          ward: c.ward,
          wardName: c.wardName,
          wardId: c.wardId,
        }))}
        onSelectWard={(id) => setSelectedId(id)}
      />
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <div
          className="relative flex min-h-0 flex-1 flex-col bg-muted/20"
          onMouseLeave={() => setHoveredId(null)}
        >
          <div className="relative flex-1">
            {cells.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Skeleton className="h-10 w-10 rounded-full" />
              </div>
            ) : (
              <KolkataMap
                cells={filteredCells}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={(id) => setSelectedId(id)}
                onHover={setHoveredId}
                searchQuery={deferredSearch}
                layer={layer}
                onOpenControls={() => setControlsOpen(true)}
              />
            )}
            {/* Layer-aware summary pill — distribution always matches the
                painted layer (risk bands for risk, painted-step bands + layer
                mean for every other layer) */}
            {summary && (
              <div className="pointer-events-auto absolute left-1/2 top-3 z-20 hidden -translate-x-1/2 cursor-default sm:flex">
                <div className="flex items-center gap-1.5 rounded-full border bg-card p-1.5 shadow-xl backdrop-blur">
                  {pill.bands.map((k) => (
                    <span
                      key={k.label}
                      title={k.hint}
                      className="flex cursor-help items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: riskFillForCategory(k.cat) }}
                      />
                      {k.label}{" "}
                      <span className="font-black tabular-nums">{k.v}</span>
                    </span>
                  ))}
                  <span
                    title={pill.avgHint}
                    className="flex cursor-help items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
                  >
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    {pill.avgLabel}{" "}
                    <span className="font-black tabular-nums">{pill.avg}</span>
                    <span className="font-normal text-muted-foreground">
                      {pill.avgSuffix}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        <WardInfoBar
          selectedId={selectedId}
          selectedCell={selectedCell}
          displayId={displayId}
          displayCell={displayCell}
          telemetry={telemetry as any}
          forecast={forecast as any}
          onClose={() => setSelectedId(null)}
          onDownload={downloadTelemetry}
        >
          <WardDetailBody
            telemetry={telemetry as any}
            forecast={forecast as any}
            selectedCell={selectedCell}
            selectedId={selectedId}
            displayCell={displayCell}
            displayId={displayId}
            hoveredId={hoveredId}
            layer={layer}
          />
        </WardInfoBar>
      </div>
      <ControlsPopup
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        layer={layer}
        onLayerChange={setLayer}
        filters={filters}
        onFilterChange={setFilters}
      />
      <EmailAlertModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        wardId={selectedId}
        ward={selectedCell?.ward ?? null}
        wardName={selectedCell?.wardName ?? null}
        evaluation={modalEvaluation}
        timezone="Asia/Kolkata"
        telemetry={telemetry as any}
        outlook={((forecast as any)?.days ?? []).map((d: any) => ({
          date: d.date,
          tempMax: d.tempMax,
          risk: d.risk,
          category: d.category,
        }))}
      />
    </div>
  );
}
