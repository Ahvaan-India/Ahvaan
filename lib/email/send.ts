/**
 * Email alert sender (primary notification channel — replaces WhatsApp/SMS).
 *
 * Transport: SMTP via nodemailer, configured entirely by env so any provider
 * works (Gmail App Password, Outlook, SES SMTP, Mailtrap for dev):
 *
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true" for 465),
 *   SMTP_USER, SMTP_PASS, EMAIL_FROM ("Ahvaan <alerts@example.gov.in>")
 *
 * Behaviour:
 *  - Misconfigured env → fail-open `simulated` result (logged, never throws
 *    the request into a 500). The delivery row records SIMULATED_SENT so the
 *    audit trail stays honest about what actually left the building.
 *  - SMTP errors → FAILED with the provider message (auth failures name the
 *    exact env vars to check).
 */
import nodemailer from "nodemailer";
import { isValidEmail } from "./compose";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  alertId?: number | null;
  sentBy?: string | null;
}

export interface SendEmailResult {
  success: boolean;
  status: "SENT" | "FAILED" | "SIMULATED_SENT";
  messageId?: string | null;
  mode: "smtp" | "simulated";
  error?: string;
}

function isConfigured(val?: string): boolean {
  if (!val || typeof val !== "string") return false;
  const t = val.trim();
  return t.length > 0 && !t.toLowerCase().startsWith("your_") && !t.toLowerCase().includes("placeholder");
}

export function emailChannelStatus(): {
  configured: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!isConfigured(process.env.SMTP_HOST)) missing.push("SMTP_HOST");
  if (!isConfigured(process.env.SMTP_USER)) missing.push("SMTP_USER");
  if (!isConfigured(process.env.SMTP_PASS)) missing.push("SMTP_PASS");
  if (!isConfigured(process.env.EMAIL_FROM)) missing.push("EMAIL_FROM");
  return { configured: missing.length === 0, missing };
}

export async function sendEmailAlert(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const to = params.to.trim();
  if (!isValidEmail(to)) {
    return {
      success: false,
      status: "FAILED",
      mode: "simulated",
      error: "Recipient must be a valid email address.",
    };
  }
  if (!params.subject.trim() || !params.text.trim()) {
    return {
      success: false,
      status: "FAILED",
      mode: "simulated",
      error: "Subject and text body are required.",
    };
  }

  const { configured, missing } = emailChannelStatus();
  if (!configured) {
    console.log(
      `[email:simulated] to=${to} subject=${params.subject} (missing ${missing.join(", ")})`,
    );
    return { success: true, status: "SIMULATED_SENT", mode: "simulated" };
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    (process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || port === 465;

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.trim(),
      },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM!.trim(),
      to,
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {}),
    });

    return {
      success: true,
      status: "SENT",
      messageId: info.messageId ?? null,
      mode: "smtp",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const hint = /auth|credential|password|535|534|EAUTH/i.test(msg)
      ? `${msg} — verify SMTP_USER / SMTP_PASS (Gmail needs an App Password, not the login password).`
      : msg;
    return { success: false, status: "FAILED", mode: "smtp", error: hint };
  }
}
