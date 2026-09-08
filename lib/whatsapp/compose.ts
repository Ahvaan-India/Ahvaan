/**
 * WhatsApp prototype: Click to Chat deep-link composer.
 * No Business API, no keys — builds a wa.me URL the operator opens, then
 * sends inside WhatsApp itself. Delivery logging happens separately via
 * POST /api/alerts/deliveries (initiation only, no receipts).
 */

/** Prototype default recipient (operator test number, E.164 digits). Editable in the modal. */
export const DEFAULT_TEST_NUMBER = "919830000000";

export function buildWhatsAppLink(phone: string, message: string): string {
  const cleanPhone = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export interface AlertContext {
  severity: string; // HIGH | EXTREME
  wardId: number;
  ward: number | null;
  wardName: string | null;
  riskScore: number;
  wbgt: number | null;
  peakWindowStart: string | null;
  peakWindowEnd: string | null;
  advisoryText: string | null;
}

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

/** Auto-composed advisory message (editable preview in the modal). */
export function composeAlertMessage(ctx: AlertContext, timeZone: string): string {
  const sev = ctx.severity === "EXTREME" ? "EXTREME" : "HIGH";
  const emoji = ctx.severity === "EXTREME" ? "🔴" : "🟠";
  const wardLine =
    ctx.ward !== null ? `Ward ${ctx.ward}` : `Location ${ctx.wardId}`;
  const name = ctx.wardName ? ` · ${ctx.wardName}` : "";
  const start = fmtHour(ctx.peakWindowStart, timeZone);
  const end = fmtHour(ctx.peakWindowEnd, timeZone);
  const lines = [
    `${emoji} Ahvaan — ${sev} Alert`,
    `${wardLine}${name}`,
  ];
  if (start && end) lines.push(`Peak heat window: ${start}–${end} (${timeZone})`);
  const metrics: string[] = [];
  if (ctx.wbgt !== null) metrics.push(`WBGT ${ctx.wbgt.toFixed(1)}°C`);
  metrics.push(`Risk ${(ctx.riskScore * 100).toFixed(0)}/100`);
  lines.push(metrics.join(" · "));
  if (ctx.advisoryText) lines.push(`Advisory: ${ctx.advisoryText}`);
  return lines.join("\n");
}
