import twilio from "twilio";
import { buildWhatsAppLink } from "./compose";

export interface SendWhatsAppParams {
  recipientPhone: string;
  messageText: string;
  alertId?: number | null;
  sentBy?: string | null;
}

export interface SendWhatsAppResult {
  success: boolean;
  status: "SENT" | "DELIVERED" | "FAILED" | "SIMULATED_SENT";
  messageId?: string | null;
  mode: "twilio" | "wati" | "meta_cloud" | "avhaan_gateway" | "simulated";
  waLink: string;
  error?: string;
}

/** Default Twilio WhatsApp Sandbox Sender Number */
const DEFAULT_TWILIO_SANDBOX_NUMBER = "+14155238886";

function isConfigured(val?: string): boolean {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.toLowerCase().startsWith("your_")) return false;
  if (trimmed.toLowerCase().includes("placeholder")) return false;
  return true;
}

/**
 * Sends a WhatsApp alert message to a recipient.
 * Supports:
 *  1. Twilio WhatsApp API SDK (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN) with ContentSid & Body
 *  2. WATI.io API (WATI_API_ENDPOINT + WATI_ACCESS_TOKEN)
 *  3. Meta WhatsApp Business Cloud API (WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID)
 *  4. Custom Avhaan WhatsApp Gateway (WHATSAPP_API_URL)
 *  5. Prototype mode fallback (logs initiation & returns deep link)
 */
export async function sendWhatsAppMessage(
  params: SendWhatsAppParams,
): Promise<SendWhatsAppResult> {
  const cleanPhone = params.recipientPhone.replace(/[^\d]/g, "");
  if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 15) {
    return {
      success: false,
      status: "FAILED",
      mode: "simulated",
      waLink: "",
      error: "Recipient phone number must include country code (10–15 digits).",
    };
  }

  const waLink = buildWhatsAppLink(cleanPhone, params.messageText);

  // Twilio credentials
  const twilioAccountSid =
    process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
  const twilioAuthToken =
    process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN;
  const twilioFromRaw =
    process.env.TWILIO_WHATSAPP_NUMBER ||
    process.env.TWILIO_FROM_NUMBER ||
    DEFAULT_TWILIO_SANDBOX_NUMBER;
  const twilioContentSid = process.env.TWILIO_CONTENT_SID;

  // WATI.io credentials
  const watiEndpoint =
    process.env.WATI_API_ENDPOINT ||
    process.env.WATI_BASE_URL ||
    process.env.WATI_URL;
  const watiToken =
    process.env.WATI_ACCESS_TOKEN ||
    process.env.WATI_BEARER_TOKEN ||
    process.env.WATI_TOKEN;

  // Meta Cloud API & Custom Gateway credentials
  const token =
    process.env.WHATSAPP_API_TOKEN ||
    process.env.AVHAAN_WHATSAPP_TOKEN ||
    process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const customApiUrl =
    process.env.WHATSAPP_API_URL || process.env.AVHAAN_WHATSAPP_API_URL;

  // 1. Twilio WhatsApp SDK Integration
  if (
    isConfigured(twilioAccountSid) &&
    isConfigured(twilioAuthToken) &&
    twilioAccountSid?.trim() !== twilioAuthToken?.trim()
  ) {
    try {
      const client = twilio(twilioAccountSid!.trim(), twilioAuthToken!.trim());

      const toFormatted = `whatsapp:+${cleanPhone}`;
      const fromPhoneDigits = twilioFromRaw.replace(/[^\d+]/g, "");
      const fromFormatted = fromPhoneDigits.startsWith("whatsapp:")
        ? fromPhoneDigits
        : `whatsapp:${fromPhoneDigits.startsWith("+") ? fromPhoneDigits : `+${fromPhoneDigits}`}`;

      const payload: Record<string, string> = {
        to: toFormatted,
        from: fromFormatted,
      };

      if (isConfigured(twilioContentSid)) {
        payload.contentSid = twilioContentSid!.trim();
      } else {
        payload.body = params.messageText;
      }

      const message = await client.messages.create(payload as any);

      return {
        success: true,
        status: "SENT",
        messageId: message.sid || null,
        mode: "twilio",
        waLink,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: "FAILED",
        mode: "twilio",
        waLink,
        error: errMsg.includes("Authenticate") || errMsg.includes("20003")
          ? "Twilio Authentication Failed (HTTP 401): Please verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env"
          : errMsg,
      };
    }
  }

  // 2. WATI.io WhatsApp API Integration
  if (isConfigured(watiEndpoint) && isConfigured(watiToken)) {
    try {
      const baseUrl = watiEndpoint!.replace(/\/+$/, "");
      const endpoint = `${baseUrl}/api/v1/sendSessionMessage/${cleanPhone}?messageText=${encodeURIComponent(params.messageText)}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: watiToken!.startsWith("Bearer ")
            ? watiToken!
            : `Bearer ${watiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageText: params.messageText,
        }),
      });

      const data = (await res.json()) as {
        result?: boolean;
        info?: string;
        ticketId?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok || data.result === false) {
        return {
          success: false,
          status: "FAILED",
          mode: "wati",
          waLink,
          error:
            data.info ||
            data.message ||
            data.error ||
            `WATI API request failed (${res.status})`,
        };
      }

      return {
        success: true,
        status: "SENT",
        messageId: data.ticketId || data.info || "wati_msg",
        mode: "wati",
        waLink,
      };
    } catch (err) {
      return {
        success: false,
        status: "FAILED",
        mode: "wati",
        waLink,
        error:
          err instanceof Error
            ? err.message
            : "Network error contacting WATI.io API",
      };
    }
  }

  // 3. Meta WhatsApp Business Cloud API
  if (isConfigured(token) && isConfigured(phoneNumberId)) {
    try {
      const endpoint = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "text",
          text: {
            preview_url: false,
            body: params.messageText,
          },
        }),
      });

      const data = (await res.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message: string };
      };

      if (!res.ok || data.error) {
        return {
          success: false,
          status: "FAILED",
          mode: "meta_cloud",
          waLink,
          error:
            data.error?.message || `Meta API request failed (${res.status})`,
        };
      }

      return {
        success: true,
        status: "SENT",
        messageId: data.messages?.[0]?.id || null,
        mode: "meta_cloud",
        waLink,
      };
    } catch (err) {
      return {
        success: false,
        status: "FAILED",
        mode: "meta_cloud",
        waLink,
        error:
          err instanceof Error
            ? err.message
            : "Network error contacting WhatsApp API",
      };
    }
  }

  // 4. Custom Avhaan WhatsApp API Gateway Endpoint
  if (isConfigured(customApiUrl)) {
    try {
      const res = await fetch(customApiUrl!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          to: cleanPhone,
          message: params.messageText,
          alertId: params.alertId ?? null,
          sentBy: params.sentBy ?? "ahvaan-bot",
        }),
      });

      const data = (await res.json()) as {
        messageId?: string;
        id?: string;
        error?: string;
      };

      if (!res.ok || data.error) {
        return {
          success: false,
          status: "FAILED",
          mode: "avhaan_gateway",
          waLink,
          error: data.error || `Gateway request failed (${res.status})`,
        };
      }

      return {
        success: true,
        status: "SENT",
        messageId: data.messageId || data.id || null,
        mode: "avhaan_gateway",
        waLink,
      };
    } catch (err) {
      return {
        success: false,
        status: "FAILED",
        mode: "avhaan_gateway",
        waLink,
        error:
          err instanceof Error
            ? err.message
            : "Network error contacting Avhaan API Gateway",
      };
    }
  }

  // 5. Prototype Mode (No external API keys configured)
  return {
    success: true,
    status: "SIMULATED_SENT",
    mode: "simulated",
    waLink,
  };
}
