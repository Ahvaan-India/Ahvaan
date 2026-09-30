import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { normalizeEmail } from "@/lib/auth";
import { sendEmailAlert } from "@/lib/email/send";
import { otps } from "@/lib/mongo/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTP_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;

/**
 * POST /api/auth/request-otp { email } — creates a 6-digit OTP (Mongo) and
 * sends it by email (SMTP, or logged simulated fallback). `devOtp` is
 * included only for simulated sends outside production.
 */
export async function POST(req: Request) {
  let body: { email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json(
      { error: "Invalid email address." },
      { status: 400 },
    );
  }
  try {
    const codes = await otps();
    const recent = await codes.findOne(
      { email, createdAt: { $gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
      { sort: { createdAt: -1 } },
    );
    if (recent && !recent.consumed) {
      return NextResponse.json(
        { error: "Code already sent. Please wait a minute before retrying." },
        { status: 429 },
      );
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = createHash("sha256").update(`${email}:${code}`).digest("hex");
    await codes.insertOne({
      email,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      consumed: false,
      createdAt: new Date(),
    });
    const mail = await sendEmailAlert({
      to: email,
      subject: "Your Ahvaan login code",
      text: `Your Ahvaan login code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`,
    });
    if (!mail.success) {
      return NextResponse.json(
        { error: `Email delivery failed (${mail.error ?? mail.mode}). Try again.` },
        { status: 502 },
      );
    }
    const simulated = mail.mode === "simulated";
    return NextResponse.json(
      {
        sent: true,
        simulated,
        ...(simulated && process.env.NODE_ENV !== "production"
          ? { devOtp: code }
          : {}),
      },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("MONGO_URL")) {
      return NextResponse.json(
        { error: "Auth store missing. Set MONGO_URL and run `npm run auth:setup`." },
        { status: 500 },
      );
    }
    console.error("POST /api/auth/request-otp failed:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
