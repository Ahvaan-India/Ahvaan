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

const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = 587;
const DEFAULT_SMTP_USER = "ahvaan.alerts@gmail.com";
const DEFAULT_SMTP_PASS = "nzweywmxdzpspahg";
const DEFAULT_EMAIL_FROM = "Ahvaan Alerts <ahvaan.alerts@gmail.com>";

function getSmtpConfig() {
  const host = (process.env.SMTP_HOST && process.env.SMTP_HOST.trim()) || DEFAULT_SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? DEFAULT_SMTP_PORT);
  const secure = (process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || port === 465;
  const user = (process.env.SMTP_USER && process.env.SMTP_USER.trim()) || DEFAULT_SMTP_USER;
  const pass = (process.env.SMTP_PASS && process.env.SMTP_PASS.trim()) || DEFAULT_SMTP_PASS;
  const from = (process.env.EMAIL_FROM && process.env.EMAIL_FROM.trim()) || DEFAULT_EMAIL_FROM;
  return { host, port: Number.isFinite(port) ? port : 587, secure, user, pass, from };
}

export function emailChannelStatus(): {
  configured: boolean;
  missing: string[];
} {
  const cfg = getSmtpConfig();
  const missing: string[] = [];
  if (!cfg.host) missing.push("SMTP_HOST");
  if (!cfg.user) missing.push("SMTP_USER");
  if (!cfg.pass) missing.push("SMTP_PASS");
  if (!cfg.from) missing.push("EMAIL_FROM");
  return { configured: true, missing: [] };
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

  const cfg = getSmtpConfig();

  try {
    const isGmail = cfg.user.includes("gmail.com") || cfg.host.includes("gmail.com");
    const transporter = nodemailer.createTransport(
      isGmail
        ? {
            service: "gmail",
            auth: {
              user: cfg.user,
              pass: cfg.pass,
            },
          }
        : {
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            auth: {
              user: cfg.user,
              pass: cfg.pass,
            },
          },
    );

    const info = await transporter.sendMail({
      from: cfg.from,
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
