import { NextResponse } from "next/server";
import { sendEmailAlert } from "@/lib/email/send";
import { isValidEmail } from "@/lib/email/compose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/alerts/send { ulid?, to?, subject?, message } — direct email alert dispatch.
 */
export async function POST(req: Request) {
  let body: { to?: unknown; subject?: unknown; message?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const to = typeof body.to === "string" && body.to.trim() ? body.to.trim() : "";

  if (!isValidEmail(to)) {
    return NextResponse.json({ error: "To must be a valid email address." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "message is required." }, { status: 400 });
  if (message.length > 2000) {
    return NextResponse.json({ error: "message must be under 2000 characters." }, { status: 400 });
  }

  try {
    const mail = await sendEmailAlert({
      to,
      subject:
        (typeof body.subject === "string" && body.subject.trim()) || "Ahvaan Heat Alert",
      text: message,
    });

    if (!mail.success) {
      return NextResponse.json(
        { error: `Email delivery failed (${mail.error ?? mail.mode}).` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { sent: true, to, simulated: mail.mode === "simulated", messageId: mail.messageId ?? null },
      { status: 200 },
    );
  } catch (err) {
    console.error("POST /api/alerts/send failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
