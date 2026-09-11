"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { motion, useReducedMotion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RISK_COLORS } from "@/components/map/KolkataMap";
import { useIsMobile } from "@/lib/hooks/useMobile";
import {
  AXIS_TICK,
  xLabel,
  yLabel,
  domain100,
  domainRaw,
  ceilNice,
  dataBins,
} from "@/lib/chartAxis";
import { ChartTooltip } from "@/components/console/ChartTooltip";
import useSWR from "swr";

const BAR_CURSOR = { fill: "hsl(var(--muted))", fillOpacity: 0.35 };
const fmtInt = (v: any) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.round(v).toLocaleString("en-IN")
    : String(v);

const jsonFetchTrend = (u: string) =>
  fetch(u).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });

interface Props {
  summary: {
    active: number;
    extreme: number;
    high: number;
    moderate: number;
    wards: number;
    metroHeatLoad: number;
  } | null;
  wards: Array<{
    ward: number | null;
    wardId: number;
    riskScore: number | null;
    category: string | null;
    wbgt: number | null;
    heatIndex?: number | null;
    population: number | null;
    exposure?: number | null;
    vulnerability?: number | null;
    thermal?: number | null;
  }>;
}

export function AnalyticsView({ summary, wards }: Props) {
  const isMobile = useIsMobile();
  const prefersReduced = useReducedMotion();
  const reduceMotion = !!prefersReduced;
  const chartAnim = !reduceMotion && !isMobile;
  const valid = wards.filter((w) => w.riskScore !== null) as Array<{
    ward: number | null;
    wardId: number;
    riskScore: number;
    category: string;
    wbgt: number | null;
    population: number | null;
    exposure: number | null;
    vulnerability: number | null;
    thermal: number | null;
  }>;

  const byCat = [
    {
      name: "Low",
      value: valid.filter((w) => w.category === "LOW").length,
      color: RISK_COLORS[0],
    },
    {
      name: "Moderate",
      value: valid.filter((w) => w.category === "MODERATE").length,
      color: RISK_COLORS[1],
    },
    {
      name: "High",
      value: valid.filter((w) => w.category === "HIGH").length,
      color: RISK_COLORS[2],
    },
    {
      name: "Extreme",
      value: valid.filter((w) => w.category === "VERY_HIGH").length,
      color: RISK_COLORS[4],
    },
  ];

  // NOTE: no top-wards bar chart here — the overview page already covers
  // that with its "Most critical wards" card (tap → map).

  const scatter = valid.slice(0, 60).map((w) => ({
    pop: w.population ?? 0,
    risk: +(w.riskScore * 100).toFixed(1),
    label: w.ward ?? w.wardId,
  }));

  const hist = Array.from({ length: 10 }, (_, i) => {
    const lo = i / 10,
      hi = (i + 1) / 10;
    return {
      bucket: `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}`,
      count: valid.filter(
        (w) => w.riskScore >= lo && w.riskScore < hi + (i === 9 ? 0.001 : 0),
      ).length,
    };
  });

  // Data-driven extents so axes fit the data (not fixed full ranges).
  const risk100 = valid.map((w) => w.riskScore * 100);
  const riskDom = domain100(risk100);
  const popMax = ceilNice(Math.max(0, ...valid.map((w) => w.population ?? 0)));
  const expVals = valid.map((w) => (w.exposure ?? 0) * 100);
  const vulnVals = valid.map((w) => (w.vulnerability ?? 0) * 100);
  const expDom = domain100(expVals);
  const vulnDom = domain100(vulnVals);
  const hiBins = dataBins(
    (wards as any[]).map((w: any) => w.heatIndex),
    6,
  );
  const wbgtBins = dataBins(
    valid.map((w) => w.wbgt),
    6,
  );
  const wbgtLine = [...valid]
    .sort((a, b) => a.riskScore - b.riskScore)
    .slice(0, 50)
    .map((w) => ({
      r: +(w.riskScore * 100).toFixed(1),
      wbgt: w.wbgt ?? 0,
    }));
  const wbgtLineX = domain100(wbgtLine.map((d) => d.r));
  const wbgtLineY = domainRaw(wbgtLine.map((d) => d.wbgt));

  const Wrapper: React.ElementType = reduceMotion ? "div" : motion.div;
  const wrapperProps = reduceMotion
    ? {}
    : {
        initial: "hidden" as const,
        animate: "show" as const,
        variants: {
          hidden: {},
          show: { transition: { staggerChildren: 0.07 } },
        },
      };

  const Item: React.ElementType = reduceMotion ? "div" : motion.div;
  const itemProps = reduceMotion
    ? {}
    : {
        variants: {
          hidden: { opacity: 0, y: 10 },
          show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
        },
      };

  return (
    <Wrapper {...wrapperProps} className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {summary
            ? `${summary.wards} wards · Load ${summary.metroHeatLoad}/100 · Risk & exposure breakdown`
            : "Loading…"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Item {...itemProps} className="min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Risk category share</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] w-full min-w-0 p-2 sm:p-6">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCat}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={isMobile ? 64 : 88}
                    isAnimationActive={chartAnim}
                    label={({ name, value }) => `${name} ${value}`}
                  >
                    {byCat.map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    animationDuration={0}
                    content={
                      <ChartTooltip
                        fields={[{ key: "value", label: "Wards" }]}
                        unit=" wards"
                      />
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Item>

        <Item {...itemProps} className="min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Risk histogram (0–100)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] w-full min-w-0 p-2 sm:p-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hist}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="bucket"
                    tick={AXIS_TICK}
                    interval="preserveStartEnd"
                    minTickGap={16}
                    height={48}
                    label={xLabel("Risk score (0–100)")}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    width={44}
                    allowDecimals={false}
                    label={yLabel("Wards")}
                  />
                  <Tooltip
                    animationDuration={0}
                    cursor={BAR_CURSOR}
                    content={
                      <ChartTooltip
                        fields={[{ key: "count", label: "Wards" }]}
                        unit=" wards"
                      />
                    }
                  />
                  <Bar
                    dataKey="count"
                    fill="#f97316"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={chartAnim}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Item>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Item {...itemProps} className="min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Population vs heat risk
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[320px] w-full min-w-0 p-2 sm:p-6">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ left: 8, right: 12, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    type="number"
                    dataKey="pop"
                    name="Population"
                    domain={[0, popMax]}
                    tick={AXIS_TICK}
                    tickCount={6}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    height={48}
                    label={xLabel("Population (wards)")}
                  />
                  <YAxis
                    type="number"
                    dataKey="risk"
                    name="Risk"
                    domain={riskDom}
                    tick={AXIS_TICK}
                    tickCount={5}
                    width={48}
                    label={yLabel("Risk score (0–100)")}
                  />
                  <Tooltip
                    animationDuration={0}
                    cursor={{ strokeDasharray: "3 3" }}
                    content={
                      <ChartTooltip
                        fields={[
                          { key: "pop", label: "Population", format: fmtInt },
                          { key: "risk", label: "Risk score", unit: "/100" },
                        ]}
                        title={(_l, d) => `Ward ${d.label ?? ""}`}
                      />
                    }
                  />
                  <Scatter
                    data={scatter}
                    fill="#f97316"
                    isAnimationActive={chartAnim}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Item>
      </div>

      <Item {...itemProps} className="min-w-0">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              WBGT vs risk (wards sorted by risk)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] w-full min-w-0 p-2 sm:p-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={wbgtLine}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="r"
                  type="number"
                  domain={wbgtLineX}
                  tick={AXIS_TICK}
                  tickCount={6}
                  height={48}
                  label={xLabel("Risk score (0–100)")}
                />
                <YAxis
                  domain={wbgtLineY}
                  tick={AXIS_TICK}
                  tickCount={5}
                  width={48}
                  label={yLabel("WBGT (°C)")}
                />
                <Tooltip
                  animationDuration={0}
                  content={
                    <ChartTooltip
                      fields={[{ key: "wbgt", label: "WBGT", unit: " °C" }]}
                      title={(l) => `Risk ${l}/100`}
                    />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="wbgt"
                  name="WBGT °C"
                  dot={false}
                  stroke="#ef4444"
                  strokeWidth={2}
                  isAnimationActive={chartAnim}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Item>

      {/* New: City load trend (7d) + Exposure vs Vulnerability */}
      <CityTrend />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Item {...itemProps} className="min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Exposure vs Vulnerability (wards)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[320px] w-full min-w-0 p-2 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ left: 8, right: 12, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    type="number"
                    dataKey="exp"
                    name="Exposure"
                    domain={expDom}
                    tick={AXIS_TICK}
                    tickCount={6}
                    height={48}
                    label={xLabel("Exposure (0–100)")}
                  />
                  <YAxis
                    type="number"
                    dataKey="vuln"
                    name="Vulnerability"
                    domain={vulnDom}
                    tick={AXIS_TICK}
                    tickCount={5}
                    width={52}
                    label={yLabel("Vulnerability (0–100)")}
                  />
                  <Tooltip
                    animationDuration={0}
                    cursor={{ strokeDasharray: "3 3" }}
                    content={
                      <ChartTooltip
                        title={null}
                        fields={[
                          { key: "exp", label: "Exposure", unit: "/100" },
                          { key: "vuln", label: "Vulnerability", unit: "/100" },
                        ]}
                      />
                    }
                  />
                  <Scatter
                    data={valid
                      .slice(0, 80)
                      .map((w) => ({
                        exp:
                          w.exposure != null
                            ? +(w.exposure * 100).toFixed(1)
                            : 0,
                        vuln:
                          w.vulnerability != null
                            ? +(w.vulnerability * 100).toFixed(1)
                            : 0,
                      }))}
                    fill="#0ea5e9"
                    isAnimationActive={chartAnim}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Item>
        <Item {...itemProps} className="min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Ward thermal distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[320px] w-full min-w-0 p-2 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={Array.from({ length: 10 }, (_, i) => {
                    const lo = i / 10,
                      hi = (i + 1) / 10;
                    return {
                      bucket: `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}`,
                      count: valid.filter(
                        (w) =>
                          (w.thermal ?? 0) >= lo &&
                          (w.thermal ?? 0) < hi + (i === 9 ? 0.001 : 0),
                      ).length,
                    };
                  })}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="bucket"
                    tick={AXIS_TICK}
                    interval="preserveStartEnd"
                    minTickGap={16}
                    height={48}
                    label={xLabel("Thermal stress (0–100)")}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    width={44}
                    allowDecimals={false}
                    label={yLabel("Wards")}
                  />
                  <Tooltip
                    animationDuration={0}
                    cursor={BAR_CURSOR}
                    content={
                      <ChartTooltip
                        fields={[{ key: "count", label: "Wards" }]}
                        unit=" wards"
                      />
                    }
                  />
                  <Bar
                    dataKey="count"
                    fill="#06b6d4"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={chartAnim}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Item>
      </div>

      {/* All parameters - heat index, WBGT, etc. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Item {...itemProps} className="min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Heat Index (°C) distribution</CardTitle></CardHeader>
            <CardContent className="h-[240px] w-full min-w-0 p-2 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hiBins}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="bucket"
                    tick={AXIS_TICK}
                    interval="preserveStartEnd"
                    minTickGap={12}
                    height={48}
                    label={xLabel("Heat index (°C)")}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    width={40}
                    allowDecimals={false}
                    label={yLabel("Wards")}
                  />
                  <Tooltip
                    animationDuration={0}
                    cursor={BAR_CURSOR}
                    content={
                      <ChartTooltip
                        fields={[{ key: "count", label: "Wards" }]}
                        unit=" wards"
                      />
                    }
                  />
                  <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} isAnimationActive={chartAnim} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Item>
        <Item {...itemProps} className="min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="text-sm">WBGT (°C) distribution</CardTitle></CardHeader>
            <CardContent className="h-[240px] w-full min-w-0 p-2 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wbgtBins}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="bucket"
                    tick={AXIS_TICK}
                    interval="preserveStartEnd"
                    minTickGap={12}
                    height={48}
                    label={xLabel("WBGT (°C)")}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    width={40}
                    allowDecimals={false}
                    label={yLabel("Wards")}
                  />
                  <Tooltip
                    animationDuration={0}
                    cursor={BAR_CURSOR}
                    content={
                      <ChartTooltip
                        fields={[{ key: "count", label: "Wards" }]}
                        unit=" wards"
                      />
                    }
                  />
                  <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={chartAnim} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Item>
        <Item {...itemProps} className="min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Vulnerability distribution</CardTitle></CardHeader>
            <CardContent className="h-[240px] w-full min-w-0 p-2 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={Array.from({ length: 10 }, (_, i) => {
                  const lo = i / 10, hi = (i + 1) / 10;
                  return { bucket: `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}`, count: valid.filter((w) => (w.vulnerability ?? 0) >= lo && (w.vulnerability ?? 0) < hi + (i === 9 ? 0.001 : 0)).length };
                })}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="bucket"
                    tick={AXIS_TICK}
                    interval="preserveStartEnd"
                    minTickGap={12}
                    height={48}
                    label={xLabel("Vulnerability (0–100)")}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    width={40}
                    allowDecimals={false}
                    label={yLabel("Wards")}
                  />
                  <Tooltip
                    animationDuration={0}
                    cursor={BAR_CURSOR}
                    content={
                      <ChartTooltip
                        fields={[{ key: "count", label: "Wards" }]}
                        unit=" wards"
                      />
                    }
                  />
                  <Bar dataKey="count" fill="#a855f7" radius={[4, 4, 0, 0]} isAnimationActive={chartAnim} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Item>
      </div>

      {/* All parameters table */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2"><CardTitle className="text-base">All parameters - ward table (141 wards)</CardTitle></CardHeader>
        <CardContent className="max-h-[380px] overflow-auto p-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left">
                <th className="p-2">Ward</th>
                <th className="p-2">Risk</th>
                <th className="p-2">WBGT</th>
                <th className="p-2">HI</th>
                <th className="p-2">Thermal</th>
                <th className="p-2">Exposure</th>
                <th className="p-2">Vuln</th>
                <th className="p-2">Pop</th>
              </tr>
            </thead>
            <tbody>
              {valid.slice(0, 50).map((w) => (
                <tr key={w.wardId} className="border-b hover:bg-muted/40">
                  <td className="p-2 font-medium">W{w.ward}</td>
                  <td className="p-2 tabular-nums">{(w.riskScore * 100).toFixed(1)}</td>
                  <td className="p-2 tabular-nums">{w.wbgt?.toFixed(1) ?? "-"}</td>
                  <td className="p-2 tabular-nums">{(w as any).heatIndex?.toFixed(1) ?? "-"}</td>
                  <td className="p-2 tabular-nums">{(w.thermal! * 100).toFixed(0)}</td>
                  <td className="p-2 tabular-nums">{(w.exposure! * 100).toFixed(0)}</td>
                  <td className="p-2 tabular-nums">{(w.vulnerability! * 100).toFixed(0)}</td>
                  <td className="p-2 tabular-nums">{w.population?.toLocaleString("en-IN") ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </Wrapper>
  );
}

function CityTrend() {
  const { data } = useSWR<{ days: Array<{ date: string; avgRisk: number }> }>(
    "/api/wards/trend?days=7",
    jsonFetchTrend,
  );
  const days = data?.days ?? [];
  if (days.length < 2) return null;
  const pts = days.map((d) => ({
    d: d.date.slice(5),
    risk: +(d.avgRisk * 100).toFixed(1),
  }));
  return (
    <div className="min-w-0">
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            City mean risk last 7 days
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[260px] w-full min-w-0 p-2 sm:p-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pts}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis
                dataKey="d"
                tick={AXIS_TICK}
                interval="preserveStartEnd"
                minTickGap={16}
                height={48}
                label={xLabel("Date")}
              />
              <YAxis
                domain={domainRaw(pts.map((p) => p.risk))}
                tick={AXIS_TICK}
                tickCount={5}
                width={48}
                label={yLabel("Mean risk (0–100)")}
              />
              <Tooltip
                animationDuration={0}
                content={<ChartTooltip unit="/100" />}
              />
              <Line
                type="monotone"
                dataKey="risk"
                name="Mean risk"
                dot
                stroke="#f97316"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
