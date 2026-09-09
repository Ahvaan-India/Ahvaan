"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useDeferredValue,
} from "react";
import useSWR, { SWRConfig } from "swr";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Thermometer,
  Droplet,
  Wind,
  Sun,
  Users,
  Flame,
  Layers,
  ChevronRight,
  Activity,
  HeartPulse,
} from "lucide-react";
import { TopBar } from "@/components/console/TopBar";
import {
  KolkataMap,
  type MapWard,
  RISK_COLORS,
} from "@/components/map/KolkataMap";
import { type MapLayer } from "@/components/console/LeftSidebar";
import { ControlsPopup } from "@/components/console/ControlsPopup";
import { WardPopup } from "@/components/console/WardPopup";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SubCard } from "@/components/console/SubCard";
import {
  SendAlertModal,
  type AlertOption,
} from "@/components/console/SendAlertModal";
import type { Telemetry } from "@/components/console/TelemetryPanel";
import { computeMortalityIndex } from "@/lib/heatshield/mortality";
import { KOLKATA_TIMEZONE } from "@/lib/geo/timezone";
import { useIsMobile } from "@/lib/hooks/useMobile";

const AnalyticsModal = dynamic(
  () =>
    import("@/components/console/AnalyticsModal").then((m) => m.AnalyticsModal),
  {
    ssr: false,
    loading: () => null,
  },
);

const jsonFetch = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

interface Summary {
  wards: number;
  synced: number;
  total: number;
  active: number;
  extreme: number;
  high: number;
  moderate: number;
  deltas: Record<string, number | null>;
  deltaBasis: string | null;
  metroHeatLoad: number;
  watch: { level: number; name: string };
  refreshedAt: string;
}

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

function WardDetailBody({
  telemetry,
  forecast,
  selectedCell,
  alertOptions,
  selectedId,
  onSendAlert,
  onAnalyticsOpen,
}: {
  telemetry: Telemetry | null;
  forecast:
    | {
        days: Array<{
          date: string;
          risk: number;
          category: string;
          tempMin: number;
          tempMax: number;
          wbgtMax?: number;
          heatIndexMax?: number;
          mortality?: { index: number; band: string };
        }>;
      }
    | undefined;
  selectedCell: MapWard | null;
  alertOptions: AlertOption[];
  selectedId: number | null;
  onSendAlert: (id: number) => void;
  onAnalyticsOpen: () => void;
}) {
  if (!telemetry) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-2 gap-2">
        <Card className="overflow-hidden border-2 border-primary/20 shadow-sm">
          <div className="h-2 bg-gradient-to-r from-teal-500 via-orange-500 to-red-600" />
          <CardContent className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Flame className="h-3 w-3" /> Risk
            </p>
            <p className="text-3xl font-black tabular-nums">
              {telemetry.risk ? telemetry.risk.value.toFixed(3) : "—"}
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

      {/* Recommended action — fixed for dark mode contrast */}
      {telemetry.risk && (
        <div
          className={
            telemetry.risk.category === "VERY_HIGH"
              ? "rounded-xl border bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50 p-3"
              : telemetry.risk.category === "HIGH"
                ? "rounded-xl border bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900/50 p-3"
                : telemetry.risk.category === "MODERATE"
                  ? "rounded-xl border bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 p-3"
                  : "rounded-xl border bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50 p-3"
          }
        >
          <p
            className={
              telemetry.risk.category === "VERY_HIGH"
                ? "text-xs font-bold flex items-center gap-1.5 text-red-900 dark:text-red-100"
                : telemetry.risk.category === "HIGH"
                  ? "text-xs font-bold flex items-center gap-1.5 text-orange-900 dark:text-orange-100"
                  : telemetry.risk.category === "MODERATE"
                    ? "text-xs font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-100"
                    : "text-xs font-bold flex items-center gap-1.5 text-emerald-900 dark:text-emerald-100"
            }
          >
            {telemetry.risk.category === "VERY_HIGH" ? (
              <>
                <Flame className="h-3.5 w-3.5" /> Extreme — Act now
              </>
            ) : telemetry.risk.category === "HIGH" ? (
              <>
                <Activity className="h-3.5 w-3.5" /> High — Limit exposure
              </>
            ) : telemetry.risk.category === "MODERATE" ? (
              <>
                <Sun className="h-3.5 w-3.5" /> Moderate — Stay hydrated
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5" /> Low — Normal
              </>
            )}
          </p>
          <p
            className={
              telemetry.risk.category === "VERY_HIGH"
                ? "mt-1.5 text-xs leading-relaxed text-red-800/80 dark:text-red-200/80"
                : telemetry.risk.category === "HIGH"
                  ? "mt-1.5 text-xs leading-relaxed text-orange-800/80 dark:text-orange-200/80"
                  : telemetry.risk.category === "MODERATE"
                    ? "mt-1.5 text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/80"
                    : "mt-1.5 text-xs leading-relaxed text-emerald-800/80 dark:text-emerald-200/80"
            }
          >
            {telemetry.risk.category === "VERY_HIGH"
              ? "Avoid outdoor 12–4pm, open cooling shelters, check elderly hourly."
              : telemetry.risk.category === "HIGH"
                ? "Limit outdoor work, ensure water/shade, monitor vulnerable."
                : telemetry.risk.category === "MODERATE"
                  ? "Take breaks, hydrate, watch for heat symptoms."
                  : "Normal activities, stay aware."}
          </p>
        </div>
      )}

      <div>
        <SectionLabel>
          <span className="flex items-center gap-1.5">
            <Thermometer className="h-3.5 w-3.5" /> Heat Metrics
          </span>
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Thermometer}
            label="WBGT"
            value={telemetry.risk ? telemetry.risk.wbgt.toFixed(1) : "—"}
            unit="°C"
            qualifier={
              telemetry.risk
                ? telemetry.risk.wbgt >= 32
                  ? "Extreme"
                  : telemetry.risk.wbgt >= 28
                    ? "High"
                    : "Moderate"
                : null
            }
          />
          <SubCard
            icon={Flame}
            label="Heat Index"
            value={telemetry.risk ? telemetry.risk.heatIndex.toFixed(1) : "—"}
            unit="°C"
            qualifier={
              telemetry.risk
                ? telemetry.risk.heatIndex >= 41
                  ? "Danger"
                  : telemetry.risk.heatIndex >= 32
                    ? "High"
                    : "Moderate"
                : null
            }
          />
          <SubCard
            icon={Sun}
            label="UTCI"
            value={
              telemetry.risk?.utci != null
                ? (telemetry.risk.utci as number).toFixed(1)
                : "—"
            }
            unit={telemetry.risk?.utci != null ? "°C" : ""}
            qualifier={
              telemetry.risk?.utci != null
                ? (telemetry.risk.utci as number) >= 32
                  ? "High"
                  : "Moderate"
                : "Est."
            }
          />
          <SubCard
            icon={Activity}
            label="Thermal Stress"
            value={telemetry.risk ? telemetry.risk.thermal.toFixed(2) : "—"}
            unit=""
            qualifier={
              telemetry.risk
                ? telemetry.risk.thermal >= 0.6
                  ? "High"
                  : "Low"
                : null
            }
          />
        </div>
      </div>

      <div>
        <SectionLabel>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Risk Components
          </span>
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Users}
            label="Exposure"
            value={telemetry.risk ? telemetry.risk.exposure.toFixed(2) : "—"}
            unit=""
            qualifier={
              telemetry.risk
                ? telemetry.risk.exposure >= 0.6
                  ? "High"
                  : "Low"
                : null
            }
          />
          <SubCard
            icon={Activity}
            label="Vulnerability"
            value={
              telemetry.risk ? telemetry.risk.vulnerability.toFixed(2) : "—"
            }
            unit=""
            qualifier={
              telemetry.risk
                ? telemetry.risk.vulnerability >= 0.5
                  ? "High"
                  : "Low"
                : null
            }
          />
          <SubCard
            icon={Flame}
            label="Persistence"
            value={telemetry.risk ? telemetry.risk.persistence.toFixed(2) : "—"}
            unit=""
            qualifier={null}
          />
          <SubCard
            icon={Droplet}
            label="Recovery"
            value={telemetry.risk ? telemetry.risk.recovery.toFixed(2) : "—"}
            unit=""
            qualifier={null}
          />
        </div>
      </div>

      <div>
        <SectionLabel>
          <span className="flex items-center gap-1.5">
            <Wind className="h-3.5 w-3.5" /> Microclimate
          </span>
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Thermometer}
            label="Temp"
            value={
              telemetry.macro.temp !== null
                ? telemetry.macro.temp.toFixed(1)
                : "—"
            }
            unit="°C"
            qualifier={telemetry.macro.qualifiers.temp}
          />
          <SubCard
            icon={Droplet}
            label="Humidity"
            value={
              telemetry.macro.humidity !== null
                ? telemetry.macro.humidity.toFixed(0)
                : "—"
            }
            unit="%"
            qualifier={telemetry.macro.qualifiers.humidity}
          />
          <SubCard
            icon={Wind}
            label="Wind"
            value={
              telemetry.macro.wind !== null
                ? telemetry.macro.wind.toFixed(1)
                : "—"
            }
            unit="m/s"
            qualifier={telemetry.macro.qualifiers.wind}
          />
          <SubCard
            icon={Sun}
            label="Solar (24h peak)"
            value={
              telemetry.macro.solar !== null
                ? telemetry.macro.solar.toFixed(0)
                : "—"
            }
            unit="W/m²"
            qualifier={telemetry.macro.qualifiers.solar}
          />
        </div>
      </div>

      <div>
        <SectionLabel>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Exposure
          </span>
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard
            icon={Users}
            label="Population"
            value={telemetry.demographics.totalPopulation.toLocaleString(
              "en-IN",
            )}
          />
          <SubCard
            icon={Activity}
            label="Outdoor workers"
            value={`${(telemetry.demographics.outdoorWorkerPct * 100).toFixed(1)}%`}
          />
        </div>
      </div>

      {forecast?.days?.length ? (
        <div>
          <SectionLabel>
            <span className="flex items-center gap-1.5">
              <Sun className="h-3.5 w-3.5" /> Next 5 Days Forecast
            </span>
          </SectionLabel>
          <div
            className="flex gap-2.5 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin -mx-1 px-1"
            style={{ scrollbarWidth: "thin" }}
          >
            {forecast.days
              .slice(0, 5)
              .map(
                (
                  d: {
                    date: string;
                    risk: number;
                    category: string;
                    tempMin: number;
                    tempMax: number;
                    wbgtMax?: number;
                    heatIndexMax?: number;
                    mortality?: { index: number; band: string };
                  },
                  i: number,
                ) => (
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
                        <p className="text-[10px] text-muted-foreground">
                          Temp
                        </p>
                        <p className="text-sm font-bold tabular-nums">
                          {d.tempMax?.toFixed(0) ?? "—"}°
                          <span className="text-xs font-normal text-muted-foreground">
                            /{d.tempMin?.toFixed(0) ?? "—"}°
                          </span>
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[10px] text-muted-foreground">
                          WBGT
                        </p>
                        <p className="text-sm font-bold tabular-nums">
                          {d.wbgtMax?.toFixed(1) ?? "—"}°
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-[10px] text-muted-foreground">HI</p>
                        <p className="text-sm font-bold tabular-nums">
                          {d.heatIndexMax?.toFixed(1) ?? "—"}°
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
                ),
              )}
          </div>
        </div>
      ) : null}

      <Button
        className="w-full justify-between bg-red-600 font-semibold text-white hover:bg-red-700"
        onClick={() => {
          const a =
            alertOptions.find((x) => x.wardId === selectedId) ??
            alertOptions[0];
          if (a) onSendAlert(a.id);
        }}
      >
        Send via Ahvaan Bot <ChevronRight className="h-4 w-4" />
      </Button>

      <button
        onClick={onAnalyticsOpen}
        className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        Full analytics <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function Home() {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        dedupingInterval: 30_000,
        keepPreviousData: true,
        focusThrottleInterval: 60_000,
      }}
    >
      <HomeInner />
    </SWRConfig>
  );
}

function HomeInner() {
  const isMobile = useIsMobile();
  const reduceMotion = !!useReducedMotion();
  const shouldAnimate = !reduceMotion && !isMobile;
  const [layer, setLayer] = useState<MapLayer>("risk");
  const [filters, setFilters] = useState<{ cats: Set<string>; popMin: number }>(
    () => ({
      cats: new Set(["LOW", "MODERATE", "HIGH", "VERY_HIGH"]),
      popMin: 0,
    }),
  );
  const [controlsOpen, setControlsOpen] = useState(false);
  const { data: summary } = useSWR<Summary>("/api/wards/summary", jsonFetch);
  const { data: heatmap } = useSWR<{
    count: number;
    refreshedAt: string;
    wards: MapWard[];
  }>("/api/wards/heatmap", jsonFetch);
  const { data: alertsData } = useSWR<{
    count: number;
    alerts: Array<{
      id: number;
      wardId: number;
      ward: number | null;
      wardName: string | null;
      severity: string;
      displaySeverity: string;
      riskScore: number;
      peakWindowStart: string;
      peakWindowEnd: string;
      advisoryText: string;
    }>;
  }>("/api/alerts/active", jsonFetch);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 180);
  const deferredSearch = useDeferredValue(debouncedSearch);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAlertId, setModalAlertId] = useState<number | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const displayId = hoveredId ?? selectedId;

  // No auto-selection — page opens with no ward selected.
  // Close mobile sheet when ward deselected
  useEffect(() => {
    if (selectedId === null) setMobileExpanded(false);
  }, [selectedId]);

  const { data: telemetry } = useSWR<Telemetry>(
    displayId ? `/api/wards/${displayId}/telemetry` : null,
    jsonFetch,
  );
  const { data: forecast } = useSWR<{
    timezone: string;
    days: Array<{
      date: string;
      tempMin: number;
      tempMax: number;
      heatIndexMax: number;
      risk: number;
      category: string;
      mortality?: { index: number; band: string };
    }>;
  }>(displayId ? `/api/forecast/${displayId}?days=5` : null, jsonFetch);

  const timezone =
    telemetry?.timezone ?? forecast?.timezone ?? KOLKATA_TIMEZONE;
  const watchLabel = summary
    ? `Level ${summary.watch.level} · ${summary.watch.name}`
    : "Level …";
  const refreshedAt = summary?.refreshedAt ?? heatmap?.refreshedAt ?? null;

  const alertOptions: AlertOption[] = useMemo(
    () =>
      (alertsData?.alerts ?? []).map((a) => ({
        id: a.id,
        wardId: a.wardId,
        ward: a.ward,
        wardName: a.wardName,
        severity: a.severity,
        riskScore: a.riskScore,
        peakWindowStart: a.peakWindowStart,
        peakWindowEnd: a.peakWindowEnd,
        advisoryText: a.advisoryText,
        wbgt:
          telemetry && telemetry.wardId === a.wardId
            ? (telemetry.risk?.wbgt ?? null)
            : null,
      })),
    [alertsData, telemetry],
  );

  const cells = heatmap?.wards ?? [];
  const selectedCell = selectedId
    ? (cells.find((c) => c.wardId === selectedId) ?? null)
    : null;

  const matchCount = useMemo(() => {
    if (!deferredSearch.trim()) return null;
    const q = deferredSearch.trim().toLowerCase();
    return cells.filter(
      (c) =>
        String(c.ward ?? "").includes(q) ||
        c.wardName?.toLowerCase().includes(q) ||
        String(c.wardId).includes(q),
    ).length;
  }, [cells, deferredSearch]);

  const downloadTelemetry = useCallback(() => {
    if (!telemetry) return;
    const payload = JSON.stringify(
      { ...telemetry, forecast: forecast?.days ?? [] },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telemetry-ward-${telemetry.ward ?? telemetry.wardId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [telemetry, forecast]);

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    setHoveredId(null);
    setMobileExpanded(false);
  }, []);

  const legend = useMemo(() => {
    if (layer === "wbgt")
      return {
        title: "WBGT °C (shade)",
        colors: RISK_COLORS as unknown as string[],
        labels: ["15°", "40°"],
      };
    if (layer === "hi")
      return {
        title: "Heat Index °C",
        colors: RISK_COLORS as unknown as string[],
        labels: ["20°", "55°"],
      };
    if (layer === "thermal")
      return {
        title: "Thermal Stress",
        colors: RISK_COLORS as unknown as string[],
        labels: ["Low", "High"],
      };
    if (layer === "exposure")
      return {
        title: "Exposure",
        colors: RISK_COLORS as unknown as string[],
        labels: ["Low", "High"],
      };
    if (layer === "vulnerability")
      return {
        title: "Vulnerability",
        colors: RISK_COLORS as unknown as string[],
        labels: ["Low", "High"],
      };
    return {
      title: "Composite Risk",
      colors: [...RISK_COLORS] as string[],
      labels: ["Low", "Extreme"],
    };
  }, [layer]);

  const filteredCells = useMemo(() => {
    return cells.filter((c) => {
      if (c.category && !filters.cats.has(c.category)) return false;
      if ((c.population ?? 0) < filters.popMin) return false;
      return true;
    });
  }, [cells, filters]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <TopBar
        watchLabel={watchLabel}
        syncedAt={refreshedAt}
        syncDetail={summary ? `${summary.synced}/${summary.total}` : null}
        timezone={timezone}
        onSendAlert={() => {
          setModalAlertId(alertsData?.alerts[0]?.id ?? null);
          setModalOpen(true);
        }}
        searchQuery={search}
        onSearchChange={setSearch}
        onAnalyticsOpen={() => setAnalyticsOpen(true)}
        wards={cells.map((c) => ({
          ward: c.ward,
          wardName: c.wardName,
          wardId: c.wardId,
        }))}
        onSelectWard={(id) => handleSelect(id)}
      />

      {/* Main stage — full-bleed map, popups instead of sidebars */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Map */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">
          <div className="relative flex-1 overflow-hidden">
            {cells.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="space-y-3 text-center">
                  <Skeleton className="mx-auto h-10 w-10 rounded-full" />
                  <p className="text-sm text-muted-foreground">
                    Loading Kolkata wards…
                  </p>
                </div>
              </div>
            ) : (
              <KolkataMap
                cells={filteredCells}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={handleSelect}
                onHover={setHoveredId}
                searchQuery={deferredSearch}
                layer={layer}
              />
            )}

            <AnimatePresence>
              {matchCount !== null && (
                <motion.div
                  initial={
                    shouldAnimate ? { opacity: 0, y: -8 } : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: shouldAnimate ? 0.2 : 0.08 }}
                  className="pointer-events-none absolute left-2 top-2 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background shadow-lg sm:left-3 sm:top-3 lg:left-3 lg:top-16 will-change-transform"
                >
                  {matchCount} ward{matchCount === 1 ? "" : "s"} match
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mobile layers toggle */}
            <button
              onClick={() => setControlsOpen(true)}
              className="absolute bottom-[172px] right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border bg-card shadow-lg hover:bg-accent"
              aria-label="Open map controls"
            >
              <Layers className="h-4 w-4" />
            </button>

            {/* Category showcase — compact single bar, not 5 large cards */}
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 hidden -translate-x-1/2 lg:flex">
              {summary ? (
                <div className="flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur">
                  {[
                    { label: "Active", v: summary.active, c: "#f97316" },
                    { label: "Extreme", v: summary.extreme, c: "#991b1b" },
                    { label: "High", v: summary.high, c: "#ef4444" },
                    { label: "Moderate", v: summary.moderate, c: "#eab308" },
                  ].map((k) => (
                    <span
                      key={k.label}
                      className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: k.c }}
                      />
                      <span className="font-semibold text-muted-foreground">
                        {k.label}
                      </span>
                      <span className="font-bold tabular-nums">{k.v}</span>
                    </span>
                  ))}
                  <span className="mx-1 h-4 w-px bg-border" />
                  <span
                    className="group relative flex cursor-help items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                    title="Metropolitan Heat Load"
                  >
                    <Layers className="h-3 w-3 text-muted-foreground" />
                    <span className="font-semibold text-muted-foreground">
                      Load
                    </span>
                    <span className="font-black tabular-nums">
                      {summary.metroHeatLoad}
                    </span>
                    <span className="text-muted-foreground">/100</span>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border bg-popover p-3 text-left text-xs shadow-xl group-hover:block">
                      <span className="font-bold">Metropolitan Heat Load</span>
                      <span className="mt-1 block text-muted-foreground">
                        Mean risk across {summary.total} wards.
                      </span>
                    </span>
                  </span>
                </div>
              ) : (
                <Skeleton className="h-8 w-[420px] rounded-full" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ward popup — centered, replaces right drawer */}
      <WardPopup
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        wardId={selectedId}
        ward={selectedCell?.ward ?? telemetry?.ward ?? null}
        wardName={telemetry?.wardName ?? selectedCell?.wardName ?? null}
        selectedCell={selectedCell}
        telemetry={telemetry ?? null}
        forecast={forecast}
        alertOptions={alertOptions}
        onSendAlert={(id) => {
          setModalAlertId(id);
          setModalOpen(true);
        }}
        onAnalyticsOpen={() => setAnalyticsOpen(true)}
        onDownload={downloadTelemetry}
      >
        {telemetry ? (
          <WardDetailBody
            telemetry={telemetry}
            forecast={forecast}
            selectedCell={selectedCell}
            alertOptions={alertOptions}
            selectedId={selectedId}
            onSendAlert={(id) => {
              setModalAlertId(id);
              setModalOpen(true);
            }}
            onAnalyticsOpen={() => setAnalyticsOpen(true)}
          />
        ) : (
          <div className="space-y-3 p-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </WardPopup>

      {/* Controls popup */}
      <ControlsPopup
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        layer={layer}
        onLayerChange={setLayer}
        filters={filters}
        onFilterChange={setFilters}
      />

      <SendAlertModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        alerts={alertOptions}
        defaultAlertId={modalAlertId}
        timezone={timezone}
        telemetry={telemetry ?? null}
        outlook={(forecast?.days ?? []).map((d) => ({
          date: d.date,
          tempMax: d.tempMax,
          risk: d.risk,
          category: d.category,
        }))}
      />
      <AnalyticsModal
        open={analyticsOpen}
        onClose={() => setAnalyticsOpen(false)}
        summary={
          summary
            ? {
                active: summary.active,
                extreme: summary.extreme,
                high: summary.high,
                moderate: summary.moderate,
                wards: summary.wards,
                metroHeatLoad: summary.metroHeatLoad,
              }
            : null
        }
        wards={cells}
        selectedWardId={selectedId}
        selectedWard={selectedCell?.ward ?? null}
      />
    </div>
  );
}
