"use client";

import useSWR from "swr";
import { TopBar } from "@/components/console/TopBar";
import { LeftNav } from "@/components/layout/LeftNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Sun, MapPin, Bell, Clock, Shield, Activity, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getWardLocality } from "@/lib/geo/wardNames";

const jsonFetch = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

export default function AlertsPage() {
  const { data } = useSWR("/api/alerts/active", jsonFetch);
  const alerts = (data as any)?.alerts ?? [];
  const { data: heatmap } = useSWR("/api/wards/heatmap", jsonFetch);
  const wards = (heatmap as any)?.wards ?? [];
  const { data: summary } = useSWR("/api/wards/summary", jsonFetch);

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <TopBar watchLabel="Alerts" syncedAt={summary?.refreshedAt ?? null} syncDetail={summary ? `${summary.synced}/${summary.total}` : null} timezone="Asia/Kolkata" onSendAlert={() => {}} wards={wards.map((w: any) => ({ ward: w.ward, wardName: w.wardName, wardId: w.wardId }))} onSelectWard={() => {}} />
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <main className="custom-scrollbar flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6">
          <div className="mx-auto max-w-[1280px] space-y-6">
            {/* Header */}
            <PageHeader
              icon={Bell}
              iconClassName="text-red-600"
              title="Alerts & Actions"
              subtitle={`${alerts.length} active alerts · ${wards.length} wards monitored · ${summary ? `Load ${summary.metroHeatLoad}/100` : ""}`}
            />

            {/* Alert cards - vivid */}
            <div>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Active Ward Alerts - What to do now</h2>
              <div className="grid gap-3">
                {alerts.length === 0 ? (
                  <Card><CardContent className="p-8 text-center"><CheckCircle className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-2 font-semibold">All clear</p><p className="text-sm text-muted-foreground">No wards at High/Extreme - routine monitoring.</p></CardContent></Card>
                ) : (
                  alerts.map((a: any) => (
                    <Card key={a.id} className="overflow-hidden border-l-4" style={{ borderLeftColor: a.severity === "EXTREME" ? "#991b1b" : "#f97316" }}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-white ${a.severity === "EXTREME" ? "bg-red-600" : "bg-orange-500"}`}><AlertTriangle className="h-4 w-4" /></span>
                            <div>
                              <p className="font-bold">Ward {a.ward} <span className="font-normal text-muted-foreground">{getWardLocality(a.ward) ?? ""}</span></p>
                              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Peak {new Date(a.peakWindowStart).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}–{new Date(a.peakWindowEnd).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} · <MapPin className="h-3 w-3" /> Risk {(a.riskScore * 100).toFixed(0)}/100</p>
                            </div>
                          </div>
                          <Badge variant={a.severity === "EXTREME" ? "destructive" : "secondary"} className="shrink-0">{a.severity}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-2">
                          <div>
                            <p className="flex items-center gap-1 text-xs font-bold"><Sun className="h-3 w-3" /> Advisory</p>
                            <p className="mt-1 text-sm leading-relaxed">{a.advisoryText}</p>
                          </div>
                          <div className="rounded-lg bg-card p-2.5">
                            <p className="flex items-center gap-1 text-xs font-bold"><Shield className="h-3 w-3" /> Recommended Action</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.severity === "EXTREME" ? "Deploy shade/water at markets, open cooling shelters, check elderly hourly, alert hospitals." : "Limit 12–4pm outdoor work, ensure water/shade, monitor vulnerable, reschedule non-essential."}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> How this page is used</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl border bg-card p-3"><p className="font-bold flex items-center gap-1"><Bell className="h-4 w-4" /> What’s coming</p><p className="text-muted-foreground">This list - sorted by risk - is the watch queue. Extreme first.</p></div>
                <div className="rounded-xl border bg-card p-3"><p className="font-bold flex items-center gap-1"><Activity className="h-4 w-4" /> Need to be done</p><p className="text-muted-foreground">Use the per-ward action (above) to dispatch teams. Log via WhatsApp on Maps.</p></div>
                <div className="rounded-xl border bg-card p-3"><p className="font-bold flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Has been done</p><p className="text-muted-foreground">History lives per-ward: Maps → tap ward → Event / Alert History table.</p></div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
