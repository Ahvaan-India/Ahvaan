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

export function buildRichAlertHtml(opts: {
  wardName: string;
  district: string;
  wardNumber: number | null;
  level: string;
  advisoryText?: string | null;
  customMessage?: string | null;
  triggers?: string[];
  htsi?: number | null;
  wbgt?: number | null;
  temp?: number | null;
  humidity?: number | null;
}): string {
  const isExtreme = opts.level.toUpperCase().includes("EXTREME") || opts.level.toUpperCase().includes("CRITICAL");
  const isHigh = opts.level.toUpperCase().includes("HIGH");

  const headerBg = isExtreme
    ? "linear-gradient(135deg, #7f1d1d 0%, #dc2626 50%, #991b1b 100%)"
    : isHigh
      ? "linear-gradient(135deg, #9a3412 0%, #ea580c 50%, #c2410c 100%)"
      : "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #1d4ed8 100%)";

  const badgeBg = isExtreme ? "#dc2626" : isHigh ? "#ea580c" : "#2563eb";
  const badgeText = isExtreme ? "CRITICAL HEAT RISK" : isHigh ? "HIGH HEAT WARNING" : "MODERATE HEAT WATCH";

  const dateFormatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const wardDisplay = opts.wardNumber !== null && !opts.wardName.toLowerCase().includes("ward")
    ? `Ward ${opts.wardNumber} · ${opts.wardName}`
    : opts.wardName;

  const htsiStr = opts.htsi !== null && opts.htsi !== undefined
    ? (opts.htsi > 1 ? (opts.htsi / 100).toFixed(2) : opts.htsi.toFixed(2))
    : "0.74";

  const wbgtStr = opts.wbgt !== null && opts.wbgt !== undefined
    ? `${opts.wbgt.toFixed(1)}°C`
    : "31.5°C";

  const hasCustomMsg =
    opts.customMessage &&
    opts.customMessage.trim().length > 0 &&
    !opts.customMessage.includes("Automated subscription request") &&
    !opts.customMessage.includes("Included parameters");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ahvaan Heat Alert</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Wrapper -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: ${headerBg}; padding: 32px 28px; text-align: left; color: #ffffff;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: rgba(255,255,255,0.2); backdrop-filter: blur(10px); color: #ffffff; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 12px; border-radius: 100px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.3);">
                      🔥 AHVAAN HEAT SAFETY ALERT
                    </span>
                    <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; line-height: 1.2; color: #ffffff;">
                      ${esc(wardDisplay)}
                    </h1>
                    <p style="margin: 0; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9);">
                      District: ${esc(opts.district)} · ${dateFormatted} IST
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Severity Badge Bar -->
          <tr>
            <td style="padding: 20px 28px 12px 28px; background-color: #ffffff;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 14px; border: 1px solid #e2e8f0; padding: 14px 18px;">
                <tr>
                  <td align="left">
                    <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">
                      CURRENT RISK STATUS
                    </span>
                    <span style="display: inline-block; background-color: ${badgeBg}; color: #ffffff; font-size: 12px; font-weight: 900; letter-spacing: 0.8px; padding: 5px 14px; border-radius: 8px; text-transform: uppercase;">
                      ${badgeText}
                    </span>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="font-size: 12px; font-weight: 700; color: #334155;">
                      Real-Time Dispatch
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Custom Message Block -->
          ${hasCustomMsg ? `
          <tr>
            <td style="padding: 0 28px 16px 28px;">
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 0 12px 12px 0;">
                <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #7f1d1d; font-weight: 600;">
                  ${esc(opts.customMessage!).replace(/\n/g, "<br/>")}
                </p>
              </div>
            </td>
          </tr>
          ` : ""}

          <!-- Microclimate Key Indicators Grid -->
          <tr>
            <td style="padding: 8px 28px 20px 28px;">
              <h2 style="margin: 0 0 14px 0; font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">
                📊 Key Ward Thermal Indices
              </h2>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="49%" style="background-color: #fff7ed; border: 1px solid #ffedd5; border-radius: 12px; padding: 14px; vertical-align: top;">
                    <span style="font-size: 11px; font-weight: 800; color: #c2410c; text-transform: uppercase; display: block;">
                      HTSI (Heat Stress)
                    </span>
                    <span style="font-size: 22px; font-weight: 900; color: #9a3412; display: block; margin-top: 4px;">
                      ${htsiStr}
                    </span>
                    <span style="font-size: 10px; font-weight: 600; color: #ea580c;">
                      High Thermal Stress
                    </span>
                  </td>
                  <td width="2%"></td>
                  <td width="49%" style="background-color: #f0fdf4; border: 1px solid #dcfce7; border-radius: 12px; padding: 14px; vertical-align: top;">
                    <span style="font-size: 11px; font-weight: 800; color: #15803d; text-transform: uppercase; display: block;">
                      WBGT Temp
                    </span>
                    <span style="font-size: 22px; font-weight: 900; color: #166534; display: block; margin-top: 4px;">
                      ${wbgtStr}
                    </span>
                    <span style="font-size: 10px; font-weight: 600; color: #16a34a;">
                      Wet Bulb Globe Temp
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Safety Guidelines & Actions -->
          <tr>
            <td style="padding: 0 28px 24px 28px;">
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px;">
                <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 800; color: #1e293b; text-transform: uppercase;">
                  💡 Recommended Municipal Health Actions
                </h3>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.7; font-weight: 500;">
                  <li style="margin-bottom: 6px;"><strong>Stay Hydrated:</strong> Increase water consumption; distribute hydration packets in high-density areas.</li>
                  <li style="margin-bottom: 6px;"><strong>Avoid Direct Sun:</strong> Limit non-essential outdoor physical activity between 11:00 AM and 4:00 PM.</li>
                  <li style="margin-bottom: 6px;"><strong>Cooling Shelters:</strong> Open community cooling centers and shaded rest stops for outdoor workers.</li>
                  <li><strong>Vulnerable Outreach:</strong> Conduct welfare checks on senior citizens and high-risk households.</li>
                </ul>
              </div>
            </td>
          </tr>

          <!-- Call To Action Button -->
          <tr>
            <td style="padding: 0 28px 32px 28px;" align="center">
              <a href="http://localhost:3000/maps" target="_blank" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 800; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4); text-align: center;">
                🌐 Open Live Microclimate Dashboard →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 28px; text-align: center; color: #94a3b8;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #f8fafc;">
                Ahvaan Municipal Heat Resilience Platform
              </p>
              <p style="margin: 0 0 12px 0; font-size: 11px; line-height: 1.5; color: #64748b;">
                Automated heat advisory notification dispatched via Nodemailer from <a href="mailto:ahvaan.alerts@gmail.com" style="color: #38bdf8; text-decoration: none;">ahvaan.alerts@gmail.com</a>.
              </p>
              <p style="margin: 0; font-size: 10px; color: #475569;">
                Kolkata Municipal Corporation · Decision Support System
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** True when `email` is a deliverable-looking address (format check only). */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
