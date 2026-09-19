"use client";

import { useMemo } from "react";
import useSWR from "swr";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { SubCard } from "@/components/console/SubCard";
import { AccuracyComparison } from "@/components/console/AccuracyComparison";
import { getWardDisplayName } from "@/lib/geo/wardNames";
import { riskFillForCategory } from "@/lib/risk";
import { ChartTooltip } from "@/components/console/ChartTooltip";
import { cn } from "@/lib/utils";
import {
  AXIS_TICK,
  xLabel,
  yLabel,
  domain100,
  domainRaw,
  ceilNice,
} from "@/lib/chartAxis";
import {
  Activity,
  Flame,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Minus,
  Thermometer,
  Clock,
  MapPin,
  Users,
} from "lucide-react";

const jsonFetch = (u: string) =>
  fetch(u).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });

export function WardAnalysis({
  wardId,
  ward,
  cityMean,
}: {
  wardId: number | null;
  ward: number | null;
  cityMean?: number | null;
}) {
  const { data: trend } = useSWR<{
    wardId: number;
    history: Array<{
      date: string;
      risk: number;
      category: string;
      thermal: number;
      wbgt: number;
    }>;
  }>(wardId ? `/api/wards/${wardId}/trend?days=14` : null, jsonFetch);
  const { data: forecast } = useSWR<{
    days: Array<{
      date: string;
      risk: number;
      category: string;
      wbgtMax: number;
    }>;
  }>(wardId ? `/api/forecast/${wardId}?days=5` : null, jsonFetch);
  const { data: showcase } = useSWR<any>(
    wardId ? `/api/showcase/${wardId}` : null,
    jsonFetch,
  );
  const { data: telemetry } = useSWR<any>(
    wardId ? `/api/wards/${wardId}/telemetry` : null,
    jsonFetch,
  );

  if (!wardId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MapPin className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-base font-extrabold text-foreground">No Ward Selected</h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
          Please select a ward from the Kolkata map or search dropdown above to view its 14-day history, microclimate curves, 5-day forecast, and demographic analytics.
        </p>
      </div>
    );
  }

  const hist = trend?.history ?? [];
  const fc = forecast?.days ?? [];
  const engineDays: any[] = showcase?.days ?? [];
  const todayEngine = engineDays[0] ?? null;
  const todayHourly: any[] = todayEngine?.hourly ?? [];
  const enginePeaks = useMemo(() => {
    let wbgt = { v: -Infinity as number, when: "" };
    let hi = { v: -Infinity as number, when: "" };
    let htsi = { v: -Infinity as number, when: "" };
    let hotHours = 0;
    for (const d of engineDays) {
      for (const h of d.hourly ?? []) {
        const when = `${d.forecastDate.slice(5)} ${h.hour.slice(0, 5)}`;
        if (typeof h.wbgt === "number" && h.wbgt > wbgt.v) wbgt = { v: h.wbgt, when };
        if (typeof h.hi === "number" && h.hi > hi.v) hi = { v: h.hi, when };
        if (typeof h.htsi === "number" && h.htsi > htsi.v) htsi = { v: h.htsi, when };
        if (typeof h.temp === "number" && h.temp >= 35) hotHours += 1;
      }
    }
    return {
      wbgt: wbgt.v > -Infinity ? wbgt : null,
      hi: hi.v > -Infinity ? hi : null,
      htsi: htsi.v > -Infinity ? htsi : null,
      hotHours,
    };
  }, [engineDays]);

  const sixDayBars = engineDays.map((d: any) => ({
    date: d.forecastDate.slice(5),
    wbgt: d.summary?.wbgtMax ?? null,
    hi: d.summary?.heatIndexMax ?? null,
    htsi: d.summary?.htsiMax ?? null,
  }));
  const hourlyDom = domainRaw(
    todayHourly.flatMap((h: any) => [h.temp, h.wbgt, h.hi].filter((v: any) => typeof v === "number")),
  );

  const fcDom: [number, number] = [
    0,
    ceilNice(Math.max(0, ...fc.map((f) => (f.risk > 10 ? f.risk : f.risk * 10)))),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-extrabold tracking-tight">
          {getWardDisplayName(ward, null)} - Deep Analysis
        </h3>
        <p className="text-sm text-muted-foreground">
          {hist.length} model days · {fc.length} forecast days · {engineDays.length > 0 ? `${engineDays.reduce((s: number, d: any) => s + (d.hours ?? 0), 0)} engine hours` : ""} · tap another ward to switch
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2"><CardTitle className="text-base">5-day forecast - HTSI bars</CardTitle></CardHeader>
          <CardContent className="h-[260px] w-full min-w-0 p-2 sm:p-4">
            {fc.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fc.map((f) => ({ date: f.date.slice(5), htsi: +(f.risk > 10 ? f.risk : f.risk * 10).toFixed(2), category: f.category }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="date"
                    tick={AXIS_TICK}
                    interval="preserveStartEnd"
                    height={48}
                    label={xLabel("Date")}
                  />
                  <YAxis
                    domain={fcDom}
                    tick={AXIS_TICK}
                    tickCount={5}
                    width={48}
                    label={yLabel("HTSI Index")}
                  />
                  <Tooltip
                    animationDuration={0}
                    cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.35 }}
                    content={
                      <ChartTooltip
                        fields={[{ key: "htsi", label: "HTSI Index" }]}
                      />
                    }
                  />
                  <Bar dataKey="htsi" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                    {fc.map((f) => (
                      <Cell key={f.date} fill={riskFillForCategory(f.category)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Skeleton className="h-full w-full" />}
          </CardContent>
        </Card>
      </div>

      {/* Precomputed engine: peak tiles from 6 days of hourly values */}
      {engineDays.length > 0 && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SubCard
            icon={Flame}
            label="Peak WBGT · 6d"
            value={enginePeaks.wbgt ? enginePeaks.wbgt.v.toFixed(1) : "-"}
            unit="°C"
            qualifier={enginePeaks.wbgt ? enginePeaks.wbgt.when : null}
            qualifierTone="high"
          />
          <SubCard
            icon={Thermometer}
            label="Peak Heat Idx · 6d"
            value={enginePeaks.hi ? enginePeaks.hi.v.toFixed(1) : "-"}
            unit="°C"
            qualifier={enginePeaks.hi ? enginePeaks.hi.when : null}
            qualifierTone="high"
          />
          <SubCard
            icon={Activity}
            label="Peak HTSI · 6d"
            value={enginePeaks.htsi ? enginePeaks.htsi.v.toFixed(2) : "-"}
            qualifier={enginePeaks.htsi ? enginePeaks.htsi.when : "predates HTSI rows"}
            qualifierTone={enginePeaks.htsi ? "extreme" : "moderate"}
          />
          <SubCard
            icon={Clock}
            label="Hours ≥35°C · 6d"
            value={String(enginePeaks.hotHours)}
            unit="hrs"
            qualifier={enginePeaks.hotHours >= 24 ? "Prolonged heat" : enginePeaks.hotHours > 0 ? "Heat spells" : "None"}
            qualifierTone={enginePeaks.hotHours >= 24 ? "extreme" : enginePeaks.hotHours > 0 ? "high" : "low"}
          />
        </div>
      )}

      {/* Precomputed engine: today's hourly curves (weather-app style) */}
      {todayHourly.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Today, hour by hour — Temp, WBGT, Heat Index</CardTitle>
              <p className="text-xs text-muted-foreground">
                Precomputed engine values for {todayEngine?.forecastDate} (IST).
              </p>
            </CardHeader>
            <CardContent className="h-[280px] w-full min-w-0 p-2 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={todayHourly.map((h: any) => ({
                    label: h.hour.slice(0, 5),
                    temp: h.temp,
                    wbgt: h.wbgt,
                    hi: h.hi,
                  }))}
                  margin={{ left: 8, right: 12, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="label" tick={AXIS_TICK} interval={2} minTickGap={16} height={48} label={xLabel("Hour (IST)")} />
                  <YAxis domain={hourlyDom} tick={AXIS_TICK} tickCount={5} width={48} label={yLabel("°C")} />
                  <Tooltip animationDuration={0} content={<ChartTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="temp" name="Temp °C" dot={false} stroke="#f97316" strokeWidth={2} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="wbgt" name="WBGT °C" dot={false} stroke="#0ea5e9" strokeWidth={2} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="hi" name="Heat idx °C" dot={false} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Humidity & Dew Point dynamics (24 hours)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Ambient moisture vs. dew point & temperature.
              </p>
            </CardHeader>
            <CardContent className="h-[280px] w-full min-w-0 p-2 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={todayHourly.map((h: any) => ({
                    label: h.hour.slice(0, 5),
                    humidity: h.humidity ?? h.input?.relativeHumidity2m,
                    dewPoint: h.dewPoint ?? h.input?.dewPoint2m,
                    temp: h.temp,
                  }))}
                  margin={{ left: 8, right: 12, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="label" tick={AXIS_TICK} interval={2} minTickGap={16} height={48} label={xLabel("Hour (IST)")} />
                  <YAxis yAxisId="left" domain={["auto", "auto"]} tick={AXIS_TICK} tickCount={5} width={40} label={yLabel("°C")} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={AXIS_TICK} tickCount={5} width={40} label={yLabel("%")} />
                  <Tooltip animationDuration={0} content={<ChartTooltip />} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="temp" name="Air Temp °C" dot={false} stroke="#f97316" strokeWidth={2} isAnimationActive={false} connectNulls />
                  <Line yAxisId="left" type="monotone" dataKey="dewPoint" name="Dew Point °C" dot={false} stroke="#3b82f6" strokeWidth={2} strokeDasharray="3 3" isAnimationActive={false} connectNulls />
                  <Line yAxisId="right" type="monotone" dataKey="humidity" name="Humidity %" dot={false} stroke="#06b6d4" strokeWidth={2} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ward Population & Demographic Vulnerability */}
      {telemetry?.demographics && (
        <Card className="overflow-hidden border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-blue-500" /> Population & Heat Exposure Composition
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Census population distribution and vulnerable demographic groups for Ward {ward ?? wardId}.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 sm:p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SubCard
                icon={Users}
                label="Total Population"
                value={telemetry.demographics.totalPopulation?.toLocaleString("en-IN") ?? "-"}
                tooltip="Estimated total census population for this ward."
              />
              <SubCard
                icon={Users}
                label="Outdoor Workers"
                value={telemetry.demographics.outdoorWorkerPct ? `${(telemetry.demographics.outdoorWorkerPct * 100).toFixed(0)}%` : "-"}
                tooltip="Proportion of outdoor/construction/vended heat-exposed workers."
              />
              <SubCard
                icon={Users}
                label="Elderly (60+)"
                value={telemetry.demographics.elderlyPct ? `${(telemetry.demographics.elderlyPct * 100).toFixed(0)}%` : "-"}
                tooltip="Senior citizens vulnerable during peak heat events."
              />
              <SubCard
                icon={Users}
                label="Children (0–6)"
                value={telemetry.demographics.childrenPct ? `${(telemetry.demographics.childrenPct * 100).toFixed(0)}%` : "-"}
                tooltip="Young children vulnerable to rapid thermal stress."
              />
            </div>
            <div className="h-[180px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Elderly (60+)", count: Math.round((telemetry.demographics.totalPopulation ?? 0) * (telemetry.demographics.elderlyPct ?? 0)) },
                    { name: "Children (0-6)", count: Math.round((telemetry.demographics.totalPopulation ?? 0) * (telemetry.demographics.childrenPct ?? 0)) },
                    { name: "Outdoor Workers", count: Math.round((telemetry.demographics.totalPopulation ?? 0) * (telemetry.demographics.outdoorWorkerPct ?? 0)) },
                    { name: "General Pop", count: Math.max(0, (telemetry.demographics.totalPopulation ?? 0) - Math.round((telemetry.demographics.totalPopulation ?? 0) * ((telemetry.demographics.elderlyPct ?? 0) + (telemetry.demographics.childrenPct ?? 0)))) },
                  ]}
                  layout="vertical"
                  margin={{ left: 24, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => `${Math.round(v / 1000)}k`} label={xLabel("Population Count")} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip animationDuration={0} content={<ChartTooltip unit=" people" />} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Precomputed engine: 6-day daily peaks */}
      {sixDayBars.length > 1 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily peaks — WBGT vs heat index (6 days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] w-full min-w-0 p-2 sm:p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sixDayBars}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={AXIS_TICK} interval="preserveStartEnd" height={48} label={xLabel("Date")} />
                <YAxis domain={domainRaw(sixDayBars.flatMap((d: any) => [d.wbgt, d.hi]))} tick={AXIS_TICK} tickCount={5} width={48} label={yLabel("°C")} />
                <Tooltip animationDuration={0} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.35 }} content={<ChartTooltip unit="°C" />} />
                <Legend />
                <Bar dataKey="wbgt" name="WBGT max °C" fill="#0ea5e9" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="hi" name="Heat idx max °C" fill="#ef4444" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Index Accuracy & Cross-Model Reference Validation */}
      <AccuracyComparison
        wardId={ward ?? wardId}
        latitude={telemetry?.latitude}
        longitude={telemetry?.longitude}
        wbgt={enginePeaks?.wbgt?.v ?? 30.5}
        hi={enginePeaks?.hi?.v ?? 37.2}
        date={todayEngine?.forecastDate}
      />
    </div>
  );
}
