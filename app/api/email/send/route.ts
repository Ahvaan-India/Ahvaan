import { NextResponse } from "next/server";
import { sendEmailAlert } from "@/lib/email/send";
import { isValidEmail } from "@/lib/email/compose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/email/send  Send one alert email. Stateless: nothing is saved
 * to the DB (no deliveries table — alerts are evaluated client-side per
 * lib/alerts.ts and each send is fire-and-forget).
 * Expects JSON: { recipientEmail, subject?, messageText, html? }
 */
export async function POST(req: Request) {
  let body: {
    recipientEmail?: string;
    subject?: string;
    messageText?: string;
    html?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const to = (body.recipientEmail ?? "").trim();
  if (!isValidEmail(to)) {
    return NextResponse.json(
      { error: "recipientEmail must be a valid email address" },
      { status: 400 },
    );
  }
  if (!body.messageText || body.messageText.trim().length === 0) {
    return NextResponse.json(
      { error: "messageText is required" },
      { status: 400 },
    );
  }

  try {
    const sendResult = await sendEmailAlert({
      to,
      subject: body.subject?.trim() || "Ahvaan Heat Alert",
      text: body.messageText,
      html: body.html,
    });

    return NextResponse.json(
      {
        success: sendResult.success,
        status: sendResult.status,
        mode: sendResult.mode,
        messageId: sendResult.messageId || null,
        error: sendResult.error || null,
      },
      { status: sendResult.success ? 200 : 502 },
    );
  } catch (err) {
    console.error("POST /api/email/send failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
