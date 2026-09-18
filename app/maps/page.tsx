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
import { riskFillForCategory, riskPanelClass } from "@/lib/risk";
import { TopBar } from "@/components/console/TopBar";
import { LeftNav } from "@/components/layout/LeftNav";
import {
  KolkataMap,
  type MapWard,
  layerStepFor,
} from "@/components/map/KolkataMap";
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

function WardDetailBody({
  telemetry,
  forecast,
  selectedCell,
  selectedId,
}: any) {
  const router = useRouter();
  const onAnalyticsOpen = () => {
    if (selectedId) router.push(`/analysis?ward=${selectedId}`);
    else router.push("/analysis");
  };
  const { data: showcase } = useSWR(
    selectedId ? `/api/showcase/${selectedId}` : null,
    jsonFetch,
  );
  const days: any[] = showcase?.days ?? [];
  const [dayIdx, setDayIdx] = useState(0);
  const [hour, setHour] = useState<string | null>(null);
  useEffect(() => {
    setDayIdx(0);
    setHour(null);
  }, [selectedId]);
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
    return `${String((Number(parts) + 1) % 24).padStart(2, "0")}:00:00`;
  }, []);
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

  if (!telemetry)
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  return (
    <div className="space-y-5 p-4">
      <div>
        <SectionLabel>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Date & time
          </span>
        </SectionLabel>
        {days.length > 0 ? (
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
                  {i === 0 ? "Today" : d.forecastDate.slice(8, 10) + "th"}
                </button>
              ))}
            </div>
            <div className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Hour (IST)
              </span>
              <Select
                value={entry?.hour ?? ""}
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
          <p className="text-xs text-muted-foreground">
            Hourly engine data unavailable for this ward.
          </p>
        )}
      </div>
      <div>
        <SectionLabel>Risk & Mortality</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Card className="overflow-hidden border-2 border-primary/20 shadow-sm">
            <div className="h-2 bg-gradient-to-r from-teal-500 via-orange-500 to-red-600" />
            <CardContent className="p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Flame className="h-3 w-3" /> Risk
              </p>
              <p className="text-3xl font-black tabular-nums">
                {telemetry.risk ? telemetry.risk.value.toFixed(3) : "-"}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {telemetry.risk?.displayCategory ?? ""}
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
                    <HeartPulse className="h-3 w-3" /> Mortality
                  </p>
                  <p className="text-3xl font-black tabular-nums">
                    {mort.index}
                    <span className="text-base font-semibold text-muted-foreground">
                      /100
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{mort.band}</p>
                </CardContent>
              </Card>
            );
          })()}
        </div>
        {telemetry.risk &&
          (() => {
            const cat = telemetry.risk.category;
            const advice =
              cat === "VERY_HIGH"
                ? {
                    Icon: Flame,
                    head: "Extreme - Act now",
                    body: "Avoid outdoor 12–4pm, open cooling shelters, check elderly hourly.",
                  }
                : cat === "HIGH"
                  ? {
                      Icon: Activity,
                      head: "High - Limit exposure",
                      body: "Limit outdoor work, ensure water/shade, monitor vulnerable.",
                    }
                  : cat === "MODERATE"
                    ? {
                        Icon: Sun,
                        head: "Moderate - Stay hydrated",
                        body: "Take breaks, hydrate, watch for heat symptoms.",
                      }
                    : {
                        Icon: Users,
                        head: "Low - Normal",
                        body: "Normal activities, stay aware.",
                      };
            return (
              <div className="mt-3">
                <div
                  className={cn("rounded-xl border p-3", riskPanelClass(cat))}
                >
                  <p className="flex items-center gap-1.5 text-xs font-bold">
                    <advice.Icon
                      className="h-3.5 w-3.5"
                      style={{ color: riskFillForCategory(cat) }}
                      aria-hidden
                    />
                    {advice.head}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {advice.body}
                  </p>
                </div>
              </div>
            );
          })()}
      </div>
      <div>
        <SectionLabel>
          <span className="flex items-center gap-1.5">Heat Metrics</span>
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {entry ? (
            <>
              <SubCard
                icon={Flame}
                label="HTSI"
                value={fmtVal(entry.htsi, 0)}
                unit="/100"
              />
              <SubCard
                icon={Thermometer}
                label="WBGT"
                value={fmtVal(entry.wbgt)}
                unit="°C"
              />
              <SubCard
                icon={Flame}
                label="Heat Index"
                value={fmtVal(entry.hi)}
                unit="°C"
              />
              <SubCard
                icon={Sun}
                label="UTCI"
                value={fmtVal(entry.utci)}
                unit="°C"
              />
            </>
          ) : (
            <>
              <SubCard
                icon={Thermometer}
                label="WBGT"
                value={telemetry.risk ? telemetry.risk.wbgt.toFixed(1) : "-"}
                unit="°C"
              />
              <SubCard
                icon={Flame}
                label="Heat Index"
                value={
                  telemetry.risk ? telemetry.risk.heatIndex.toFixed(1) : "-"
                }
                unit="°C"
              />
              <SubCard
                icon={Sun}
                label="UTCI"
                value={
                  telemetry.risk?.utci != null
                    ? (telemetry.risk.utci as number).toFixed(1)
                    : "-"
                }
                unit="°C"
              />
              <SubCard
                icon={Activity}
                label="Thermal Stress"
                value={telemetry.risk ? telemetry.risk.thermal.toFixed(2) : "-"}
              />
            </>
          )}
        </div>
      </div>
      <div>
        <SectionLabel>Microclimate</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Thermometer}
            label="Temp"
            value={fmtVal(entry?.temp ?? telemetry.macro.temp)}
            unit="°C"
          />
          <SubCard
            icon={Droplet}
            label="Humidity"
            value={fmtVal(entry?.humidity ?? telemetry.macro.humidity, 0)}
            unit="%"
          />
          <SubCard
            icon={Wind}
            label="Wind"
            value={fmtVal(entry?.wind ?? telemetry.macro.wind)}
            unit="m/s"
          />
          <SubCard
            icon={Sun}
            label="Solar"
            value={fmtVal(entry?.solar ?? telemetry.macro.solar, 0)}
            unit="W/m²"
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
            {forecast.days.slice(0, 5).map((d: any, i: number) => (
              <div
                key={d.date}
                className={`flex min-w-[268px] snap-start flex-col gap-2 rounded-xl border p-3 ${i === 0 ? "bg-primary/5 border-primary/20" : "bg-card"}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold">
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
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${d.category === "VERY_HIGH" ? "bg-red-600 text-white" : d.category === "HIGH" ? "bg-orange-500 text-white" : d.category === "MODERATE" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"}`}
                  >
                    {d.category === "VERY_HIGH" ? "Extreme" : d.category}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-[10px] text-muted-foreground">Temp</p>
                    <p className="text-sm font-bold tabular-nums">
                      {d.tempMax?.toFixed(0) ?? "-"}°
                      <span className="text-xs font-normal text-muted-foreground">
                        /{d.tempMin?.toFixed(0) ?? "-"}°
                      </span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-[10px] text-muted-foreground">WBGT</p>
                    <p className="text-sm font-bold tabular-nums">
                      {d.wbgtMax?.toFixed(1) ?? "-"}°
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-[10px] text-muted-foreground">HI</p>
                    <p className="text-sm font-bold tabular-nums">
                      {d.heatIndexMax?.toFixed(1) ?? "-"}°
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold tabular-nums">
                    Risk {(d.risk * 100).toFixed(0)}/100
                  </span>
                  {d.mortality && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <HeartPulse className="h-3 w-3" /> {d.mortality.index}
                    </span>
                  )}
                </div>
              </div>
            ))}
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
      : lyr === "exposure"
        ? cell.exposure
        : lyr === "vulnerability"
          ? cell.vulnerability
          : lyr === "wbgt"
            ? cell.wbgt
            : lyr === "hi"
              ? cell.heatIndex
              : null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Pill bands per non-risk layer. Edges match the map's painted steps
 * (step 1 → Low, 2–3 → Moderate, 4 → High, 5 → Extreme):
 * 0–1 layers break at .2/.4/.6/.8, WBGT at (v−15)/25, Heat Index at (v−20)/35.
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
      { cat: "LOW", label: "Low", hint: "Thermal stress < 20" },
      { cat: "MODERATE", label: "Moderate", hint: "Thermal stress 20–60" },
      { cat: "HIGH", label: "High", hint: "Thermal stress 60–80" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Thermal stress ≥ 80" },
    ],
    fmt: (v) => (v * 100).toFixed(0),
    suffix: "/100",
    avgHint: "Mean thermal stress across visible wards (×100)",
  },
  exposure: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Exposure < 20" },
      { cat: "MODERATE", label: "Moderate", hint: "Exposure 20–60" },
      { cat: "HIGH", label: "High", hint: "Exposure 60–80" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Exposure ≥ 80" },
    ],
    fmt: (v) => (v * 100).toFixed(0),
    suffix: "/100",
    avgHint: "Mean exposure across visible wards (×100)",
  },
  vulnerability: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Vulnerability < 20" },
      { cat: "MODERATE", label: "Moderate", hint: "Vulnerability 20–60" },
      { cat: "HIGH", label: "High", hint: "Vulnerability 60–80" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Vulnerability ≥ 80" },
    ],
    fmt: (v) => (v * 100).toFixed(0),
    suffix: "/100",
    avgHint: "Mean vulnerability across visible wards (×100)",
  },
  wbgt: {
    bands: [
      { cat: "LOW", label: "Low", hint: "WBGT < 20°C" },
      { cat: "MODERATE", label: "Moderate", hint: "WBGT 20–30°C" },
      { cat: "HIGH", label: "High", hint: "WBGT 30–35°C" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "WBGT ≥ 35°C" },
    ],
    fmt: (v) => `${v.toFixed(1)}°`,
    suffix: "C",
    avgHint: "Mean WBGT across visible wards",
  },
  hi: {
    bands: [
      { cat: "LOW", label: "Low", hint: "Heat index < 27°C" },
      { cat: "MODERATE", label: "Moderate", hint: "Heat index 27–41°C" },
      { cat: "HIGH", label: "High", hint: "Heat index 41–48°C" },
      { cat: "VERY_HIGH", label: "Extreme", hint: "Heat index ≥ 48°C" },
    ],
    fmt: (v) => `${v.toFixed(1)}°`,
    suffix: "C",
    avgHint: "Mean heat index across visible wards",
  },
};

export default function MapsPage() {
  const { selectedId, setSelectedId } = useWard();
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 180);
  const deferredSearch = useDeferredValue(debouncedSearch);
  const [layer, setLayer] = useState<MapLayer>("risk");
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

  const { data: summary } = useSWR("/api/wards/summary", jsonFetch);
  const { data: heatmap } = useSWR("/api/wards/heatmap", jsonFetch);
  const displayId = hoveredId ?? selectedId;
  const { data: telemetryRaw } = useSWR(
    displayId ? `/api/wards/${displayId}/telemetry` : null,
    jsonFetch,
  );
  const { data: forecastRaw } = useSWR(
    displayId ? `/api/forecast/${displayId}?days=5` : null,
    jsonFetch,
  );
  // SWR keeps the previous ward's payload while a new one loads (and after
  // hover ends) — only use data that matches the ward actually displayed.
  const telemetry = telemetryRaw?.wardId === displayId ? telemetryRaw : null;
  const forecast = forecastRaw?.locationId === displayId ? forecastRaw : null;
  const cells = (heatmap as any)?.wards ?? [];
  const selectedCell = selectedId
    ? (cells.find((c: any) => c.wardId === selectedId) ?? null)
    : null;
  const displayCell = displayId
    ? (cells.find((c: any) => c.wardId === displayId) ?? null)
    : null;
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
    if (layer === "risk") {
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
        avg: summary ? String(summary.metroHeatLoad) : "—",
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

  const downloadTelemetry = useCallback(() => {
    if (!telemetry) return;
    const blob = new Blob(
      [
        JSON.stringify(
          { ...telemetry, forecast: (forecast as any)?.days ?? [] },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telemetry-ward-${(telemetry as any).ward ?? selectedId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [telemetry, forecast, selectedId]);

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
            <button
              onClick={() => setControlsOpen(true)}
              className="absolute bottom-[172px] right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border bg-card shadow-lg hover:bg-accent"
              aria-label="Map layers"
            >
              <Layers className="h-4 w-4" />
            </button>
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
