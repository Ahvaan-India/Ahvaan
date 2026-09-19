/**
 * Email alert composer. Builds the subject + plain-text + HTML bodies for a
 * heat alert from the same context the dashboard already has (no extra DB).
 */

export interface EmailAlertContext {
  severity: string; // EXTREME | HIGH | MODERATE | LOW
  wardId: number;
  ward: number | null;
  wardName: string | null;
  htsi?: number | null;
  wbgt: number | null;
  heatIndex?: number | null;
  utci?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  advisoryText: string | null;
}

/** Default recipient (operator inbox). Editable in the modal / env. */
export const DEFAULT_ALERT_EMAIL =
  process.env.ALERT_DEFAULT_EMAIL ?? "heat-officer@example.gov.in";

function wardLabel(ctx: EmailAlertContext): string {
  const base =
    ctx.ward !== null ? `Ward ${ctx.ward}` : `Location ${ctx.wardId}`;
  return ctx.wardName ? `${base} · ${ctx.wardName}` : base;
}

export function composeAlertSubject(
  ctx: EmailAlertContext,
  timeZone = "Asia/Kolkata",
): string {
  const sev =
    ctx.severity === "EXTREME"
      ? "EXTREME"
      : ctx.severity === "HIGH"
        ? "HIGH"
        : ctx.severity === "MODERATE"
          ? "MODERATE"
          : "LOW";
  return `[Ahvaan ${sev} Heat Advisory] ${wardLabel(ctx)}`;
}

export function composeAlertText(
  ctx: EmailAlertContext,
  timeZone = "Asia/Kolkata",
  extraBlocks?: { drivers?: string | null; outlook?: string | null },
): string {
  const sev =
    ctx.severity === "EXTREME"
      ? "Extreme"
      : ctx.severity === "HIGH"
        ? "High"
        : ctx.severity === "MODERATE"
          ? "Moderate"
          : "Low";

  const lines = [
    `Ahvaan ${sev.toUpperCase()} HEAT ADVISORY`,
    wardLabel(ctx),
    "",
    `Heat Safety Category: ${sev}`,
  ];
  const metrics: string[] = [];
  if (ctx.htsi !== null && ctx.htsi !== undefined)
    metrics.push(`HTSI ${ctx.htsi.toFixed(1)}/100`);
  if (ctx.wbgt !== null && ctx.wbgt !== undefined)
    metrics.push(`WBGT ${ctx.wbgt.toFixed(1)}°C`);
  if (ctx.heatIndex !== null && ctx.heatIndex !== undefined)
    metrics.push(`Heat Index ${ctx.heatIndex.toFixed(1)}°C`);
  if (ctx.utci !== null && ctx.utci !== undefined)
    metrics.push(`UTCI ${ctx.utci.toFixed(1)}°C`);
  if (ctx.temperature !== null && ctx.temperature !== undefined)
    metrics.push(`Temp ${ctx.temperature.toFixed(1)}°C`);
  if (ctx.humidity !== null && ctx.humidity !== undefined)
    metrics.push(`Humidity ${ctx.humidity.toFixed(0)}%`);

  if (metrics.length > 0) lines.push(`Indicators: ${metrics.join(" · ")}`);
  if (extraBlocks?.drivers) lines.push("", `Key Drivers: ${extraBlocks.drivers}`);
  if (extraBlocks?.outlook) lines.push("", `5-Day Outlook: ${extraBlocks.outlook}`);
  if (ctx.advisoryText) lines.push("", `Recommended Safety Actions: ${ctx.advisoryText}`);
  lines.push(
    "",
    "—",
    "Sent by the Ahvaan heat safety console. Decision-support index, not a clinical prediction.",
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
  const sev =
    ctx.severity === "EXTREME"
      ? "Extreme"
      : ctx.severity === "HIGH"
        ? "High"
        : ctx.severity === "MODERATE"
          ? "Moderate"
          : "Low";

  const color =
    ctx.severity === "EXTREME"
      ? "#991b1b"
      : ctx.severity === "HIGH"
        ? "#ef4444"
        : ctx.severity === "MODERATE"
          ? "#d97706"
          : "#14b8a6";

  const metrics: string[] = [];
  if (ctx.htsi !== null && ctx.htsi !== undefined)
    metrics.push(`HTSI ${ctx.htsi.toFixed(1)}/100`);
  if (ctx.wbgt !== null && ctx.wbgt !== undefined)
    metrics.push(`WBGT ${ctx.wbgt.toFixed(1)}°C`);
  if (ctx.heatIndex !== null && ctx.heatIndex !== undefined)
    metrics.push(`Heat Index ${ctx.heatIndex.toFixed(1)}°C`);
  if (ctx.utci !== null && ctx.utci !== undefined)
    metrics.push(`UTCI ${ctx.utci.toFixed(1)}°C`);
  if (ctx.temperature !== null && ctx.temperature !== undefined)
    metrics.push(`Temp ${ctx.temperature.toFixed(1)}°C`);
  if (ctx.humidity !== null && ctx.humidity !== undefined)
    metrics.push(`Humidity ${ctx.humidity.toFixed(0)}%`);

  return `<div style="font-family:sans-serif;max-width:560px;color:#1e293b;border:1px solid #e2e8f0;border-radius:12px;padding:20px;background:#ffffff">
  <div style="border-bottom:2px solid ${color};padding-bottom:12px;margin-bottom:16px">
    <h2 style="color:${color};margin:0 0 4px;font-size:20px;font-weight:800">Ahvaan ${sev} Heat Advisory</h2>
    <p style="margin:0;color:#64748b;font-size:14px;font-weight:600">${esc(wardLabel(ctx))}</p>
  </div>

  <div style="margin-bottom:16px">
    <span style="display:inline-block;background:${color};color:#ffffff;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;text-transform:uppercase">
      Category: ${sev}
    </span>
  </div>

  ${
    metrics.length > 0
      ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px">
          <strong style="color:#334155">Current Microclimate & Thermal Indicators:</strong>
          <div style="margin-top:6px;color:#475569;line-height:1.5">${esc(metrics.join("  ·  "))}</div>
        </div>`
      : ""
  }

  ${
    extraBlocks?.drivers
      ? `<div style="margin-bottom:12px;font-size:13px"><strong style="color:#334155">Triggers & Drivers:</strong> ${esc(extraBlocks.drivers)}</div>`
      : ""
  }
  ${
    extraBlocks?.outlook
      ? `<div style="margin-bottom:12px;font-size:13px"><strong style="color:#334155">5-Day Outlook:</strong> ${esc(extraBlocks.outlook)}</div>`
      : ""
  }
  ${
    ctx.advisoryText
      ? `<div style="background:${color}15;border-left:4px solid ${color};padding:12px;border-radius:6px;margin-bottom:16px;font-size:13px;color:#0f172a">
          <strong style="color:${color}">Recommended Safety Actions:</strong>
          <div style="margin-top:4px;line-height:1.5">${esc(ctx.advisoryText)}</div>
        </div>`
      : ""
  }

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0 12px" />
  <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.4">
    Sent by the Ahvaan Heat Safety Console. Decision-support system for municipal heat resilience.
  </p>
</div>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** True when `email` is a deliverable-looking address (format check only). */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
