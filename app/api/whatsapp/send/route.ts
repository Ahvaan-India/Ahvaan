import { NextResponse } from "next/server";
import { createDelivery } from "@/lib/db/queries";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/whatsapp/send  Direct Avhaan WhatsApp API sending route.
 * Expects JSON: { recipientPhone: string, messageText: string, alertId?: number, sentBy?: string }
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
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
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

  try {
    const sendResult = await sendWhatsAppMessage({
      recipientPhone: phone,
      messageText: body.messageText,
      alertId: body.alertId ?? null,
      sentBy: body.sentBy ?? "ahvaan-bot",
    });

    let deliveryId: number | null = null;
    try {
      const row = await createDelivery({
        alertId: body.alertId ?? null,
        recipientPhone: phone,
        messageText: body.messageText.slice(0, 1000),
        sentBy: body.sentBy?.slice(0, 100) ?? "ahvaan-bot",
        status: sendResult.status,
      });
      deliveryId = row.id;
    } catch (dbErr) {
      console.warn("Delivery audit logging failed:", dbErr);
    }

    return NextResponse.json(
      {
        success: sendResult.success,
        deliveryId,
        status: sendResult.status,
        mode: sendResult.mode,
        messageId: sendResult.messageId || null,
        waLink: sendResult.waLink,
        error: sendResult.error || null,
      },
      { status: sendResult.success ? 200 : 502 },
    );
  } catch (err) {
    console.error("POST /api/whatsapp/send failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
