import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { mintSession, normalizeEmail, sessionCookie } from "@/lib/auth";
import { otps, users } from "@/lib/mongo/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

/**
 * POST /api/auth/verify-otp { email, code } — verifies the latest live OTP,
 * upserts the user, and sets the signed session cookie.
 */
export async function POST(req: Request) {
  let body: { email?: unknown; code?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) {
    return NextResponse.json(
      { error: "Valid email and 6-digit code are required." },
      { status: 400 },
    );
  }
  try {
    const codes = await otps();
    const row = await codes.findOne(
      { email, consumed: false, expiresAt: { $gt: new Date() } },
      { sort: { createdAt: -1 } },
    );
    if (!row) {
      return NextResponse.json(
        { error: "No live code for this address. Request a new one." },
        { status: 401 },
      );
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many attempts. Request a new code." },
        { status: 429 },
      );
    }
    const hash = createHash("sha256").update(`${email}:${code}`).digest("hex");
    if (hash !== row.codeHash) {
      await codes.updateOne(
        { _id: row._id },
        { $set: { attempts: row.attempts + 1 } },
      );
      return NextResponse.json({ error: "Wrong code. Try again." }, { status: 401 });
    }
    await codes.updateOne({ _id: row._id }, { $set: { consumed: true } });
    const now = new Date();
    await (await users()).updateOne(
      { email },
      {
        $set: { lastLoginAt: now },
        $setOnInsert: { email, createdAt: now },
      },
      { upsert: true },
    );
    const res = NextResponse.json({ email }, { status: 200 });
    res.headers.set("Set-Cookie", sessionCookie(mintSession(email)));
    return res;
  } catch (err) {
    console.error("POST /api/auth/verify-otp failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
