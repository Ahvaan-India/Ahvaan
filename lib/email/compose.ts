/**
 * Email alert composer. Builds the subject + plain-text + HTML bodies for a
 * heat alert from the same context the dashboard already has (no extra DB).
 */

export interface EmailAlertContext {
  severity: string; // HIGH | EXTREME
  wardId: number;
  ward: number | null;
  wardName: string | null;
  riskScore: number;
  wbgt: number | null;
  heatIndex?: number | null;
  peakWindowStart: string | null;
  peakWindowEnd: string | null;
  advisoryText: string | null;
}

/** Default recipient (operator inbox). Editable in the modal / env. */
export const DEFAULT_ALERT_EMAIL =
  process.env.ALERT_DEFAULT_EMAIL ?? "heat-officer@example.gov.in";

function fmtWindow(
  start: string | null,
  end: string | null,
  timeZone: string,
): string | null {
  if (!start || !end) return null;
  try {
    const f = new Intl.DateTimeFormat("en-IN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${f.format(new Date(start))}–${f.format(new Date(end))} (${timeZone})`;
  } catch {
    return null;
  }
}

function wardLabel(ctx: EmailAlertContext): string {
  const base =
    ctx.ward !== null ? `Ward ${ctx.ward}` : `Location ${ctx.wardId}`;
  return ctx.wardName ? `${base} · ${ctx.wardName}` : base;
}

export function composeAlertSubject(
  ctx: EmailAlertContext,
  timeZone = "Asia/Kolkata",
): string {
  const sev = ctx.severity === "EXTREME" ? "EXTREME" : "HIGH";
  const window = fmtWindow(ctx.peakWindowStart, ctx.peakWindowEnd, timeZone);
  return `[Ahvaan ${sev} Heat Alert] ${wardLabel(ctx)}${window ? ` · peak ${window}` : ""}`;
}

export function composeAlertText(
  ctx: EmailAlertContext,
  timeZone = "Asia/Kolkata",
  extraBlocks?: { drivers?: string | null; outlook?: string | null },
): string {
  const sev = ctx.severity === "EXTREME" ? "EXTREME" : "HIGH";
  const lines = [
    `Ahvaan ${sev} HEAT ALERT`,
    wardLabel(ctx),
    "",
    `Risk score: ${(ctx.riskScore * 100).toFixed(0)}/100`,
  ];
  const metrics: string[] = [];
  if (ctx.wbgt !== null && ctx.wbgt !== undefined)
    metrics.push(`WBGT ${ctx.wbgt.toFixed(1)}°C`);
  if (ctx.heatIndex !== null && ctx.heatIndex !== undefined)
    metrics.push(`Heat Index ${ctx.heatIndex.toFixed(1)}°C`);
  if (metrics.length > 0) lines.push(metrics.join(" · "));
  const window = fmtWindow(ctx.peakWindowStart, ctx.peakWindowEnd, timeZone);
  if (window) lines.push(`Peak heat window: ${window}`);
  if (extraBlocks?.drivers) lines.push("", `Why: ${extraBlocks.drivers}`);
  if (extraBlocks?.outlook) lines.push("", `Outlook: ${extraBlocks.outlook}`);
  if (ctx.advisoryText) lines.push("", `Advisory: ${ctx.advisoryText}`);
  lines.push(
    "",
    "—",
    "Sent by the Ahvaan heat-risk console. This is a decision-support index, not a clinical prediction.",
  );
  return lines.join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function composeAlertHtml(
  ctx: EmailAlertContext,
  timeZone = "Asia/Kolkata",
  extraBlocks?: { drivers?: string | null; outlook?: string | null },
): string {
  const sev = ctx.severity === "EXTREME" ? "EXTREME" : "HIGH";
  const color = ctx.severity === "EXTREME" ? "#991b1b" : "#ea580c";
  const window = fmtWindow(ctx.peakWindowStart, ctx.peakWindowEnd, timeZone);
  const metrics: string[] = [];
  if (ctx.wbgt !== null && ctx.wbgt !== undefined)
    metrics.push(`WBGT ${ctx.wbgt.toFixed(1)}°C`);
  if (ctx.heatIndex !== null && ctx.heatIndex !== undefined)
    metrics.push(`Heat Index ${ctx.heatIndex.toFixed(1)}°C`);
  return `<div style="font-family:sans-serif;max-width:560px">
  <h2 style="color:${color};margin:0 0 4px">Ahvaan ${sev} Heat Alert</h2>
  <p style="margin:0 0 12px"><strong>${esc(wardLabel(ctx))}</strong></p>
  <p style="font-size:20px;margin:0 0 8px">Risk score: <strong>${(ctx.riskScore * 100).toFixed(0)}/100</strong></p>
  ${metrics.length > 0 ? `<p style="margin:0 0 8px">${esc(metrics.join(" · "))}</p>` : ""}
  ${window ? `<p style="margin:0 0 8px">Peak heat window: <strong>${esc(window)}</strong></p>` : ""}
  ${extraBlocks?.drivers ? `<p style="margin:0 0 8px">Why: ${esc(extraBlocks.drivers)}</p>` : ""}
  ${extraBlocks?.outlook ? `<p style="margin:0 0 8px">Outlook: ${esc(extraBlocks.outlook)}</p>` : ""}
  ${ctx.advisoryText ? `<p style="margin:0 0 8px">Advisory: ${esc(ctx.advisoryText)}</p>` : ""}
  <hr style="border:none;border-top:1px solid #ddd;margin:16px 0 8px" />
  <p style="color:#666;font-size:12px;margin:0">Sent by the Ahvaan heat-risk console. Decision-support index, not a clinical prediction.</p>
</div>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** True when `email` is a deliverable-looking address (format check only). */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
