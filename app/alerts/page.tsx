"use client";

import useSWR from "swr";
import { TopBar } from "@/components/console/TopBar";
import { LeftNav } from "@/components/layout/LeftNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Sun, MapPin, Bell, Shield, Activity, AlertTriangle, CheckCircle, TrendingUp, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getWardLocality } from "@/lib/geo/wardNames";
import { evaluateWardAlert } from "@/lib/alerts";
import { EmailAlertModal } from "@/components/console/EmailAlertModal";
import { useMemo, useState } from "react";

const jsonFetch = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

export default function AlertsPage() {
  const { data: heatmap } = useSWR("/api/wards/heatmap", jsonFetch);
  const wards = (heatmap as any)?.wards ?? [];
  const { data: summary } = useSWR("/api/wards/summary", jsonFetch);
  const [emailFor, setEmailFor] = useState<any | null>(null);

  // Frontend-side alerts (lib/alerts.ts): evaluated live from board risk +
  // engine indexes. Nothing is saved to the DB.
  const alerts = useMemo(
    () =>
      wards
        .filter((w: any) => w.riskScore != null)
        .map((w: any) => ({
          ...w,
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
        .sort((a: any, b: any) => b.riskScore - a.riskScore),
    [wards],
  );

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
                    <Card key={a.wardId} className="overflow-hidden border-l-4" style={{ borderLeftColor: a.evaluation.level === "EXTREME" ? "#991b1b" : "#f97316" }}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-white ${a.evaluation.level === "EXTREME" ? "bg-red-600" : "bg-orange-500"}`}><AlertTriangle className="h-4 w-4" /></span>
                            <div>
                              <p className="font-bold">Ward {a.ward} <span className="font-normal text-muted-foreground">{getWardLocality(a.ward) ?? ""}</span></p>
                              <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> Risk {(a.riskScore * 100).toFixed(0)}/100 · {a.evaluation.triggers.join(" · ") || " evaluated"}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant={a.evaluation.level === "EXTREME" ? "destructive" : "secondary"}>{a.evaluation.level}</Badge>
                            <Button size="sm" variant="outline" onClick={() => setEmailFor(a)}>
                              <Send className="h-3.5 w-3.5" /> Email
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-2">
                          <div>
                            <p className="flex items-center gap-1 text-xs font-bold"><Sun className="h-3 w-3" /> Advisory</p>
                            <p className="mt-1 text-sm leading-relaxed">{a.evaluation.advisory}</p>
                          </div>
                          <div className="rounded-lg bg-card p-2.5">
                            <p className="flex items-center gap-1 text-xs font-bold"><Shield className="h-3 w-3" /> Recommended Action</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.evaluation.level === "EXTREME" ? "Deploy shade/water at markets, open cooling shelters, check elderly hourly, alert hospitals." : "Limit 12–4pm outdoor work, ensure water/shade, monitor vulnerable, reschedule non-essential."}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> How this page works</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl border bg-card p-3"><p className="font-bold flex items-center gap-1"><Bell className="h-4 w-4" /> What’s coming</p><p className="text-muted-foreground">This list is evaluated live in your browser from ward risk + engine indexes - Extreme first. Nothing is stored.</p></div>
                <div className="rounded-xl border bg-card p-3"><p className="font-bold flex items-center gap-1"><Send className="h-4 w-4" /> Need to be done</p><p className="text-muted-foreground">Use the per-ward Email button to notify the duty officer instantly.</p></div>
                <div className="rounded-xl border bg-card p-3"><p className="font-bold flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Has been done</p><p className="text-muted-foreground">Sends are fire-and-forget - the SMTP receipt in the dialog is the confirmation.</p></div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
      <EmailAlertModal
        open={emailFor !== null}
        onClose={() => setEmailFor(null)}
        wardId={emailFor?.wardId ?? null}
        ward={emailFor?.ward ?? null}
        wardName={emailFor?.wardName ?? null}
        evaluation={emailFor?.evaluation ?? null}
        timezone="Asia/Kolkata"
        telemetry={null}
        outlook={[]}
      />
    </div>
  );
}
