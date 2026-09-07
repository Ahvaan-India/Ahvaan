"use client";

import { useState } from "react";
import useSWR from "swr";
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskBadge } from "./RiskBadge";

export interface ActiveAlert {
  id: number;
  wardId: number;
  ward: number | null;
  wardName: string | null;
  severity: string;
  displaySeverity: string;
  riskScore: number;
  peakWindowStart: string | null;
  peakWindowEnd: string | null;
  advisoryText: string | null;
  triggeredAt: string;
}

const jsonFetch = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
};

function peakLabel(a: ActiveAlert, timeZone: string): string {
  if (!a.peakWindowStart || !a.peakWindowEnd) return "Peak window n/a";
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-IN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  return `Peak Heat Window ${fmt(a.peakWindowStart)}–${fmt(a.peakWindowEnd)}`;
}

function BroadcastHistory({
  alertId,
  onClose,
}: {
  alertId: number;
  onClose: () => void;
}) {
  const { data } = useSWR<{
    count: number;
    deliveries: Array<{
      id: number;
      recipientPhone: string | null;
      sentAt: string;
      sentBy: string | null;
      status: string;
    }>;
  }>(`/api/alerts/deliveries?alertId=${alertId}`, jsonFetch);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Broadcast history"
    >
      <Card className="max-h-[85vh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Broadcast History — Alert #{alertId}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Skeleton className="h-16 w-full" />
          ) : data.deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sends logged for this alert yet. Use “Send Alert to WhatsApp” to
              initiate one — initiation (not delivery) is what gets logged.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">Sent at</th>
                  <th className="py-1 pr-2">To</th>
                  <th className="py-1 pr-2">By</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="py-1.5 pr-2 tabular-nums">
                      {new Date(d.sentAt).toLocaleString("en-IN")}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">{d.recipientPhone ?? "—"}</td>
                    <td className="py-1.5 pr-2">{d.sentBy ?? "—"}</td>
                    <td className="py-1.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium uppercase ${
                          d.status === "FAILED"
                            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                            : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Active Ward Alerts: severity badge, ward + score, peak window, one-line
 * advisory, broadcast-history link. Clicking a card selects the ward.
 */
export function AlertsList({
  alerts,
  timezone,
  onSelectWard,
}: {
  alerts: ActiveAlert[] | null;
  timezone: string;
  onSelectWard: (wardId: number) => void;
}) {
  const [historyFor, setHistoryFor] = useState<number | null>(null);

  if (alerts === null) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <Skeleton className="h-5 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          No active alerts. Wards at or above HIGH risk will appear here after the
          next snapshot refresh.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
      {alerts.map((a) => (
        <Card key={a.id}>
          <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-4">
            <RiskBadge category={a.severity} label={a.displaySeverity.toUpperCase()} />
            <button
              className="text-sm font-semibold hover:underline"
              onClick={() => onSelectWard(a.wardId)}
              title="Select this ward"
            >
              {a.ward !== null ? `Ward ${a.ward}` : `Location ${a.wardId}`}
            </button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {(a.riskScore * 100).toFixed(0)}/100
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {peakLabel(a, timezone)}
            </span>
            <span className="w-full text-sm">{a.advisoryText}</span>
            <Button variant="ghost" size="sm" onClick={() => setHistoryFor(a.id)}>
              <History /> View Broadcast History
            </Button>
          </CardContent>
        </Card>
      ))}
      {historyFor !== null && (
        <BroadcastHistory alertId={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}
