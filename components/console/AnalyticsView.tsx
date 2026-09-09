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
import useSWR from "swr";

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

  const top10 = [...valid]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10)
    .map((w) => ({
      label: w.ward !== null ? `W${w.ward}` : `${w.wardId}`,
      risk: +(w.riskScore * 100).toFixed(1),
    }));

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
                  <Tooltip />
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
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-20}
                    dy={10}
                    height={40}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={30} />
                  <Tooltip />
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Item {...itemProps} className="min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top 10 hottest wards</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px] w-full min-w-0 p-2 sm:p-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={top10}
                  layout="vertical"
                  margin={{ left: 30, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    width={36}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="risk"
                    fill="#ef4444"
                    radius={[0, 6, 6, 0]}
                    isAnimationActive={chartAnim}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Item>

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
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <YAxis
                    type="number"
                    dataKey="risk"
                    name="Risk"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    width={40}
                  />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
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
              <LineChart
                data={[...valid]
                  .sort((a, b) => a.riskScore - b.riskScore)
                  .slice(0, 50)
                  .map((w) => ({
                    r: +(w.riskScore * 100).toFixed(1),
                    wbgt: w.wbgt ?? 0,
                  }))}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="r"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "Risk →",
                    position: "insideBottom",
                    offset: -4,
                    fontSize: 11,
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip />
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
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "Exposure →",
                      position: "insideBottom",
                      offset: -4,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="vuln"
                    name="Vulnerability"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    width={40}
                  />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
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
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-20}
                    dy={10}
                    height={40}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={30} />
                  <Tooltip />
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
            <LineChart
              data={days.map((d) => ({
                d: d.date.slice(5),
                risk: +(d.avgRisk * 100).toFixed(1),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="d" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
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
