import { NextResponse } from "next/server";
import { sessionEmailFrom } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me — current session email, or { email: null }. */
export async function GET(req: Request) {
  return NextResponse.json(
    { email: sessionEmailFrom(req) },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
