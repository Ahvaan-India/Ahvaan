import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST() {
  const res = NextResponse.json({ loggedOut: true }, { status: 200 });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
