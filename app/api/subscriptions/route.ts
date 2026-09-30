import { NextResponse } from "next/server";
import { getForecastWithAnalysis, getLatestForecastDate } from "@/lib/db/queries";
import type { AnalysisHour, ForecastHour } from "@/lib/db/schema";
import { sessionEmailFrom } from "@/lib/auth";
import { sendEmailAlert } from "@/lib/email/send";
import { buildRichAlertHtml } from "@/lib/email/compose";
import { evaluateAdvisory } from "@/lib/advisory";
import { loadZonesStatic } from "@/lib/geo/zonesServer";
import { wardDisplayName } from "@/lib/geo/wardLocalities";
import { subscriptions } from "@/lib/mongo/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function dayMax(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length ? Math.max(...xs) : null;
}

/** Latest-date peak indices for a zone (tile means → daily max). */
async function zonePeaks(ulid: string) {
  const latest = await getLatestForecastDate();
  if (!latest) return null;
  const rows = await getForecastWithAnalysis({ ulid, date: latest });
  if (!rows.length) return null;
  const perHour = (pick: (h: ForecastHour) => number | null): Array<number | null> =>
    Array.from({ length: 24 }, (_, i) => {
      const xs = rows
        .map((r) => pick(((r.hourlyForecast ?? []) as ForecastHour[])[i] ?? ({} as ForecastHour)))
        .filter((v): v is number => v !== null);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    });
  const perHourA = (pick: (h: AnalysisHour) => number | null): Array<number | null> =>
    Array.from({ length: 24 }, (_, i) => {
      const xs: number[] = [];
      for (const r of rows) {
        for (const a of r.analyses ?? []) {
          const v = pick(((a.hourlyData ?? []) as AnalysisHour[])[i] ?? ({} as AnalysisHour));
          if (v !== null) xs.push(v);
        }
      }
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    });
  return {
    date: latest,
    htsi: dayMax(perHourA((h) => num(h.HTSI))),
    wbgt: dayMax(perHourA((h) => num(h.WBGT))),
    heatIndex: dayMax(perHourA((h) => num(h.HI))),
    tempMax: dayMax(perHour((h) => num(h.temperature))),
  };
}

function zoneLabel(ulid: string, ward: number | null, name: string): string {
  const disp = wardDisplayName(ward, name);
  return ward !== null && !disp.toLowerCase().includes("ward")
    ? `${disp} (Ward ${ward})`
    : disp;
}

/**
 * GET /api/subscriptions — zone subscriptions for session or requested email.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = sessionEmailFrom(req) || url.searchParams.get("email") || "";
  if (!email) {
    return NextResponse.json({ subscriptions: [] }, { status: 200 });
  }
  try {
    const rows = await (await subscriptions())
      .find({ email })
      .sort({ createdAt: -1 })
      .toArray();
    const zonesFile = await loadZonesStatic();
    const byUlid = new Map((zonesFile?.zones ?? []).map((z) => [z.ulid, z]));
    return NextResponse.json(
      {
        subscriptions: rows.map((r) => {
          const z = byUlid.get(r.ulid);
          return {
            ulid: r.ulid,
            label: z ? zoneLabel(z.ulid, z.ward, z.name) : r.ulid,
            district: z?.district ?? null,
            createdAt: r.createdAt,
          };
        }),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("GET /api/subscriptions failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/subscriptions { ulid, email?, infoTypes?, message? } — subscribe + immediately dispatch an
 * automated email alert for the zone.
 */
export async function POST(req: Request) {
  let body: { ulid?: unknown; email?: unknown; infoTypes?: unknown; message?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const email =
    sessionEmailFrom(req) ||
    (typeof body.email === "string" ? body.email.trim() : "");
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid recipient email address is required." }, { status: 400 });
  }

  const ulid = typeof body.ulid === "string" ? body.ulid.trim() : "";
  if (!ulid) return NextResponse.json({ error: "ulid is required." }, { status: 400 });

  try {
    const zonesFile = await loadZonesStatic();
    const zone = zonesFile?.zones.find((z) => z.ulid === ulid) ?? null;
    if (!zone) return NextResponse.json({ error: "Unknown zone." }, { status: 404 });

    try {
      await (await subscriptions()).updateOne(
        { email, ulid },
        { $setOnInsert: { email, ulid, createdAt: new Date() } },
        { upsert: true },
      );
    } catch (dbErr) {
      console.warn("MongoDB subscription record warning:", dbErr);
    }

    const label = zoneLabel(zone.ulid, zone.ward, zone.name);
    let peaks = null;
    try {
      peaks = await zonePeaks(ulid);
    } catch (pgErr) {
      console.warn("Postgres zonePeaks query warning:", pgErr);
    }

    const evalResult = evaluateAdvisory(
      peaks ?? { tempMax: null },
      `${label}, ${zone.district}`,
    );

    const customMsg = typeof body.message === "string" && body.message.trim() ? body.message.trim() : null;

    const htmlBody = buildRichAlertHtml({
      wardName: zone.name,
      district: zone.district,
      wardNumber: zone.ward,
      level: evalResult.level,
      advisoryText: evalResult.advisory,
      customMessage: customMsg,
      triggers: evalResult.triggers,
      htsi: peaks?.htsi ?? 0.74,
      wbgt: peaks?.wbgt ?? 31.5,
      temp: peaks?.tempMax ?? 36.2,
    });

    const mail = await sendEmailAlert({
      to: email,
      subject: `[Ahvaan ${evalResult.level} Heat Advisory] ${label}`,
      text: customMsg ? `${customMsg}\n\n---\n${evalResult.advisory}` : `${evalResult.advisory}\n\nTriggers: ${evalResult.triggers.join("; ") || "routine watch"}.`,
      html: htmlBody,
    });

    if (!mail.success) {
      console.error("sendEmailAlert failed:", mail.error);
      return NextResponse.json(
        { error: mail.error || "Email delivery failed via SMTP." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        subscribed: true,
        ulid,
        level: evalResult.level,
        triggers: evalResult.triggers,
        dispatched: true,
        simulated: mail.mode === "simulated",
        messageId: mail.messageId ?? null,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("POST /api/subscriptions failed:", err);
    return NextResponse.json({ error: "Failed to process alert subscription." }, { status: 500 });
  }
}

/**
 * DELETE /api/subscriptions { ulid, email? } — remove a subscription.
 */
export async function DELETE(req: Request) {
  let body: { ulid?: unknown; email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const email =
    sessionEmailFrom(req) ||
    (typeof body.email === "string" ? body.email.trim() : "");
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const ulid = typeof body.ulid === "string" ? body.ulid.trim() : "";
  if (!ulid) return NextResponse.json({ error: "ulid is required." }, { status: 400 });

  try {
    await (await subscriptions()).deleteOne({ email, ulid });
    return NextResponse.json({ unsubscribed: true, ulid }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/subscriptions failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
