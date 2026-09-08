"use client";

import useSWR from "swr";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getWardDisplayName } from "@/lib/geo/wardNames";

const jsonFetch = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

export function WardAnalysis({ wardId, ward }: { wardId: number | null; ward: number | null }) {
  const { data: trend } = useSWR<{ wardId: number; history: Array<{ date: string; risk: number; category: string; thermal: number; wbgt: number }> }>(
    wardId ? `/api/wards/${wardId}/trend?days=14` : null,
    jsonFetch,
  );
  const { data: forecast } = useSWR<{ days: Array<{ date: string; risk: number; category: string; wbgtMax: number }> }>(
    wardId ? `/api/forecast/${wardId}?days=5` : null,
    jsonFetch,
  );

  if (!wardId) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
        <p className="font-semibold">No ward selected</p>
        <p className="mt-1 text-sm text-muted-foreground">Tap a ward on the Kolkata map to see its 14-day history + 5-day forecast, thermal trend, and how it compares to the city mean.</p>
      </div>
    );
  }

  const hist = trend?.history ?? [];
  const fc = forecast?.days ?? [];
  const hasHist = hist.length > 1;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-extrabold tracking-tight">{getWardDisplayName(ward, null)} — Ward Analysis</h3>
        <p className="text-sm text-muted-foreground">{hist.length} snapshots · {fc.length} forecast days · tap another ward to switch</p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-2"><CardTitle className="text-base">Ward risk timeline — past 14d + next 5d forecast</CardTitle></CardHeader>
        <CardContent className="h-[300px] w-full min-w-0 p-2 sm:p-4">
          {!hasHist && !fc.length ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...hist.map((h) => ({ label: h.date.slice(5), risk: +(h.risk * 100).toFixed(1), type: "history" as const })), ...fc.map((f) => ({ label: f.date.slice(5), risk: +(f.risk * 100).toFixed(1), type: "forecast" as const }))]} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="risk" name="Risk (0–100)" dot={false} stroke="#ef4444" strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2"><CardTitle className="text-base">Thermal & WBGT history</CardTitle></CardHeader>
          <CardContent className="h-[260px] w-full min-w-0 p-2 sm:p-4">
            {hist.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hist.map((h) => ({ d: h.date.slice(5), thermal: +(h.thermal * 100).toFixed(1), wbgt: h.wbgt }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="thermal" name="Thermal ×100" dot={false} stroke="#0ea5e9" strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="wbgt" name="WBGT °C" dot={false} stroke="#f97316" strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-2"><CardTitle className="text-base">Ward vs city</CardTitle></CardHeader>
          <CardContent className="flex h-[260px] flex-col justify-center gap-3 p-4">
            {hist.length === 0 ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">This ward (latest)</span>
                  <span className="text-2xl font-black tabular-nums">{(hist[hist.length - 1].risk * 100).toFixed(1)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {hist.slice(-5).map((h) => (
                    <Badge key={h.date} variant="secondary" className="tabular-nums">{h.date.slice(5)} {(h.risk * 100).toFixed(0)}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Forecast next 5d: {fc.map((f) => `${f.date.slice(5)} ${(f.risk * 100).toFixed(0)}`).join(" · ") || "—"}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
