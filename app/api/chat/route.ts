import { NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/chatbot/prompt";
import { buildWardContext } from "@/lib/chatbot/context";
import { callCloudflare, type ChatMessage } from "@/lib/chatbot/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE = 500;
const MAX_HISTORY = 6;

/**
 * POST /api/chat  Ahvaan Assistant (Cloudflare Workers AI).
 * Body: { message: string, locationId?: number,
 *         history?: [{ role: "user"|"assistant", content: string }] }
 * Stateless: nothing is stored. The selected ward's trusted context is
 * attached server-side; the model answers only from it (see prompt).
 */
export async function POST(req: Request) {
  let body: {
    message?: string;
    locationId?: number;
    history?: Array<{ role?: string; content?: string }>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { error: `message must be under ${MAX_MESSAGE} characters` },
      { status: 400 },
    );
  }
  const locationId =
    typeof body.locationId === "number" &&
    Number.isInteger(body.locationId) &&
    body.locationId > 0
      ? body.locationId
      : null;

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
          content: h.content!.slice(0, MAX_MESSAGE),
        }))
    : [];

  try {
    let contextNote = "No ward selected. Answer general AHVAAN/how-it-works questions only; for ward facts ask which ward.";
    if (locationId !== null) {
      const ctx = await buildWardContext(locationId);
      contextNote = ctx
        ? `Trusted AHVAAN ward data:\n${JSON.stringify(ctx)}`
        : "The selected ward has no computable data. Reply exactly: \"That information is not available for this ward.\"";
    }

    const answer = await callCloudflare([
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: `${message}\n\n${contextNote}` },
    ]);

    return NextResponse.json(
      { answer, locationId },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("credentials are missing")) {
      return NextResponse.json(
        {
          error:
            "Chat is not configured (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing).",
        },
        { status: 503 },
      );
    }
    console.error("POST /api/chat failed:", msg);
    return NextResponse.json(
      { error: "Assistant is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }
}
