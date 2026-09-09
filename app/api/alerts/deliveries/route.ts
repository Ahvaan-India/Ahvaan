import { NextResponse } from "next/server";
import { createDelivery, getAlertById, getDeliveries } from "@/lib/db/queries";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/alerts/deliveries?alertId=…  broadcast history for one alert.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const alertId = Number(url.searchParams.get("alertId"));
  if (!Number.isInteger(alertId) || alertId <= 0) {
    return NextResponse.json(
      { error: "Provide ?alertId=<positive integer>" },
      { status: 400 },
    );
  }
  try {
    const rows = await getDeliveries(alertId);
    return NextResponse.json(
      {
        alertId,
        count: rows.length,
        deliveries: rows.map((d) => ({
          id: d.id,
          channel: d.channel,
          recipientPhone: d.recipientPhone,
          messageText: d.messageText,
          sentAt: d.sentAt,
          sentBy: d.sentBy,
          status: d.status,
        })),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("GET /api/alerts/deliveries failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/alerts/deliveries  Send WhatsApp alert details via Avhaan API / Meta API
 * or prototype fallback, and log the delivery status to the database.
 */
export async function POST(req: Request) {
  let body: {
    alertId?: number;
    recipientPhone?: string;
    messageText?: string;
    sentBy?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const phone = (body.recipientPhone ?? "").replace(/[^\d]/g, "");
  if (!phone || phone.length < 10 || phone.length > 15) {
    return NextResponse.json(
      { error: "recipientPhone must include country code (10–15 digits)" },
      { status: 400 },
    );
  }
  if (!body.messageText || body.messageText.trim().length === 0) {
    return NextResponse.json(
      { error: "messageText is required" },
      { status: 400 },
    );
  }
  if (body.alertId !== undefined && body.alertId !== null) {
    if (!Number.isInteger(body.alertId) || body.alertId <= 0) {
      return NextResponse.json(
        { error: "alertId must be a positive integer" },
        { status: 400 },
      );
    }
    const alert = await getAlertById(body.alertId);
    if (!alert) {
      return NextResponse.json(
        { error: "Alert not found", alertId: body.alertId },
        { status: 404 },
      );
    }
  }

  try {
    // Dispatch message through Avhaan WhatsApp API / Meta Cloud API / prototype engine
    const sendResult = await sendWhatsAppMessage({
      recipientPhone: phone,
      messageText: body.messageText,
      alertId: body.alertId ?? null,
      sentBy: body.sentBy ?? "ahvaan-bot",
    });

    const row = await createDelivery({
      alertId: body.alertId ?? null,
      recipientPhone: phone,
      messageText: body.messageText.slice(0, 1000),
      sentBy: body.sentBy?.slice(0, 100) ?? "ahvaan-bot",
      status: sendResult.status,
    });

    return NextResponse.json(
      {
        id: row.id,
        alertId: row.alertId,
        channel: row.channel,
        recipientPhone: row.recipientPhone,
        sentAt: row.sentAt,
        status: sendResult.status,
        mode: sendResult.mode,
        messageId: sendResult.messageId || null,
        waLink: sendResult.waLink,
        error: sendResult.error || null,
        note: sendResult.success
          ? sendResult.mode === "simulated"
            ? "Alert sent via prototype simulation. wa.me deep-link available for direct WhatsApp web dispatch."
            : `Alert successfully dispatched via ${sendResult.mode}.`
          : `WhatsApp dispatch failed: ${sendResult.error}`,
      },
      { status: sendResult.success ? 201 : 502 },
    );
  } catch (err) {
    console.error("POST /api/alerts/deliveries failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
