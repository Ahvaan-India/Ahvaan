"use client";

import useSWR from "swr";
import { motion } from "framer-motion";
import { Flame, Droplet, Wind, Sun, Users, Activity, HeartPulse, MapPin, Bell, TrendingUp, Layers, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/console/TopBar";
import { LeftNav } from "@/components/layout/LeftNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnalyticsView } from "@/components/console/AnalyticsView";
import { useWard } from "@/lib/wardContext";
import { getWardLocality } from "@/lib/geo/wardNames";
import { riskFillForCategory } from "@/lib/risk";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { evaluateWardAlert } from "@/lib/alerts";

const jsonFetch = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

export default function OverviewPage() {
  const { setSelectedId } = useWard();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { data: summary } = useSWR("/api/wards/summary", jsonFetch);
  const { data: heatmap } = useSWR("/api/wards/heatmap", jsonFetch);

  const wards = heatmap?.wards ?? [];
  // Frontend-side alerts (lib/alerts.ts): evaluated from board risk +
  // indexes already in hand. Nothing is saved to the DB.
  const alertsList = useMemo(
    () =>
      wards
        .filter((w: any) => w.thermal != null || w.riskScore != null)
        .map((w: any) => ({
          wardId: w.wardId,
          ward: w.ward,
          wardName: w.wardName,
          riskScore: w.riskScore,
          thermal: w.thermal,
          evaluation: evaluateWardAlert(
            {
              riskScore: w.riskScore,
              category: w.category,
              wbgtMax: w.wbgt,
              heatIndexMax: w.heatIndex,
            },
            w.ward !== null && w.ward !== undefined ? `Ward ${w.ward}` : `Location ${w.wardId}`,
          ),
        }))
        .filter((a: any) => a.evaluation.level === "HIGH" || a.evaluation.level === "EXTREME")
        .sort((a: any, b: any) => (b.thermal ?? b.riskScore) - (a.thermal ?? a.riskScore)),
    [wards],
  );

  const validWards = wards.filter((w: any) => w.thermal != null || w.riskScore != null);
  const sortedByStress = [...validWards].sort((a: any, b: any) => (b.thermal ?? (b.riskScore * 100)) - (a.thermal ?? (a.riskScore * 100)));
  const topCritical = sortedByStress.slice(0, 5);
  const maxCritical = topCritical.length ? (topCritical[0].thermal ?? (topCritical[0].riskScore * 100)) : 100;

  const catCount = (c: string) => validWards.filter((w: any) => w.category === c).length;
  const split = [
    { key: "LOW", label: "Low", n: catCount("LOW") },
    { key: "MODERATE", label: "Moderate", n: catCount("MODERATE") },
    { key: "HIGH", label: "High", n: catCount("HIGH") },
    { key: "VERY_HIGH", label: "Extreme", n: catCount("VERY_HIGH") },
  ];
  const splitTotal = validWards.length || 1;
  const exposedPop = validWards
    .filter((w: any) => w.category === "HIGH" || w.category === "VERY_HIGH")
    .reduce((s: number, w: any) => s + (w.population ?? 0), 0);
  const totalCityPop = useMemo(
    () => validWards.reduce((s: number, w: any) => s + (w.population ?? 0), 0),
    [validWards],
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <TopBar
        watchLabel={summary ? `Level ${summary.watch.level} · ${summary.watch.name}` : "Level …"}
        syncedAt={summary?.refreshedAt ?? heatmap?.refreshedAt ?? null}
        syncDetail={summary ? `${summary.synced}/${summary.total}` : null}
        timezone="Asia/Kolkata"
        onSendAlert={() => {}}
        searchQuery={search}
        onSearchChange={setSearch}
        onAnalyticsOpen={() => {}}
        wards={wards.map((w: any) => ({ ward: w.ward, wardName: w.wardName, wardId: w.wardId }))}
        onSelectWard={(id) => setSelectedId(id)}
      />
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <main className="custom-scrollbar flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6">
          <div className="mx-auto max-w-[1280px] space-y-6">
            <PageHeader
              icon={Flame}
              iconClassName="text-orange-500"
              title="Overview - Heat Stress Intelligence"
              subtitle={`City-wide snapshot · ${summary?.wards ?? "—"} wards · updated ${summary?.refreshedAt ? new Date(summary.refreshedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}`}
            />

            {/* KPI infographics */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summary ? (
                <>
                  <Card className="overflow-hidden border-l-4 border-l-orange-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Wards</p>
                          <p className="text-3xl font-black tabular-nums">{summary.active}</p>
                          <p className="text-xs text-muted-foreground">{summary.deltas?.active ?? "-"} vs {summary.deltaBasis ?? "-"}</p>
                        </div>
                        <Flame className="h-8 w-8 text-orange-500/20" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="overflow-hidden border-l-4 border-l-red-600">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extreme</p>
                          <p className="text-3xl font-black tabular-nums">{summary.extreme}</p>
                          <p className="text-xs text-muted-foreground">{summary.deltas?.extreme ?? "-"} vs {summary.deltaBasis ?? "-"}</p>
                        </div>
                        <Activity className="h-8 w-8 text-red-600/20" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="overflow-hidden border-l-4 border-l-amber-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">High Stress</p>
                          <p className="text-3xl font-black tabular-nums">{summary.high}</p>
                          <p className="text-xs text-muted-foreground">{summary.deltas?.high ?? "-"} vs {summary.deltaBasis ?? "-"}</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-amber-500/20" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="overflow-hidden border-l-4 border-l-teal-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HTSI Heat Load</p>
                          <p className="text-3xl font-black tabular-nums">{summary.metroHeatLoad}</p>
                          <p className="text-xs text-muted-foreground">{summary.watch.name}</p>
                        </div>
                        <Sun className="h-8 w-8 text-teal-500/20" />
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
              )}
            </div>

            {/* Category split + most critical wards */}
            {wards.length ? (
              <>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4" /> Category split</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label="Ward count by category">
                        {split.map((c) =>
                          c.n > 0 ? (
                            <div
                              key={c.key}
                              title={`${c.label}: ${c.n} wards`}
                              style={{ width: `${(c.n / splitTotal) * 100}%`, background: riskFillForCategory(c.key) }}
                            />
                          ) : null,
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {split.map((c) => (
                          <div key={c.key} className="rounded-lg border p-2">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <span className="h-2 w-2 rounded-full" style={{ background: riskFillForCategory(c.key) }} />
                              {c.label}
                            </p>
                            <p className="mt-0.5 text-xl font-black tabular-nums">{c.n}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        ≈ <span className="font-bold text-foreground tabular-nums">{exposedPop.toLocaleString("en-IN")}</span> people live in High/Extreme wards.
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> Most critical wards (HTSI)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {topCritical.map((w: any, i: number) => {
                          const val = w.thermal ? w.thermal.toFixed(2) : (w.riskScore * 100).toFixed(0);
                          return (
                            <button
                              key={w.wardId}
                              onClick={() => {
                                setSelectedId(w.wardId);
                                router.push("/maps");
                              }}
                              className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/40"
                              title="Open on map"
                            >
                              <span className="w-6 shrink-0 text-sm font-black tabular-nums text-muted-foreground">#{i + 1}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">
                                  Ward {w.ward ?? w.wardId}{getWardLocality(w.ward) ? ` · ${getWardLocality(w.ward)}` : ""}
                                </span>
                                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                                  <span
                                    className="block h-full rounded-full"
                                    style={{ width: `${maxCritical ? (((w.thermal ?? (w.riskScore * 100))) / maxCritical) * 100 : 0}%`, background: riskFillForCategory(w.category) }}
                                  />
                                </span>
                              </span>
                              <span className="shrink-0 text-sm font-black tabular-nums">{val}</span>
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Population Heat Exposure Summary Card */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="h-4 w-4 text-blue-500" /> City Population Heat Exposure Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {split.map((c) => {
                        const popTier = validWards
                          .filter((w: any) => w.category === c.key)
                          .reduce((s: number, w: any) => s + (w.population ?? 0), 0);
                        const pctOfTotal = (totalCityPop > 0 ? (popTier / totalCityPop) * 100 : 0).toFixed(1);
                        return (
                          <div key={`pop-${c.key}`} className="rounded-xl border p-3 bg-muted/20">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: riskFillForCategory(c.key) }} />
                              {c.label} Tier
                            </p>
                            <p className="mt-1 text-xl font-black tabular-nums">{popTier.toLocaleString("en-IN")}</p>
                            <p className="text-[11px] font-semibold text-muted-foreground">{pctOfTotal}% of city population</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            )}

            {/* City analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><HeartPulse className="h-4 w-4" /> City Heat Stress Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                {wards.length ? <AnalyticsView summary={summary} wards={wards} /> : <Skeleton className="h-[400px] w-full" />}
              </CardContent>
            </Card>

            {/* Recent alerts preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Recent Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                {alertsList.length ? (
                  <div className="space-y-2">
                    {alertsList.slice(0, 3).map((a: any) => (
                      <div key={a.wardId} className="flex items-center gap-3 rounded-xl border p-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${a.evaluation.level === "EXTREME" ? "bg-red-600" : "bg-orange-500"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">Ward {a.ward} · {a.wardName ?? ""}</p>
                          <p className="truncate text-xs text-muted-foreground">{a.evaluation.triggers.join(" · ") || a.evaluation.advisory}</p>
                        </div>
                        <span className="text-xs font-bold tabular-nums">HTSI {(a.thermal ?? (a.riskScore * 100)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active alerts - all wards below High.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
