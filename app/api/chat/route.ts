import { NextResponse } from "next/server";
import {
  ASSISTANT_SYSTEM_PROMPT,
  callCloudflare,
  zoneSnapshot,
  type ChatMessage,
} from "@/lib/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE = 500;
const MAX_HISTORY = 6;

/**
 * POST /api/chat { message, ulid?, history? } — Ahvaan Assistant.
 * Stateless: nothing is stored. The selected zone's trusted snapshot is
 * attached server-side; the model answers only from it.
 */
export async function POST(req: Request) {
  let body: {
    message?: unknown;
    ulid?: unknown;
    history?: Array<{ role?: string; content?: string }>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { error: `message must be under ${MAX_MESSAGE} characters` },
      { status: 400 },
    );
  }
  const ulid = typeof body.ulid === "string" && body.ulid ? body.ulid : null;
  const history: ChatMessage[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (h) =>
            h &&
            (h.role === "user" || h.role === "assistant") &&
            typeof h.content === "string",
        )
        .slice(-MAX_HISTORY)
        .map((h) => ({
          role: h.role as "user" | "assistant",
          content: (h.content as string).slice(0, MAX_MESSAGE),
        }))
    : [];
  try {
    const snapshot = await zoneSnapshot(ulid);
    const contextNote = `Trusted AHVAAN zone data:\n${JSON.stringify(snapshot)}`;
    const answer = await callCloudflare([
      { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
      ...history,
      { role: "user", content: `${message}\n\n${contextNote}` },
    ]);
    return NextResponse.json({ answer }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("credentials are missing")) {
      return NextResponse.json(
        { error: "Assistant is not configured on the server." },
        { status: 533 },
      );
    }
    console.error("POST /api/chat failed:", msg);
    return NextResponse.json({ error: "Assistant unavailable right now." }, { status: 502 });
  }
}
