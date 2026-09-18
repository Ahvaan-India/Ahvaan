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

  if (!wardId) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
        <p className="font-semibold">No ward selected</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap a ward on the Kolkata map to see its 14-day history + 5-day
          forecast, thermal trend, and how it compares to the city mean.
        </p>
      </div>
    );
  }

  const hist = trend?.history ?? [];
  const fc = forecast?.days ?? [];
  const hasHist = hist.length > 1;
  const latest = hist[hist.length - 1] ?? null;

  // 14-day stats from real history (replaces placeholder radar values).
  const risks = hist.map((h) => h.risk * 100);
  const avgRisk = risks.length
    ? risks.reduce((s, v) => s + v, 0) / risks.length
    : 0;
  const worst = hist.reduce(
    (m, h) => (h.risk > (m?.risk ?? -1) ? h : m),
    null as (typeof hist)[number] | null,
  );
  const highDays = hist.filter((h) => h.risk >= 0.5).length;
  const highPct = hist.length ? (highDays / hist.length) * 100 : 0;
  const delta3 =
    hist.length >= 4
      ? (hist[hist.length - 1].risk - hist[hist.length - 4].risk) * 100
      : 0;
  const trendDir = delta3 > 1 ? "up" : delta3 < -1 ? "down" : "flat";
  const maxFc = fc.length ? Math.max(...fc.map((f) => f.risk * 100)) : 0;
  const radarData = latest
    ? [
        { subject: "Thermal", value: +(latest.thermal * 100).toFixed(1) },
        {
          subject: "WBGT",
          value: latest.wbgt
            ? +Math.min(100, ((latest.wbgt - 15) / 25) * 100).toFixed(1)
            : 0,
        },
        { subject: "Persistence", value: +highPct.toFixed(1) },
        { subject: "Avg risk", value: +avgRisk.toFixed(1) },
        { subject: "Peak Fc", value: +maxFc.toFixed(1) },
      ]
    : [];
  const timelineRisks = [
    ...hist.map((h) => h.risk * 100),
    ...fc.map((f) => f.risk * 100),
  ];
  const timelineDom = domain100(timelineRisks);
  const thermalDom = domain100(hist.map((h) => h.thermal * 100));
  const wbgtDom = domainRaw(hist.map((h) => h.wbgt));
  const fcDom: [number, number] = [
    0,
    ceilNice(Math.max(0, ...fc.map((f) => f.risk * 100))),
  ];
  const latestDelta =
    latest && cityMean != null
      ? latest.risk * 100 - cityMean
      : null;

  // ---- Precomputed engine (showcase): hourly curves + peak analytics ----
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-extrabold tracking-tight">
          {getWardDisplayName(ward, null)} - Deep Analysis
        </h3>
        <p className="text-sm text-muted-foreground">
          {hist.length} model days · {fc.length} forecast days · {engineDays.length > 0 ? `${engineDays.reduce((s: number, d: any) => s + (d.hours ?? 0), 0)} engine hours · ` : ""}{latest ? `latest risk ${(latest.risk * 100).toFixed(1)}/100` : "no history yet"} · tap another ward to switch
        </p>
      </div>

      {/* 14-day stat tiles */}
      {hist.length > 0 && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SubCard
            icon={Activity}
            label="Avg risk · 14d"
            value={avgRisk.toFixed(1)}
            unit="/100"
          />
          <SubCard
            icon={Flame}
            label="Worst day"
            value={worst ? (worst.risk * 100).toFixed(0) : "-"}
            unit="/100"
            qualifier={worst ? worst.date.slice(5) : null}
            qualifierTone="high"
          />
          <SubCard
            icon={CalendarDays}
            label="Days High+"
            value={`${highDays}/${hist.length}`}
            qualifier={`${highPct.toFixed(0)}% of days`}
            qualifierTone={highPct >= 50 ? "extreme" : highPct >= 25 ? "high" : "moderate"}
          />
          <SubCard
            icon={trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus}
            label="3-day trend"
            value={`${delta3 >= 0 ? "+" : ""}${delta3.toFixed(1)}`}
            unit="pts"
            qualifier={trendDir === "up" ? "Rising" : trendDir === "down" ? "Falling" : "Steady"}
            qualifierTone={trendDir === "up" ? "high" : trendDir === "down" ? "low" : "moderate"}
          />
        </div>
      )}

      {/* Daily risk stripe: past 14d + next 5d at a glance.
          One column per day — color is the risk category, labels name the
          date, the ring marks the worst day, "Now" splits observed/forecast. */}
      {(hist.length > 0 || fc.length > 0) && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily risk stripe — history + outlook</CardTitle>
            <p className="text-xs text-muted-foreground">
              Solid blocks are observed days, faded blocks are the 5-day
              forecast. The ringed block is the worst day.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-1">
              {hist.map((h, i) => {
                const isWorst = worst != null && h.date === worst.date;
                return (
                  <div
                    key={`h-${h.date}`}
                    className="min-w-0 flex-1"
                    title={`${h.date}: risk ${(h.risk * 100).toFixed(0)}/100 (${h.category})${isWorst ? " — worst day" : ""}`}
                  >
                    <div
                      className={cn(
                        "h-10 w-full cursor-help rounded",
                        isWorst && "ring-2 ring-foreground",
                      )}
                      style={{ background: riskFillForCategory(h.category) }}
                    />
                    <p
                      className={cn(
                        "mt-1 text-center text-[9px] tabular-nums text-muted-foreground",
                        i % 2 === 1 && "hidden min-[480px]:block",
                      )}
                    >
                      {h.date.slice(5)}
                    </p>
                  </div>
                );
              })}
              {hist.length > 0 && fc.length > 0 && (
                <div className="flex shrink-0 flex-col items-center" aria-hidden>
                  <div className="h-10 w-px bg-foreground/50" />
                  <p className="mt-1 text-[9px] font-black uppercase tracking-wide">
                    Now
                  </p>
                </div>
              )}
              {fc.map((f, i) => (
                <div
                  key={`f-${f.date}`}
                  className="min-w-0 flex-1"
                  title={`Forecast ${f.date}: risk ${(f.risk * 100).toFixed(0)}/100 (${f.category})`}
                >
                  <div
                    className="h-10 w-full cursor-help rounded opacity-50 ring-1 ring-inset ring-foreground/30"
                    style={{ background: riskFillForCategory(f.category) }}
                  />
                  <p
                    className={cn(
                      "mt-1 text-center text-[9px] tabular-nums text-muted-foreground",
                      (hist.length + i) % 2 === 1 && "hidden min-[480px]:block",
                    )}
                  >
                    {f.date.slice(5)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span className="tabular-nums">
                {hist.length ? hist[0].date.slice(5) : ""}
                {hist.length && fc.length ? " → " : ""}
                {fc.length
                  ? fc[fc.length - 1].date.slice(5)
                  : hist.length
                    ? hist[hist.length - 1].date.slice(5)
                    : ""}
              </span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-foreground/60" />
                  Observed
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-foreground/30 ring-1 ring-inset ring-foreground/40" />
                  Forecast
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Ward risk timeline past 14d + next 5d forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] w-full min-w-0 p-2 sm:p-4">
          {!hasHist && !fc.length ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[
                  ...hist.map((h) => ({
                    label: h.date.slice(5),
                    risk: +(h.risk * 100).toFixed(1),
                    type: "history" as const,
                  })),
                  ...fc.map((f) => ({
                    label: f.date.slice(5),
                    risk: +(f.risk * 100).toFixed(1),
                    type: "forecast" as const,
                  })),
                ]}
                margin={{ left: 8, right: 12, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  interval="preserveStartEnd"
                  minTickGap={20}
                  height={48}
                  label={xLabel("Date")}
                />
                <YAxis
                  domain={timelineDom}
                  tick={AXIS_TICK}
                  tickCount={5}
                  width={48}
                  label={yLabel("Risk score (0–100)")}
                />
                <Tooltip
                  animationDuration={0}
                  content={<ChartTooltip />}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="risk"
                  name="Risk (0–100)"
                  dot={false}
                  stroke="#ef4444"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Thermal & WBGT history</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] w-full min-w-0 p-2 sm:p-4">
            {hist.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={hist.map((h) => ({
                    d: h.date.slice(5),
                    thermal: +(h.thermal * 100).toFixed(1),
                    wbgt: h.wbgt,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="d"
                    tick={AXIS_TICK}
                    interval="preserveStartEnd"
                    minTickGap={20}
                    height={48}
                    label={xLabel("Date")}
                  />
                  <YAxis
                    yAxisId="left"
                    domain={thermalDom}
                    tick={AXIS_TICK}
                    tickCount={5}
                    width={48}
                    label={yLabel("Thermal (0–100)")}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={wbgtDom}
                    tick={AXIS_TICK}
                    tickCount={5}
                    width={44}
                    label={yLabel("WBGT (°C)")}
                  />
                  <Tooltip
                    animationDuration={0}
                    content={<ChartTooltip />}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="thermal"
                    name="Thermal (0–100)"
                    dot={false}
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="wbgt"
                    name="WBGT °C"
                    dot={false}
                    stroke="#f97316"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ward vs city</CardTitle>
          </CardHeader>
          <CardContent className="flex h-[260px] flex-col justify-center gap-3 p-4">
            {hist.length === 0 ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    This ward (latest)
                  </span>
                  <span className="text-2xl font-black tabular-nums">
                    {(hist[hist.length - 1].risk * 100).toFixed(1)}
                  </span>
                </div>
                {cityMean != null && (
                  <div className="flex items-baseline justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <span className="text-sm text-muted-foreground">
                      City mean (now)
                    </span>
                    <span className="text-sm font-bold tabular-nums">
                      {cityMean.toFixed(1)}{" "}
                      <span className={latestDelta != null && latestDelta > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                        ({latestDelta != null && latestDelta >= 0 ? "+" : ""}{latestDelta?.toFixed(1)})
                      </span>
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {hist.slice(-5).map((h) => (
                    <Badge
                      key={h.date}
                      variant="secondary"
                      className="tabular-nums"
                    >
                      {h.date.slice(5)} {(h.risk * 100).toFixed(0)}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Forecast next 5d:{" "}
                  {fc
                    .map(
                      (f) => `${f.date.slice(5)} ${(f.risk * 100).toFixed(0)}`,
                    )
                    .join(" · ") || ""}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2"><CardTitle className="text-base">Risk components - latest</CardTitle></CardHeader>
          <CardContent className="h-[260px] w-full min-w-0 p-2 sm:p-4">
            {latest ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar dataKey="value" name="Score" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} isAnimationActive={false} />
                  <Tooltip
                    animationDuration={0}
                    content={<ChartTooltip unit="/100" />}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : <Skeleton className="h-full w-full" />}
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="pb-2"><CardTitle className="text-base">5-day forecast - risk bars</CardTitle></CardHeader>
          <CardContent className="h-[260px] w-full min-w-0 p-2 sm:p-4">
            {fc.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fc.map((f) => ({ date: f.date.slice(5), risk: +(f.risk * 100).toFixed(1), category: f.category }))}>
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
                    label={yLabel("Risk score (0–100)")}
                  />
                  <Tooltip
                    animationDuration={0}
                    cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.35 }}
                    content={
                      <ChartTooltip
                        fields={[{ key: "risk", label: "Risk score" }]}
                        unit="/100"
                      />
                    }
                  />
                  <Bar dataKey="risk" radius={[6, 6, 0, 0]} isAnimationActive={false}>
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
            value={enginePeaks.htsi ? enginePeaks.htsi.v.toFixed(0) : "-"}
            unit="/100"
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
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Today, hour by hour — temp, WBGT, heat index</CardTitle>
            <p className="text-xs text-muted-foreground">
              Precomputed engine values for {todayEngine?.forecastDate} (IST). HTSI rows predate this ward&apos;s engine run where missing.
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
    </div>
  );
}
