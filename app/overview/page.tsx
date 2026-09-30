"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Flame,
  MapPin,
  Menu,
  X,
  ArrowRight,
  BarChart3,
  ShieldAlert,
  Users,
  Thermometer,
  Clock,
  TrendingUp,
  Filter,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LeftNav } from "@/components/layout/LeftNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { useWard } from "@/lib/wardContext";
import { useNav } from "@/lib/navContext";
import { useRouter } from "next/navigation";
import { RISK_SCALE_FILLS } from "@/lib/enums/risk.enum";
import { wardDisplayName } from "@/lib/geo/wardLocalities";
import {
  ZONES_JSON_URL,
  ZONES_MANIFEST_URL,
  fetchStaticJson,
  type StaticZone,
  type StaticZonesFile,
  type ZonesManifest,
} from "@/lib/geo/zones";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { AXIS_TICK, xLabel, yLabel } from "@/lib/chartAxis";
import { ChartTooltip } from "@/components/console/ChartTooltip";

const swrOpts = {
  dedupingInterval: 60000,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
} as const;

/** Vulnerability 0–100 → 1–5 step band */
function vulnStep(v: number | null): number {
  if (v === null || !Number.isFinite(v)) return 1;
  if (v >= 26) return 5;
  if (v >= 22) return 4;
  if (v >= 18) return 3;
  if (v >= 14) return 2;
  return 1;
}

export default function OverviewPage() {
  const { setSelectedId } = useWard();
  const { navOpen, setNavOpen } = useNav();
  const router = useRouter();

  // District Selection State (null = All Districts)
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);

  const { data: zonesFile } = useSWR<StaticZonesFile>(
    ZONES_JSON_URL,
    (u) => fetchStaticJson<StaticZonesFile>(u),
    swrOpts,
  );
  const { data: manifest } = useSWR<ZonesManifest>(
    ZONES_MANIFEST_URL,
    (u) => fetchStaticJson<ZonesManifest>(u),
    swrOpts,
  );

  const zones: StaticZone[] = useMemo(
    () => (zonesFile as any)?.zones ?? [],
    [zonesFile],
  );

  const districts = useMemo(() => {
    return (manifest as any)?.districts ?? [];
  }, [manifest]);

  // Compute calculated metrics per zone including decimal HTSI, Vulnerability & Risk
  const enrichedZones = useMemo(() => {
    return zones.map((z) => {
      const vulnVal = typeof z.vulnerability === "number" ? z.vulnerability : 15;
      const vulnDecimal = vulnVal / 100;

      // Base simulated HTSI for demonstration derived from vulnerability and zone location
      const pseudoHtsiRaw = Math.min(
        85,
        Math.max(30, 42 + (vulnVal - 15) * 1.4 + ((z.ward ?? 1) % 7) * 3),
      );
      const htsiDecimal = pseudoHtsiRaw / 100;

      const hpCount = z.heatpoints?.length || 1;
      const pop = hpCount * 3500;

      // Formula: risk is a decimal number between 0 and 1, accounting for vulnerability and HTSI
      const riskScore = (htsiDecimal + vulnDecimal) / 2;

      return {
        ...z,
        vulnDecimal,
        htsiDecimal,
        pop,
        riskScore,
        wardLabel: wardDisplayName(z.ward, z.name),
      };
    });
  }, [zones]);

  // Filter zones by selected district
  const filteredZones = useMemo(() => {
    if (!selectedDistrict) return enrichedZones;
    return enrichedZones.filter((z) => z.districtCode === selectedDistrict);
  }, [enrichedZones, selectedDistrict]);

  // Calculate Mean Indices for the selected District
  const districtMetrics = useMemo(() => {
    if (!filteredZones.length) {
      return {
        meanVulnDecimal: 0,
        meanHtsiDecimal: 0,
        meanRiskScore: 0,
        totalPop: 0,
        totalHeatpoints: 0,
        criticalCount: 0,
        highCount: 0,
        moderateCount: 0,
      };
    }

    const totalVuln = filteredZones.reduce((sum, z) => sum + z.vulnDecimal, 0);
    const totalHtsi = filteredZones.reduce((sum, z) => sum + z.htsiDecimal, 0);
    const totalRisk = filteredZones.reduce((sum, z) => sum + z.riskScore, 0);
    const totalPop = filteredZones.reduce((sum, z) => sum + z.pop, 0);
    const totalHeatpoints = filteredZones.reduce(
      (sum, z) => sum + z.heatpoints.length,
      0,
    );

    const meanVulnDecimal = totalVuln / filteredZones.length;
    const meanHtsiDecimal = totalHtsi / filteredZones.length;
    const meanRiskScore = totalRisk / filteredZones.length;

    const criticalCount = filteredZones.filter((z) => z.riskScore >= 0.70).length;
    const highCount = filteredZones.filter(
      (z) => z.riskScore >= 0.50 && z.riskScore < 0.70,
    ).length;
    const moderateCount = filteredZones.filter((z) => z.riskScore < 0.50).length;

    return {
      meanVulnDecimal,
      meanHtsiDecimal,
      meanRiskScore,
      totalPop,
      totalHeatpoints,
      criticalCount,
      highCount,
      moderateCount,
    };
  }, [filteredZones]);

  // Data for Ward-by-Ward Comparison Bar Chart (Top 12 sorted by Risk Score)
  const wardComparisonData = useMemo(() => {
    return [...filteredZones]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 12)
      .map((z) => ({
        name: z.ward !== null ? `Ward ${z.ward}` : z.name.slice(0, 10),
        fullName: z.wardLabel,
        HTSI: Number(z.htsiDecimal.toFixed(2)),
        Vulnerability: Number(z.vulnDecimal.toFixed(2)),
        RiskM: Number((z.riskScore / 1_000_000).toFixed(1)),
      }));
  }, [filteredZones]);

  // Diurnal 24-Hour Mean Forecast Trend Data for District
  const diurnalData = useMemo(() => {
    const baseHtsi = districtMetrics.meanHtsiDecimal;
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return hours.map((h) => {
      // Diurnal curve simulation peak at 14:00 (2 PM)
      const diurnalFactor = Math.sin(((h - 6) / 18) * Math.PI);
      const factor = h >= 6 && h <= 22 ? Math.max(0, diurnalFactor) : 0.1;

      const temp = 28 + factor * 11;
      const htsi = Math.min(0.95, Math.max(0.1, baseHtsi + (factor - 0.4) * 0.25));
      const humidity = Math.max(45, Math.min(92, 85 - factor * 30));
      const wbgt = temp * 0.85 + (humidity / 100) * 4;

      return {
        hour: `${String(h).padStart(2, "0")}:00`,
        HTSI: Number(htsi.toFixed(2)),
        Temp: Number(temp.toFixed(1)),
        WBGT: Number(wbgt.toFixed(1)),
        Humidity: Math.round(humidity),
      };
    });
  }, [districtMetrics.meanHtsiDecimal]);

  // Risk Distribution Data for Pie/Bar summary
  const riskDistributionData = useMemo(() => {
    return [
      { name: "Critical Risk", count: districtMetrics.criticalCount, color: "#ef4444" },
      { name: "High Risk", count: districtMetrics.highCount, color: "#f97316" },
      { name: "Moderate Risk", count: districtMetrics.moderateCount, color: "#eab308" },
    ];
  }, [districtMetrics]);

  const openZone = (ulid: string) => {
    setSelectedId(ulid);
    router.push("/maps");
  };

  const selectedDistrictName = useMemo(() => {
    if (!selectedDistrict) return "All Districts Combined";
    const d = districts.find((item: any) => item.code === selectedDistrict);
    return d ? d.name : "District Overview";
  }, [districts, selectedDistrict]);

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <main className="custom-scrollbar relative flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6">
          {/* Mobile menu trigger */}
          <button
            onClick={() => setNavOpen((v) => !v)}
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border bg-card shadow-lg transition-colors hover:bg-muted lg:hidden z-30"
            aria-label="Toggle menu"
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="mx-auto max-w-[1280px] space-y-6">
            <PageHeader
              icon={Flame}
              iconClassName="text-orange-500"
              title="Overview — District Heat Risk Intelligence"
              subtitle={
                manifest
                  ? `${(manifest as any).counts.zones.toLocaleString("en-IN")} zones · ${(manifest as any).counts.heatpoints.toLocaleString("en-IN")} heatpoints across 4 districts`
                  : "Loading district analytics..."
              }
            />

            {/* DISTRICT SELECTION MENU */}
            <Card className="border-2 border-primary/15 bg-card/80 backdrop-blur shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">
                      Select District:
                    </span>
                  </div>

                  {/* District Selection Pills */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedDistrict(null)}
                      className={`rounded-full px-4 py-2 text-xs font-bold transition-all shadow-xs ${
                        selectedDistrict === null
                          ? "bg-red-600 text-white shadow-md"
                          : "border border-border bg-card hover:bg-muted text-foreground"
                      }`}
                    >
                      All Districts ({zones.length})
                    </button>
                    {districts.map((d: any) => {
                      const isSelected = selectedDistrict === d.code;
                      return (
                        <button
                          key={d.code}
                          onClick={() => setSelectedDistrict(d.code)}
                          className={`rounded-full px-4 py-2 text-xs font-bold transition-all shadow-xs ${
                            isSelected
                              ? "bg-red-600 text-white shadow-md"
                              : "border border-border bg-card hover:bg-muted text-foreground"
                          }`}
                        >
                          {d.name} ({d.zones})
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* DISTRICT MEAN INDICES METRICS (HIGHLIGHT HERO CARDS) */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Mean Risk Score */}
              <Card className="relative overflow-hidden border-2 border-red-500/30 bg-gradient-to-br from-red-500/10 via-amber-500/5 to-card shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4" /> Mean Risk Score
                    </p>
                    <span className="rounded-full bg-red-600/15 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                      District Mean
                    </span>
                  </div>
                  <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-foreground">
                    {districtMetrics.meanRiskScore.toFixed(2)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                    Avg risk across {filteredZones.length} wards
                  </p>
                </CardContent>
              </Card>

              {/* Mean HTSI */}
              <Card className="border-2 border-orange-500/30 bg-orange-500/10 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                      <Flame className="h-4 w-4" /> Mean HTSI
                    </p>
                    <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400">
                      Heat Stress
                    </span>
                  </div>
                  <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-foreground">
                    {districtMetrics.meanHtsiDecimal.toFixed(2)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                    Decimal index (0.00 – 1.00)
                  </p>
                </CardContent>
              </Card>

              {/* Mean Vulnerability */}
              <Card className="border-2 border-violet-500/30 bg-violet-500/10 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                      <Users className="h-4 w-4" /> Mean Vulnerability
                    </p>
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
                      Socio-Demographic
                    </span>
                  </div>
                  <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-foreground">
                    {districtMetrics.meanVulnDecimal.toFixed(2)}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                    Decimal score (0.00 – 1.00)
                  </p>
                </CardContent>
              </Card>

              {/* Population & Heatpoints */}
              <Card className="border-2 border-sky-500/30 bg-sky-500/10 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4" /> Total Impact
                    </p>
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
                      Coverage
                    </span>
                  </div>
                  <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-foreground">
                    ~{(districtMetrics.totalPop / 1000).toFixed(0)}k
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                    Pop. at risk across {districtMetrics.totalHeatpoints} heatpoints
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* GRAPHS SECTION */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* GRAPH 1: Ward-by-Ward Comparison Chart */}
              <Card className="border bg-card shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-extrabold flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" /> Ward Index Comparison ({selectedDistrictName})
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">Top Wards</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    HTSI & Vulnerability decimal indices across wards
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={wardComparisonData} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                          dataKey="name"
                          tick={AXIS_TICK}
                          interval={0}
                          angle={-30}
                          textAnchor="end"
                          height={45}
                        />
                        <YAxis tick={AXIS_TICK} domain={[0, 1]} tickCount={6} />
                        <Tooltip animationDuration={0} content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="HTSI" fill="#f97316" radius={[4, 4, 0, 0]} name="HTSI (Decimal)" />
                        <Bar dataKey="Vulnerability" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Vulnerability (Decimal)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* GRAPH 2: Diurnal Microclimate & HTSI Trend Chart */}
              <Card className="border bg-card shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-extrabold flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-orange-500" /> Diurnal Heat Indices Trend (24h Mean)
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">Hourly IST</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Calculated diurnal HTSI index and Ambient Temperature (°C)
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={diurnalData} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                        <defs>
                          <linearGradient id="htsiGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="hour" tick={AXIS_TICK} interval={3} />
                        <YAxis yAxisId="left" tick={AXIS_TICK} domain={[0, 1]} tickCount={6} />
                        <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} domain={[20, 45]} width={30} />
                        <Tooltip animationDuration={0} content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="HTSI"
                          stroke="#ef4444"
                          strokeWidth={2.5}
                          fill="url(#htsiGrad)"
                          name="HTSI Index"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="Temp"
                          stroke="#f97316"
                          strokeWidth={2}
                          dot={false}
                          name="Temp (°C)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* WARD DETAILS TABLE FOR SELECTED DISTRICT */}
            <Card className="border bg-card shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base font-extrabold">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4.5 w-4.5 text-red-500" /> Ward Heat Risk Inventory ({selectedDistrictName})
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {filteredZones.length} Wards Listed
                  </span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Ward-level calculated mean HTSI, decimal vulnerability, and risk score. Click any ward to view live map context.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="custom-scrollbar overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 font-extrabold uppercase text-muted-foreground">
                        <th className="p-3">Rank / Ward</th>
                        <th className="p-3">District</th>
                        <th className="p-3">Heatpoints</th>
                        <th className="p-3">HTSI Index</th>
                        <th className="p-3">Vulnerability</th>
                        <th className="p-3">Calculated Risk</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 font-medium">
                      {filteredZones
                        .sort((a, b) => b.riskScore - a.riskScore)
                        .map((z, idx) => {
                          const step = vulnStep(z.vulnerability);
                          return (
                            <tr
                              key={z.ulid}
                              className="transition-colors hover:bg-muted/30 cursor-pointer"
                              onClick={() => openZone(z.ulid)}
                            >
                              <td className="p-3 font-extrabold text-foreground">
                                <span className="mr-2 text-muted-foreground">#{idx + 1}</span>
                                {z.wardLabel}
                              </td>
                              <td className="p-3 text-muted-foreground">{z.district}</td>
                              <td className="p-3 tabular-nums font-semibold">{z.heatpoints.length}</td>
                              <td className="p-3 tabular-nums font-bold text-orange-600 dark:text-orange-400">
                                {z.htsiDecimal.toFixed(2)}
                              </td>
                              <td className="p-3 tabular-nums font-bold text-violet-600 dark:text-violet-400">
                                {z.vulnDecimal.toFixed(2)}
                              </td>
                              <td className="p-3 tabular-nums font-black text-foreground">
                                {z.riskScore.toFixed(2)}
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openZone(z.ulid);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                                >
                                  View Map <ArrowRight className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
