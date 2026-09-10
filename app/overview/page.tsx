"use client";

import useSWR from "swr";
import { motion } from "framer-motion";
import { Flame, Droplet, Wind, Sun, Users, Activity, HeartPulse, MapPin, Bell, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/console/TopBar";
import { LeftNav } from "@/components/layout/LeftNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnalyticsView } from "@/components/console/AnalyticsView";
import { useWard } from "@/lib/wardContext";
import { useState } from "react";

const jsonFetch = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

export default function OverviewPage() {
  const { setSelectedId } = useWard();
  const [search, setSearch] = useState("");
  const { data: summary } = useSWR("/api/wards/summary", jsonFetch);
  const { data: heatmap } = useSWR("/api/wards/heatmap", jsonFetch);
  const { data: alerts } = useSWR("/api/alerts/active", jsonFetch);

  const wards = heatmap?.wards ?? [];
  const alertsList = alerts?.alerts ?? [];

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
              title="Overview - Heat Risk Intelligence"
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
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">High Risk</p>
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
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heat Load</p>
                          <p className="text-3xl font-black tabular-nums">{summary.metroHeatLoad}<span className="text-lg font-semibold text-muted-foreground">/100</span></p>
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

            {/* City analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><HeartPulse className="h-4 w-4" /> City Heat Load Trend</CardTitle>
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
                      <div key={a.id} className="flex items-center gap-3 rounded-xl border p-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${a.severity === "EXTREME" ? "bg-red-600" : "bg-orange-500"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">Ward {a.ward} · {a.wardName ?? ""}</p>
                          <p className="truncate text-xs text-muted-foreground">{a.advisoryText ?? ""}</p>
                        </div>
                        <span className="text-xs font-bold tabular-nums">{(a.riskScore * 100).toFixed(0)}/100</span>
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
