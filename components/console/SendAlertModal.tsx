"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_TEST_NUMBER } from "@/lib/whatsapp/compose";
import { buildSummary, computeTopDrivers } from "@/lib/heatshield/explain";
import { computeMortalityIndex } from "@/lib/heatshield/mortality";
import type { Telemetry } from "./TelemetryPanel";

export interface AlertOption {
  id: number;
  wardId: number;
  ward: number | null;
  wardName: string | null;
  severity: string;
  riskScore: number;
  peakWindowStart: string | null;
  peakWindowEnd: string | null;
  advisoryText: string | null;
  wbgt: number | null;
}

export interface OutlookDay {
  date: string;
  tempMax: number;
  risk: number;
  category: string;
}

type BlockKey = "summary" | "indicators" | "drivers" | "outlook" | "advisory";

const BLOCKS: Array<{ key: BlockKey; label: string }> = [
  { key: "summary", label: "Risk summary + mortality" },
  { key: "indicators", label: "Current indicators (temp, WBGT, humidity)" },
  { key: "drivers", label: "Top drivers (why)" },
  { key: "outlook", label: "5-day outlook" },
  { key: "advisory", label: "Advisory text" },
];

function fmtHour(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/**
 * Prototype bot-send flow. The OPERATOR never sends anything manually: they
 * pick the alert, tick which data blocks go out, and enter the USER's
 * WhatsApp number — the Ahvaan bot addresses that user. In this prototype
 * phase the send is simulated (logged as a bot initiation); real delivery
 * requires the WhatsApp Business Cloud API migration.
 */
export function SendAlertModal({
  open,
  onClose,
  alerts,
  defaultAlertId,
  timezone,
  telemetry,
  outlook,
}: {
  open: boolean;
  onClose: () => void;
  alerts: AlertOption[];
  defaultAlertId: number | null;
  timezone: string;
  telemetry: Telemetry | null;
  outlook: OutlookDay[];
}) {
  const [phone, setPhone] = useState(DEFAULT_TEST_NUMBER);
  const [alertId, setAlertId] = useState<number | null>(defaultAlertId);
  const [blocks, setBlocks] = useState<Record<BlockKey, boolean>>({
    summary: true,
    indicators: true,
    drivers: true,
    outlook: true,
    advisory: true,
  });
  const [status, setStatus] = useState<"idle" | "sending" | "queued" | "error">("idle");
  const [deliveryId, setDeliveryId] = useState<number | null>(null);
  const [deliveryInfo, setDeliveryInfo] = useState<{
    waLink?: string;
    mode?: string;
    statusText?: string;
    errorText?: string;
  } | null>(null);

  const selected: AlertOption | null = useMemo(
    () => alerts.find((a) => a.id === alertId) ?? alerts[0] ?? null,
    [alerts, alertId],
  );

  useEffect(() => {
    if (open) {
      setAlertId(defaultAlertId ?? alerts[0]?.id ?? null);
      setStatus("idle");
      setDeliveryId(null);
      setDeliveryInfo(null);
      setPhone((p) => p || DEFAULT_TEST_NUMBER);
    }
  }, [open, defaultAlertId, alerts]);

  const message = useMemo(() => {
    if (!selected) return "";
    const sev = selected.severity === "EXTREME" ? "EXTREME" : "HIGH";
    const wardLine = selected.ward !== null ? `Ward ${selected.ward}` : `Location ${selected.wardId}`;
    const lines = [`🤖 Ahvaan Heat Bot — ${sev} Alert`, `${wardLine}${selected.wardName ? ` · ${selected.wardName}` : ""}`];
    const start = fmtHour(selected.peakWindowStart, timezone);
    const end = fmtHour(selected.peakWindowEnd, timezone);
    if (start && end) lines.push(`Peak heat window: ${start}–${end} IST`);

    if (blocks.summary) {
      const mort =
        telemetry?.risk &&
        ` · Mortality ${computeMortalityIndex({
          heatIndex: telemetry.risk.heatIndex,
          nighttimeRecovery: telemetry.risk.recovery,
          persistence: telemetry.risk.persistence,
          vulnerability: telemetry.risk.vulnerability,
        }).index}/100`;
      lines.push(`Risk ${(selected.riskScore * 100).toFixed(0)}/100${mort ?? ""}`);
    }
    if (blocks.indicators && telemetry) {
      const m = telemetry.macro;
      const parts = [
        m.temp !== null ? `${m.temp.toFixed(1)}°C` : null,
        telemetry.risk ? `WBGT ${telemetry.risk.wbgt.toFixed(1)}` : null,
        m.humidity !== null ? `RH ${m.humidity.toFixed(0)}%` : null,
      ].filter(Boolean);
      if (parts.length > 0) lines.push(parts.join(" · "));
    }
    if (blocks.drivers && telemetry?.risk) {
      const r = telemetry.risk;
      const drivers = computeTopDrivers({
        thermalStress: r.thermal,
        exposure: r.exposure,
        vulnerability: r.vulnerability,
        persistence: r.persistence,
        nighttimeRecovery: r.recovery,
        wbgt: r.wbgt,
        heatIndex: r.heatIndex,
        confidence: r.confidence,
      });
      lines.push(buildSummary(drivers, r.category));
    }
    if (blocks.outlook && outlook.length > 0) {
      lines.push(
        "Next: " +
          outlook
            .slice(0, 5)
            .map((d) => `${d.date.slice(5)} ${(d.risk * 100).toFixed(0)}`)
            .join(", "),
      );
    }
    if (blocks.advisory && selected.advisoryText) lines.push(`Advisory: ${selected.advisoryText}`);
    lines.push("— sent by Ahvaan bot");
    return lines.join("\n");
  }, [selected, blocks, telemetry, outlook, timezone]);

  if (!open) return null;

  const toggle = (k: BlockKey) => setBlocks((b) => ({ ...b, [k]: !b[k] }));

  const send = async () => {
    if (!selected) return;
    const cleanPhone = phone.replace(/[^\d]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 15) return;
    setStatus("sending");
    setDeliveryInfo(null);
    try {
      const res = await fetch("/api/alerts/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertId: selected.id,
          recipientPhone: cleanPhone,
          messageText: message,
          sentBy: "ahvaan-bot",
        }),
      });
      const data = (await res.json()) as {
        id?: number;
        status?: string;
        mode?: string;
        waLink?: string;
        error?: string;
        note?: string;
      };
      if (!res.ok && !data.id) throw new Error(data.error || "Failed to send WhatsApp alert");
      setDeliveryId(data.id || null);
      setDeliveryInfo({
        waLink: data.waLink,
        mode: data.mode,
        statusText: data.status,
        errorText: data.error || undefined,
      });
      setStatus("queued");
    } catch (err) {
      setDeliveryInfo({
        errorText: err instanceof Error ? err.message : "Failed to queue WhatsApp alert",
      });
      setStatus("error");
    }
  };

  const phoneValid = phone.replace(/[^\d]/g, "").length >= 10;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send alert via Ahvaan bot"
    >
      <Card
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" /> Send Alert via Avhaan Bot
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">
              Recipient WhatsApp Number (with country code)
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-9 w-full rounded border border-input bg-transparent px-3 text-sm tabular-nums shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              inputMode="tel"
            />
            {!phoneValid && (
              <span className="text-xs text-red-600">Include country code (10–15 digits).</span>
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Alert context</span>
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setAlertId(Number(e.target.value))}
              className="h-9 w-full rounded border border-input bg-popover px-2 text-sm text-popover-foreground"
            >
              {alerts.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.severity}] {a.ward !== null ? `Ward ${a.ward}` : `Loc ${a.wardId}`} — risk{" "}
                  {(a.riskScore * 100).toFixed(0)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-sm">
            <legend className="mb-1 text-muted-foreground">Data blocks to send</legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {BLOCKS.map((b) => (
                <label key={b.key} className="flex cursor-pointer items-center gap-2 rounded border border-border px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={blocks[b.key]}
                    onChange={() => toggle(b.key)}
                    className="h-4 w-4 accent-red-600"
                  />
                  {b.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="text-sm">
            <span className="mb-1 block text-muted-foreground">Bot message preview</span>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-secondary/40 p-2 font-mono text-xs">
              {message || "Select an alert to preview."}
            </pre>
          </div>
          {status === "queued" && (
            <div className="rounded border border-green-200 bg-green-50/50 p-2.5 text-sm dark:border-green-900/50 dark:bg-green-950/40">
              <p className="font-semibold text-green-800 dark:text-green-200">
                ✅ WhatsApp Alert Dispatched! (Log #{deliveryId ?? "N/A"})
              </p>
              <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                Status: <span className="font-mono">{deliveryInfo?.statusText || "SENT"}</span>
                {deliveryInfo?.mode && ` via ${deliveryInfo.mode}`}
              </p>
              {(deliveryInfo?.mode === "twilio" || deliveryInfo?.mode === "twilio_sandbox") && (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50/80 p-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  💡 <strong>WhatsApp Delivery Guidance:</strong>
                  <br />
                  1. If using Twilio Sandbox, send your join code (e.g. <code>join ...</code>) to your Twilio number on WhatsApp once to opt-in.
                  <br />
                  2. If using standard Twilio messaging, send a message (e.g. <code>Hi</code>) to your Twilio number once to open the WhatsApp 24-hour delivery window.
                  <br />
                  3. Or click the link below to open and send directly via WhatsApp Web/App!
                </p>
              )}
              {deliveryInfo?.mode === "simulated" && (
                <p className="mt-2 rounded border border-blue-200 bg-blue-50/80 p-2 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
                  ℹ️ <strong>Simulated Prototype Send:</strong> Paste your real 32-character <code>TWILIO_AUTH_TOKEN</code> in <code>.env</code> to send automated WhatsApp messages from your Twilio account, or click below to send via WhatsApp Web!
                </p>
              )}
              {deliveryInfo?.waLink && (
                <div className="mt-2.5">
                  <a
                    href={deliveryInfo.waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-xs font-semibold text-green-800 underline hover:text-green-950 dark:text-green-200 dark:hover:text-white"
                  >
                    📲 Open directly in WhatsApp Web / App (wa.me)
                  </a>
                </div>
              )}
            </div>
          )}
          {status === "error" && (
            <div className="rounded border border-red-200 bg-red-50/50 p-2.5 text-sm dark:border-red-900/50 dark:bg-red-950/40">
              <p className="font-semibold text-red-800 dark:text-red-200">
                ⚠️ Sending failed: {deliveryInfo?.errorText || "Check API configuration and retry."}
              </p>
              {deliveryInfo?.errorText?.includes("verified recipient") && (
                <div className="mt-2 rounded bg-red-100/80 p-2 text-xs text-red-900 dark:bg-red-900/30 dark:text-red-200">
                  💡 <strong>Twilio Trial Requirement:</strong>
                  <br />
                  • Option 1 (WhatsApp Sandbox): Set <code>TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886</code> in <code>.env</code> and send your join code to <code>+1 415 523 8886</code> on WhatsApp.
                  <br />
                  • Option 2 (Twilio Console): Go to <em>Twilio Console &gt; Phone Numbers &gt; Verified Caller IDs</em> and add your number (<code>+91 7903327991</code>).
                </div>
              )}
              {deliveryInfo?.waLink && (
                <div className="mt-2">
                  <a
                    href={deliveryInfo.waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-xs font-medium text-red-800 underline hover:text-red-950 dark:text-red-200 dark:hover:text-white"
                  >
                    📲 Click to send directly via WhatsApp Web / App (wa.me)
                  </a>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={send}
              disabled={!selected || !phoneValid || status === "sending"}
              className="w-full sm:w-auto bg-red-600 font-semibold text-white hover:bg-red-600/90"
            >
              <Bot className="h-4 w-4" /> {status === "sending" ? "Sending Alert…" : "Send via Avhaan Bot"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
