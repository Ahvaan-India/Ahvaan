"use client";

import { useEffect, useMemo, useState, useCallback, useDeferredValue } from "react";
import useSWR, { SWRConfig } from "swr";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  X,
  MapPin,
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
  Download,
  ChevronUp,
  GripHorizontal,
} from "lucide-react";
import { TopBar } from "@/components/console/TopBar";
import { KolkataMap, type MapWard } from "@/components/map/KolkataMap";
import { RiskBadge } from "@/components/console/RiskBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SubCard } from "@/components/console/SubCard";
import { SendAlertModal, type AlertOption } from "@/components/console/SendAlertModal";
import type { Telemetry } from "@/components/console/TelemetryPanel";
import { computeMortalityIndex } from "@/lib/heatshield/mortality";
import { getWardDisplayName, getWardLocality } from "@/lib/geo/wardNames";
import { KOLKATA_TIMEZONE } from "@/lib/geo/timezone";
import { useIsMobile } from "@/lib/hooks/useMobile";

const AnalyticsModal = dynamic(() => import("@/components/console/AnalyticsModal").then((m) => m.AnalyticsModal), {
  ssr: false,
  loading: () => null,
});

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
  forecast: { days: Array<{ date: string; risk: number; category: string }> } | undefined;
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
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risk</p>
            <p className="text-3xl font-black tabular-nums">{telemetry.risk ? telemetry.risk.value.toFixed(3) : "—"}</p>
            <p className="text-xs font-medium text-muted-foreground">{telemetry.risk?.displayCategory ?? ""}</p>
          </CardContent>
        </Card>
        {(() => {
          const r = telemetry.risk;
          if (!r) return null;
          const mort = computeMortalityIndex({ heatIndex: r.heatIndex, nighttimeRecovery: r.recovery, persistence: r.persistence, vulnerability: r.vulnerability });
          return (
            <Card>
              <CardContent className="p-3">
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <HeartPulse className="h-3 w-3" /> Mortality
                </p>
                <p className="text-3xl font-black tabular-nums">{mort.index}<span className="text-base font-semibold text-muted-foreground">/100</span></p>
                <p className="text-xs text-muted-foreground">{mort.band}</p>
              </CardContent>
            </Card>
          );
        })()}
      </div>

      <div>
        <SectionLabel>Microclimate</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard icon={Thermometer} label="Temp" value={telemetry.macro.temp !== null ? telemetry.macro.temp.toFixed(1) : "—"} unit="°C" qualifier={telemetry.macro.qualifiers.temp} />
          <SubCard icon={Droplet} label="Humidity" value={telemetry.macro.humidity !== null ? telemetry.macro.humidity.toFixed(0) : "—"} unit="%" qualifier={telemetry.macro.qualifiers.humidity} />
          <SubCard icon={Wind} label="Wind" value={telemetry.macro.wind !== null ? telemetry.macro.wind.toFixed(1) : "—"} unit="m/s" qualifier={telemetry.macro.qualifiers.wind} />
          <SubCard icon={Sun} label="Solar" value={telemetry.macro.solar !== null ? telemetry.macro.solar.toFixed(0) : "—"} unit="W/m²" qualifier={telemetry.macro.qualifiers.solar} />
        </div>
      </div>

      <div>
        <SectionLabel>Exposure</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SubCard icon={Users} label="Population" value={telemetry.demographics.totalPopulation.toLocaleString("en-IN")} />
          <SubCard icon={Activity} label="Outdoor workers" value={`${(telemetry.demographics.outdoorWorkerPct * 100).toFixed(1)}%`} />
        </div>
      </div>

      {forecast?.days?.length ? (
        <div>
          <SectionLabel>5-day outlook</SectionLabel>
          <div className="grid grid-cols-5 gap-1.5">
            {forecast.days.map((d: { date: string; risk: number; category: string }, i: number) => (
              <div key={d.date} className={`rounded-lg border p-2 text-center ${i === 0 ? "border-primary bg-primary/5" : "bg-muted/40"}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{d.date.slice(5)}</p>
                <p className="text-sm font-black tabular-nums">{(d.risk * 100).toFixed(0)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Button
        className="w-full justify-between bg-red-600 font-semibold text-white hover:bg-red-700"
        onClick={() => { const a = alertOptions.find((x) => x.wardId === selectedId) ?? alertOptions[0]; if (a) onSendAlert(a.id); }}
      >
        Send via Ahvaan Bot <ChevronRight className="h-4 w-4" />
      </Button>

      <button onClick={onAnalyticsOpen} className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline">
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
  const { data: summary } = useSWR<Summary>("/api/wards/summary", jsonFetch);
  const { data: heatmap } = useSWR<{ count: number; refreshedAt: string; wards: MapWard[] }>(
    "/api/wards/heatmap",
    jsonFetch,
  );
  const { data: alertsData } = useSWR<{ count: number; alerts: Array<{ id: number; wardId: number; ward: number | null; wardName: string | null; severity: string; displaySeverity: string; riskScore: number; peakWindowStart: string; peakWindowEnd: string; advisoryText: string }> }>(
    "/api/alerts/active",
    jsonFetch,
  );

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
  useEffect(() => { if (selectedId === null) setMobileExpanded(false); }, [selectedId]);

  const { data: telemetry } = useSWR<Telemetry>(
    displayId ? `/api/wards/${displayId}/telemetry` : null,
    jsonFetch,
  );
  const { data: forecast } = useSWR<{
    timezone: string;
    days: Array<{ date: string; tempMin: number; tempMax: number; heatIndexMax: number; risk: number; category: string; mortality?: { index: number; band: string } }>;
  }>(displayId ? `/api/forecast/${displayId}?days=5` : null, jsonFetch);

  const timezone = telemetry?.timezone ?? forecast?.timezone ?? KOLKATA_TIMEZONE;
  const watchLabel = summary ? `Level ${summary.watch.level} · ${summary.watch.name}` : "Level …";
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
        wbgt: telemetry && telemetry.wardId === a.wardId ? telemetry.risk?.wbgt ?? null : null,
      })),
    [alertsData, telemetry],
  );

  const cells = heatmap?.wards ?? [];
  const selectedCell = selectedId ? cells.find((c) => c.wardId === selectedId) ?? null : null;

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
    const payload = JSON.stringify({ ...telemetry, forecast: forecast?.days ?? [] }, null, 2);
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

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <TopBar
        watchLabel={watchLabel}
        syncedAt={refreshedAt}
        syncDetail={summary ? `${summary.synced}/${summary.total}` : null}
        timezone={timezone}
        onSendAlert={() => { setModalAlertId(alertsData?.alerts[0]?.id ?? null); setModalOpen(true); }}
        searchQuery={search}
        onSearchChange={setSearch}
        onAnalyticsOpen={() => setAnalyticsOpen(true)}
        wards={cells.map((c) => ({ ward: c.ward, wardName: c.wardName, wardId: c.wardId }))}
        onSelectWard={(id) => handleSelect(id)}
      />

      {/* Main stage */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Map */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">
          <div className="relative flex-1 overflow-hidden">
            {cells.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="space-y-3 text-center">
                  <Skeleton className="mx-auto h-10 w-10 rounded-full" />
                  <p className="text-sm text-muted-foreground">Loading Kolkata wards…</p>
                </div>
              </div>
            ) : (
              <KolkataMap
                cells={cells}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={handleSelect}
                onHover={setHoveredId}
                searchQuery={deferredSearch}
              />
            )}

            <AnimatePresence>
              {matchCount !== null && (
                <motion.div
                  initial={shouldAnimate ? { opacity: 0, y: -8 } : { opacity: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: shouldAnimate ? 0.2 : 0.08 }}
                  className="pointer-events-none absolute left-2 top-2 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background shadow-lg sm:left-3 sm:top-3 lg:left-3 lg:top-16 will-change-transform"
                >
                  {matchCount} ward{matchCount === 1 ? "" : "s"} match
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating KPIs — desktop only */}
            <div
              className="pointer-events-none absolute left-3 right-3 top-3 z-10 hidden gap-2 lg:flex"
              style={{ willChange: shouldAnimate ? "transform, opacity" : undefined }}
            >
              {shouldAnimate ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.3, ease: "easeOut" }}
                  className="flex w-full gap-2"
                >
                  {summary ? (
                    <>
                      {[
                        { label: "Active", v: summary.active, c: "#f97316" },
                        { label: "Extreme", v: summary.extreme, c: "#991b1b" },
                        { label: "High", v: summary.high, c: "#ef4444" },
                        { label: "Moderate", v: summary.moderate, c: "#eab308" },
                      ].map((k) => (
                        <div key={k.label} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: k.c }} />
                          <span className="text-xs font-semibold text-muted-foreground">{k.label}</span>
                          <span className="ml-auto text-lg font-black tabular-nums">{k.v}</span>
                        </div>
                      ))}
                      <div className="group relative flex items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 shadow-lg backdrop-blur cursor-help pointer-events-auto" title="Metropolitan Heat Load — city-wide heat load (0 low → 100 extreme)">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground">Load</span>
                        <span className="text-lg font-black tabular-nums">{summary.metroHeatLoad}</span>
                        <span className="text-xs text-muted-foreground">/100</span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border bg-popover p-3 text-xs shadow-xl group-hover:block">
                          <p className="font-bold">Metropolitan Heat Load</p>
                          <p className="mt-1 text-muted-foreground">City-wide heat load — mean risk across all {summary.total} wards.</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <Skeleton className="h-12 w-full rounded-xl" />
                  )}
                </motion.div>
              ) : (
                <div className="flex w-full gap-2">
                  {summary ? (
                    <>
                      {[
                        { label: "Active", v: summary.active, c: "#f97316" },
                        { label: "Extreme", v: summary.extreme, c: "#991b1b" },
                        { label: "High", v: summary.high, c: "#ef4444" },
                        { label: "Moderate", v: summary.moderate, c: "#eab308" },
                      ].map((k) => (
                        <div key={k.label} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: k.c }} />
                          <span className="text-xs font-semibold text-muted-foreground">{k.label}</span>
                          <span className="ml-auto text-lg font-black tabular-nums">{k.v}</span>
                        </div>
                      ))}
                      <div className="group relative flex items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 shadow-lg backdrop-blur cursor-help pointer-events-auto" title="Metropolitan Heat Load — city-wide heat load (0 low → 100 extreme)">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground">Load</span>
                        <span className="text-lg font-black tabular-nums">{summary.metroHeatLoad}</span>
                        <span className="text-xs text-muted-foreground">/100</span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border bg-popover p-3 text-xs shadow-xl group-hover:block">
                          <p className="font-bold">Metropolitan Heat Load</p>
                          <p className="mt-1 text-muted-foreground">City-wide heat load — mean risk across all {summary.total} wards.</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <Skeleton className="h-12 w-full rounded-xl" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mobile bottom sheet — summary or ward peek */}
          <div className="border-t bg-card lg:hidden">
            {selectedId && telemetry ? (
              <button
                onClick={() => setMobileExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    Ward {telemetry.ward ?? selectedId} · {telemetry.risk?.displayCategory ?? ""}
                  </p>
                  <p className="truncate text-xs tabular-nums text-muted-foreground">
                    Risk {telemetry.risk ? telemetry.risk.value.toFixed(3) : "—"} · WBGT {telemetry.risk?.wbgt.toFixed(1) ?? "—"}°C
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs font-medium text-primary sm:inline">Details</span>
                  <ChevronUp className={`h-4 w-4 text-muted-foreground transition-transform ${mobileExpanded ? "rotate-180" : ""}`} />
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2 p-3 text-center">
                {(summary ? [
                  { l: "Active", v: summary.active },
                  { l: "Extreme", v: summary.extreme },
                  { l: "High", v: summary.high },
                  { l: "Load", v: `${summary.metroHeatLoad}/100` },
                ] : Array.from({ length: 4 }).map((_, i) => ({ l: `—`, v: "…" }))).map((k, i) => (
                  <div
                    key={`${k.l}-${i}-${String(k.v)}`}
                    className={`rounded-xl border bg-muted/40 p-2.5 ${k.l === "Load" ? "group relative cursor-help" : ""}`}
                    title={k.l === "Load" && summary ? `Metropolitan Heat Load — city-wide heat load` : undefined}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-1">
                      {k.l} {k.l === "Load" && <span className="text-[9px]">ⓘ</span>}
                    </p>
                    <p className="font-black tabular-nums">{k.v as string | number}</p>
                    {k.l === "Load" && summary && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border bg-popover p-3 text-left text-xs shadow-xl group-hover:block group-focus-within:block">
                        <p className="font-bold">Metropolitan Heat Load</p>
                        <p className="mt-1 text-muted-foreground">City-wide heat load.</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mobile expanded ward details — bottom sheet content */}
          <AnimatePresence>
            {mobileExpanded && selectedId && telemetry && (
              <motion.div
                initial={shouldAnimate ? { y: 20, opacity: 0 } : { opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={shouldAnimate ? { y: 20, opacity: 0 } : { opacity: 0 }}
                transition={shouldAnimate ? { type: "spring", stiffness: 380, damping: 28 } : { duration: 0.15 }}
                className="overflow-hidden border-t bg-card will-change-transform lg:hidden"
              >
                <div className="max-h-[55vh] overflow-y-auto overscroll-contain">
                  <div className="flex items-center justify-center py-2">
                    <GripHorizontal className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                  <WardDetailBody
                    telemetry={telemetry}
                    forecast={forecast}
                    selectedCell={selectedCell}
                    alertOptions={alertOptions}
                    selectedId={selectedId}
                    onSendAlert={(id) => { setModalAlertId(id); setModalOpen(true); }}
                    onAnalyticsOpen={() => setAnalyticsOpen(true)}
                  />
                  <div className="border-t bg-muted/20 px-4 py-2 text-center text-xs text-muted-foreground">
                    <button onClick={() => setMobileExpanded(false)} className="font-medium text-primary">Collapse</button>
                    <span className="mx-2">·</span>
                    {telemetry.macro.timestamp ? new Date(telemetry.macro.timestamp).toLocaleString("en-IN", { timeZone: timezone }) : ""} · {timezone}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Desktop right drawer — ward details */}
        <AnimatePresence mode="wait">
          {selectedId && (
            <motion.aside
              key={selectedId}
              initial={shouldAnimate ? { x: 420, opacity: 0 } : { opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={shouldAnimate ? { x: 420, opacity: 0 } : { opacity: 0 }}
              transition={shouldAnimate ? { type: "spring", stiffness: 380, damping: 32 } : { duration: 0.18 }}
              className="relative z-20 hidden w-[400px] shrink-0 flex-col overflow-hidden border-l bg-card shadow-xl lg:flex xl:w-[420px]"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-card p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-extrabold tracking-tight">
                      {telemetry?.ward !== null && telemetry?.ward !== undefined
                        ? `Ward ${telemetry?.ward}`
                        : selectedCell?.ward !== null
                          ? `Ward ${selectedCell?.ward}`
                          : `Location ${selectedId}`}
                    </h2>
                    {telemetry?.risk && <RiskBadge category={telemetry.risk.category} />}
                  </div>
                  {telemetry?.wardName && <p className="truncate text-xs text-muted-foreground">{telemetry.wardName}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {selectedCell ? `${selectedCell.riskScore !== null ? `Risk ${selectedCell.riskScore.toFixed(3)}` : "Risk —"} · ` : ""}
                    {telemetry?.risk ? `WBGT ${telemetry.risk.wbgt.toFixed(1)}°C` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={downloadTelemetry} aria-label="Download telemetry JSON" className="h-8 w-8">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} aria-label="Close panel" className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">
                {!telemetry ? (
                  <div className="space-y-3 p-4">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : (
                  <WardDetailBody
                    telemetry={telemetry}
                    forecast={forecast}
                    selectedCell={selectedCell}
                    alertOptions={alertOptions}
                    selectedId={selectedId}
                    onSendAlert={(id) => { setModalAlertId(id); setModalOpen(true); }}
                    onAnalyticsOpen={() => setAnalyticsOpen(true)}
                  />
                )}
              </div>

              <div className="shrink-0 border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                {telemetry?.macro.timestamp ? new Date(telemetry.macro.timestamp).toLocaleString("en-IN", { timeZone: timezone }) : ""} · {timezone}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <SendAlertModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        alerts={alertOptions}
        defaultAlertId={modalAlertId}
        timezone={timezone}
        telemetry={telemetry ?? null}
        outlook={(forecast?.days ?? []).map((d) => ({ date: d.date, tempMax: d.tempMax, risk: d.risk, category: d.category }))}
      />
      <AnalyticsModal
        open={analyticsOpen}
        onClose={() => setAnalyticsOpen(false)}
        summary={summary ? { active: summary.active, extreme: summary.extreme, high: summary.high, moderate: summary.moderate, wards: summary.wards, metroHeatLoad: summary.metroHeatLoad } : null}
        wards={cells}
        selectedWardId={selectedId}
        selectedWard={selectedCell?.ward ?? null}
      />
    </div>
  );
}
