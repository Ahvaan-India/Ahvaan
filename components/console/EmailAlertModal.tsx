"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_ALERT_EMAIL,
  composeAlertHtml,
  composeAlertSubject,
  isValidEmail,
} from "@/lib/email/compose";
import { evaluateWardAlert, type WardAlert } from "@/lib/alerts";
import { getWardLocality } from "@/lib/geo/wardNames";
import type { Telemetry } from "./TelemetryPanel";

const jsonFetch = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

export interface OutlookDay {
  date: string;
  tempMax: number;
  risk: number;
  category: string;
}

type BlockKey = "summary" | "indicators" | "drivers" | "outlook" | "advisory";

const BLOCKS: Array<{ key: BlockKey; label: string }> = [
  { key: "summary", label: "Risk summary" },
  { key: "indicators", label: "Current indicators (temp, WBGT, humidity)" },
  { key: "drivers", label: "Alert triggers (why)" },
  { key: "outlook", label: "5-day outlook" },
  { key: "advisory", label: "Advisory text" },
];

export interface WardSelectItem {
  ward: number;
  wardName: string | null;
  wardId: number;
}

export function EmailAlertModal({
  open,
  onClose,
  wardId,
  ward,
  wardName,
  evaluation,
  timezone,
  telemetry,
  outlook,
  wards: passedWards,
}: {
  open: boolean;
  onClose: () => void;
  wardId: number | null;
  ward: number | null;
  wardName: string | null;
  evaluation: WardAlert | null;
  timezone: string;
  telemetry: Telemetry | null;
  outlook: OutlookDay[];
  wards?: WardSelectItem[];
}) {
  const [selectedWardId, setSelectedWardId] = useState<number | null>(wardId);
  const [email, setEmail] = useState(DEFAULT_ALERT_EMAIL);
  const [blocks, setBlocks] = useState<Record<BlockKey, boolean>>({
    summary: true,
    indicators: true,
    drivers: true,
    outlook: true,
    advisory: true,
  });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [result, setResult] = useState<{
    statusText?: string;
    mode?: string;
    messageId?: string;
    errorText?: string;
  } | null>(null);

  // Fallback ward catalog fetch if wards prop is missing
  const { data: heatmapData } = useSWR(
    open && !passedWards ? "/api/wards/heatmap" : null,
    jsonFetch,
  );

  const allWardsList: WardSelectItem[] = useMemo(() => {
    if (passedWards && passedWards.length > 0) return passedWards;
    const items = (heatmapData as any)?.wards ?? [];
    return items.map((w: any) => ({
      ward: w.ward,
      wardName: w.wardName ?? null,
      wardId: w.wardId ?? w.ward,
    }));
  }, [passedWards, heatmapData]);

  // Sync clicked ward ID whenever modal opens or initial wardId prop changes
  useEffect(() => {
    if (open) {
      setSelectedWardId(wardId);
      setStatus("idle");
      setResult(null);
      setEmail((e) => e || DEFAULT_ALERT_EMAIL);
    }
  }, [open, wardId]);

  // Fetch telemetry & forecast dynamically when a different ward is selected in the modal
  const isDifferentWard = selectedWardId !== null && selectedWardId !== wardId;

  const { data: fetchedTelemetry } = useSWR<any>(
    open && isDifferentWard ? `/api/wards/${selectedWardId}/telemetry` : null,
    jsonFetch,
  );

  const { data: fetchedForecast } = useSWR<any>(
    open && isDifferentWard ? `/api/forecast/${selectedWardId}?days=5` : null,
    jsonFetch,
  );

  // Derive active values for selected modal ward
  const activeWardId = selectedWardId;

  const activeWardObj = useMemo(() => {
    if (activeWardId === null) return null;
    return allWardsList.find(
      (w) => w.wardId === activeWardId || w.ward === activeWardId,
    );
  }, [allWardsList, activeWardId]);

  const activeWardNum = activeWardObj?.ward ?? (activeWardId === wardId ? ward : activeWardId);
  const activeWardName = activeWardObj?.wardName ?? (activeWardNum !== null ? getWardLocality(activeWardNum) : null);
  const activeWardLabel = activeWardNum !== null ? `Ward ${activeWardNum}` : activeWardId !== null ? `Location ${activeWardId}` : "Ward";

  const activeTelemetry: Telemetry | null = isDifferentWard
    ? (fetchedTelemetry ?? null)
    : telemetry;

  const activeOutlook: OutlookDay[] = isDifferentWard
    ? ((fetchedForecast as any)?.days ?? []).map((d: any) => ({
        date: d.date,
        tempMax: d.tempMax,
        risk: d.risk,
        category: d.category,
      }))
    : outlook;

  const activeEvaluation: WardAlert | null = useMemo(() => {
    if (!isDifferentWard && evaluation) return evaluation;
    if (!activeTelemetry) return null;
    return evaluateWardAlert(
      {
        riskScore: activeTelemetry.risk?.value,
        htsiMax: (activeTelemetry.risk as any)?.htsi ?? activeTelemetry.risk?.thermal,
        wbgtMax: activeTelemetry.risk?.wbgt,
        heatIndexMax: activeTelemetry.risk?.heatIndex,
      },
      activeWardLabel,
    );
  }, [isDifferentWard, evaluation, activeTelemetry, activeWardLabel]);

  const message = useMemo(() => {
    if (activeWardId === null) return "";
    const sevLabel =
      activeEvaluation?.level === "EXTREME"
        ? "Extreme"
        : activeEvaluation?.level === "HIGH"
          ? "High"
          : activeEvaluation?.level === "MODERATE"
            ? "Moderate"
            : "Low";

    const lines = [
      `Ahvaan ${sevLabel} Heat Advisory`,
      `${activeWardLabel}${activeWardName ? ` · ${activeWardName}` : ""}`,
    ];
    if (blocks.summary) {
      lines.push(`Category: ${sevLabel}`);
    }
    if (blocks.indicators && activeTelemetry) {
      const m = activeTelemetry.macro;
      const r = activeTelemetry.risk;
      const parts = [
        r ? `HTSI ${((r as any).htsi ?? (r.thermal * 100)).toFixed(1)}/100` : null,
        r ? `WBGT ${r.wbgt.toFixed(1)}°C` : null,
        r?.heatIndex ? `HI ${r.heatIndex.toFixed(1)}°C` : null,
        m.temp !== null ? `Temp ${m.temp.toFixed(1)}°C` : null,
        m.humidity !== null ? `Humidity ${m.humidity.toFixed(0)}%` : null,
      ].filter(Boolean);
      if (parts.length > 0) lines.push(`Indicators: ${parts.join(" · ")}`);
    }
    if (blocks.drivers && activeEvaluation && activeEvaluation.triggers.length > 0)
      lines.push(`Triggers: ${activeEvaluation.triggers.join("; ")}`);
    if (blocks.outlook && activeOutlook.length > 0) {
      lines.push(
        "5-Day Outlook: " +
          activeOutlook
            .slice(0, 5)
            .map((d) => `${d.date.slice(5)} (${d.category || "Low"})`)
            .join(", "),
      );
    }
    if (blocks.advisory && activeEvaluation)
      lines.push(`Recommended Safety Actions: ${activeEvaluation.advisory}`);
    lines.push(
      "— Sent from the Ahvaan Heat Safety Console (decision-support system)",
    );
    return lines.join("\n");
  }, [
    activeWardId,
    activeEvaluation,
    activeWardLabel,
    activeWardName,
    blocks,
    activeTelemetry,
    activeOutlook,
  ]);

  const subject = useMemo(() => {
    if (!activeEvaluation || activeWardId === null) return "";
    return composeAlertSubject(
      {
        severity: activeEvaluation.level,
        wardId: activeWardId,
        ward: activeWardNum,
        wardName: activeWardName,
        htsi: activeTelemetry?.risk ? ((activeTelemetry.risk as any).htsi ?? (activeTelemetry.risk.thermal * 100)) : null,
        wbgt: activeTelemetry?.risk ? activeTelemetry.risk.wbgt : null,
        heatIndex: activeTelemetry?.risk ? activeTelemetry.risk.heatIndex : null,
        utci: activeTelemetry?.risk ? activeTelemetry.risk.utci : null,
        temperature: activeTelemetry?.macro ? activeTelemetry.macro.temp : null,
        humidity: activeTelemetry?.macro ? activeTelemetry.macro.humidity : null,
        advisoryText: activeEvaluation.advisory,
      },
      timezone,
    );
  }, [
    activeEvaluation,
    activeWardId,
    activeWardNum,
    activeWardName,
    activeTelemetry,
    timezone,
  ]);

  const html = useMemo(() => {
    if (!activeEvaluation || activeWardId === null) return "";
    return composeAlertHtml(
      {
        severity: activeEvaluation.level,
        wardId: activeWardId,
        ward: activeWardNum,
        wardName: activeWardName,
        htsi: activeTelemetry?.risk ? ((activeTelemetry.risk as any).htsi ?? (activeTelemetry.risk.thermal * 100)) : null,
        wbgt: activeTelemetry?.risk ? activeTelemetry.risk.wbgt : null,
        heatIndex: activeTelemetry?.risk ? activeTelemetry.risk.heatIndex : null,
        utci: activeTelemetry?.risk ? activeTelemetry.risk.utci : null,
        temperature: activeTelemetry?.macro ? activeTelemetry.macro.temp : null,
        humidity: activeTelemetry?.macro ? activeTelemetry.macro.humidity : null,
        advisoryText: blocks.advisory ? activeEvaluation.advisory : null,
      },
      timezone,
      {
        drivers: blocks.drivers ? activeEvaluation.triggers.join("; ") : null,
        outlook:
          blocks.outlook && activeOutlook.length > 0
            ? activeOutlook
                .slice(0, 5)
                .map((d) => `${d.date.slice(5)} (${d.category || "Low"})`)
                .join(", ")
            : null,
      },
    );
  }, [
    activeEvaluation,
    activeWardId,
    activeWardNum,
    activeWardName,
    activeTelemetry,
    timezone,
    blocks,
    activeOutlook,
  ]);

  if (!open) return null;

  const toggle = (k: BlockKey) => setBlocks((b) => ({ ...b, [k]: !b[k] }));

  const send = async () => {
    if (!isValidEmail(email) || activeWardId === null) return;
    setStatus("sending");
    setResult(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: email.trim(),
          subject,
          messageText: message,
          html,
        }),
      });
      const data = (await res.json()) as {
        status?: string;
        mode?: string;
        messageId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      setResult({
        statusText: data.status,
        mode: data.mode,
        messageId: data.messageId || undefined,
      });
      setStatus("sent");
    } catch (err) {
      setResult({
        errorText: err instanceof Error ? err.message : "Failed to send email",
      });
      setStatus("error");
    }
  };

  const emailValid = isValidEmail(email);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send email alert"
    >
      <Card
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" /> Send Email Alert
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Ward Select Dropdown Menu */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Target Ward
            </label>
            <Select
              value={selectedWardId !== null ? String(selectedWardId) : "none"}
              onValueChange={(val) => {
                if (val === "none") setSelectedWardId(null);
                else setSelectedWardId(Number(val));
              }}
            >
              <SelectTrigger className="h-9 w-full rounded border-input bg-card text-sm shadow-sm">
                <SelectValue placeholder="Select a ward..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="none">None (Select a Ward)</SelectItem>
                {allWardsList.map((w) => {
                  const localityName = w.wardName || getWardLocality(w.ward);
                  return (
                    <SelectItem
                      key={w.wardId || w.ward}
                      value={String(w.wardId || w.ward)}
                    >
                      Ward {w.ward}{localityName ? ` · ${localityName}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedWardId === null ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No ward selected. Please select a ward from the dropdown above to generate an email alert.
            </div>
          ) : activeEvaluation ? (
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-bold">{activeEvaluation.headline}</span>
              {activeEvaluation.triggers.length > 0 && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {activeEvaluation.triggers.join(" · ")}
                </span>
              )}
            </p>
          ) : (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Loading ward telemetry & risk evaluation…
            </div>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">
              Recipient email address
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 w-full rounded border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              inputMode="email"
              placeholder="heat-officer@example.gov.in"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Include data blocks
            </span>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {BLOCKS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-xs text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={blocks[key]}
                    onChange={() => toggle(key)}
                    className="rounded border-input text-primary focus:ring-primary"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Generated message preview
            </span>
            <textarea
              readOnly
              value={message || "Select a ward to view message preview."}
              rows={5}
              className="w-full rounded border border-input bg-muted/50 p-2 font-mono text-xs text-foreground focus:outline-none"
            />
          </div>

          {result?.errorText && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {result.errorText}
            </p>
          )}
          {result?.statusText === "sent" && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Email sent successfully
              {result.mode ? ` (${result.mode})` : ""}
              {result.messageId ? ` · ID: ${result.messageId}` : ""}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={send}
              disabled={
                !emailValid ||
                status === "sending" ||
                selectedWardId === null ||
                !activeEvaluation
              }
            >
              {status === "sending" ? "Sending…" : "Send Alert"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
