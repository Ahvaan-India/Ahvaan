"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_ALERT_EMAIL,
  composeAlertHtml,
  composeAlertSubject,
  isValidEmail,
} from "@/lib/email/compose";
import type { WardAlert } from "@/lib/alerts";
import type { Telemetry } from "./TelemetryPanel";

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

/**
 * Email alert modal. Everything is evaluated client-side (lib/alerts.ts):
 * the ward's level + triggers arrive as props, the operator ticks which
 * data blocks go into the email, and POST /api/email/send delivers it.
 * Nothing is saved anywhere — each send is fire-and-forget.
 */
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
}) {
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

  useEffect(() => {
    if (open) {
      setStatus("idle");
      setResult(null);
      setEmail((e) => e || DEFAULT_ALERT_EMAIL);
    }
  }, [open ]);

  const wardLabel =
    ward !== null ? `Ward ${ward}` : wardId !== null ? `Location ${wardId}` : "Ward";

  const message = useMemo(() => {
    const lines = [
      `Ahvaan ${evaluation?.level ?? "—"} Heat Alert`,
      `${wardLabel}${wardName ? ` · ${wardName}` : ""}`,
    ];
    if (blocks.summary && telemetry?.risk) {
      lines.push(`Risk ${(telemetry.risk.value * 100).toFixed(0)}/100 (${telemetry.risk.displayCategory})`);
    } else if (blocks.summary && evaluation) {
      lines.push(`Alert level: ${evaluation.level}`);
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
    if (blocks.drivers && evaluation && evaluation.triggers.length > 0)
      lines.push(`Triggers: ${evaluation.triggers.join("; ")}`);
    if (blocks.outlook && outlook.length > 0) {
      lines.push(
        "Next: " +
          outlook
            .slice(0, 5)
            .map((d) => `${d.date.slice(5)} ${(d.risk * 100).toFixed(0)}`)
            .join(", "),
      );
    }
    if (blocks.advisory && evaluation) lines.push(`Advisory: ${evaluation.advisory}`);
    lines.push("— Sent from the Ahvaan console (decision-support, not a clinical prediction)");
    return lines.join("\n");
  }, [evaluation, blocks, telemetry, outlook, wardLabel, wardName]);

  const subject = useMemo(() => {
    if (!evaluation || wardId === null) return "";
    return composeAlertSubject(
      {
        severity: evaluation.level,
        wardId,
        ward,
        wardName,
        riskScore: telemetry?.risk ? telemetry.risk.value : 0,
        wbgt: telemetry?.risk ? telemetry.risk.wbgt : null,
        peakWindowStart: null,
        peakWindowEnd: null,
        advisoryText: evaluation.advisory,
      },
      timezone,
    );
  }, [evaluation, wardId, ward, wardName, telemetry, timezone]);

  const html = useMemo(() => {
    if (!evaluation || wardId === null) return "";
    return composeAlertHtml(
      {
        severity: evaluation.level,
        wardId,
        ward: ward,
        wardName,
        riskScore: telemetry?.risk ? telemetry.risk.value : 0,
        wbgt: telemetry?.risk ? telemetry.risk.wbgt : null,
        peakWindowStart: null,
        peakWindowEnd: null,
        advisoryText: blocks.advisory ? evaluation.advisory : null,
      },
      timezone,
      {
        drivers: blocks.drivers ? evaluation.triggers.join("; ") : null,
        outlook:
          blocks.outlook && outlook.length > 0
            ? "Next: " +
              outlook.slice(0, 5).map((d) => `${d.date.slice(5)} ${(d.risk * 100).toFixed(0)}`).join(", ")
            : null,
      },
    );
  }, [evaluation, wardId, ward, wardName, telemetry, timezone, blocks, outlook]);

  if (!open) return null;

  const toggle = (k: BlockKey) => setBlocks((b) => ({ ...b, [k]: !b[k] }));

  const send = async () => {
    if (!isValidEmail(email) || wardId === null) return;
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
          {evaluation && (
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-bold">{evaluation.headline}</span>
              {evaluation.triggers.length > 0 && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {evaluation.triggers.join(" · ")}
                </span>
              )}
            </p>
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
            {!emailValid && (
              <span className="text-xs text-red-600">Enter a valid email address.</span>
            )}
          </label>
          <fieldset className="text-sm">
            <legend className="mb-1 text-muted-foreground">Data blocks to send</legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {BLOCKS.map((b) => (
                <label
                  key={b.key}
                  className="flex cursor-pointer items-center gap-2 rounded border border-border px-2 py-1.5"
                >
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
            <span className="mb-1 block text-muted-foreground">Email preview</span>
            <p className="mb-1 truncate rounded border border-border bg-secondary/40 px-2 py-1 font-mono text-xs">
              Subject: {subject || "—"}
            </p>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-secondary/40 p-2 font-mono text-xs">
              {message}
            </pre>
          </div>
          {status === "sent" && (
            <div className="rounded border border-green-200 bg-green-50/50 p-2.5 text-sm dark:border-green-900/50 dark:bg-green-950/40">
              <p className="font-semibold text-green-800 dark:text-green-200">
                ✅ Email sent ({result?.statusText || "SENT"} via {result?.mode || "smtp"})
                {result?.messageId ? ` · id ${result.messageId}` : ""}
              </p>
              {result?.mode === "simulated" && (
                <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                  Simulated send — set SMTP_HOST/SMTP_USER/SMTP_PASS/EMAIL_FROM in .env to deliver for real.
                </p>
              )}
            </div>
          )}
          {status === "error" && (
            <div className="rounded border border-red-200 bg-red-50/50 p-2.5 text-sm dark:border-red-900/50 dark:bg-red-950/40">
              <p className="font-semibold text-red-800 dark:text-red-200">
                ⚠️ Sending failed: {result?.errorText || "Check SMTP configuration and retry."}
              </p>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={send}
              disabled={wardId === null || !emailValid || status === "sending"}
              className="w-full sm:w-auto bg-red-600 font-semibold text-white hover:bg-red-600/90"
            >
              <Bot className="h-4 w-4" /> {status === "sending" ? "Sending…" : "Send Email Alert"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
