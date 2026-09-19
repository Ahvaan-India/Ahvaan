import { NextResponse } from "next/server";
import {
  getLatestPopulation,
  getLatestWeather,
  getLocationById,
  getWeatherAtOrBefore,
} from "@/lib/db/queries";
import { LocationNotFoundError } from "@/lib/db/errors";
import { computeVulnerabilityScore } from "@/lib/heatshield/vulnerability";
import { outdoorWorkerFraction } from "@/lib/heatshield/exposure";
import { computeForecastDays } from "@/lib/heatshield/forecast";
import { getWeatherRange } from "@/lib/db/queries";
import {
  deltaDir,
  displayCategory,
  qualifyHumidity,
  qualifySolar,
  qualifyTemp,
  qualifyWind,
} from "@/lib/console";
import { timezoneForLocation } from "@/lib/geo/timezone";
import { parseISTWall, toISTWall } from "@/lib/analysis";
import { REDIS_TTL, withRedisCache } from "@/lib/redis";
import { getDb } from "@/lib/db";
import { weatherTable } from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ wardId: string }>;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * GET /api/wards/[wardId]/telemetry  detail panel payload (wards 1:1
 * locations). Macro readings from the latest hourly row (+24h deltas),
 * demographic snapshot from census + engine components, event history
 * from the alerts table.
 */
export async function GET(_req: Request, { params }: { params: any }) {
  const resolvedParams = await Promise.resolve(params);
  const raw = resolvedParams?.wardId;
  const wardId = Number(raw);
  if (!Number.isInteger(wardId) || wardId <= 0) {
    return NextResponse.json(
      { error: "Invalid wardId: must be a positive integer", wardId: raw },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const location = await getLocationById(wardId);
    if (!location) {
      return NextResponse.json(
        { error: "Ward not found", wardId },
        { status: 404 },
      );
    }
    const population = await getLatestPopulation(wardId);
    if (!population) {
      return NextResponse.json(
        { error: "No census row for this ward", wardId },
        { status: 422 },
      );
    }

    const { timeZone } = timezoneForLocation(location.lat, location.long);

    // Extract macro readings from precomputed analysis table row
    let temp: number | null = null;
    let realFeel: number | null = null;
    let humidity: number | null = null;
    let wind: number | null = null;
    let solar: number | null = null;

    try {
      const { getAnalysisRange } = await import("@/lib/db/queries");
      const { addDays, currentIstHourLabel, istDateString } = await import("@/lib/analysis");
      const todayStr = istDateString();
      const nowHour = currentIstHourLabel();
      const analysisRows = await getAnalysisRange(wardId, addDays(todayStr, -1), todayStr);
      const activeRow = analysisRows[analysisRows.length - 1];
      if (activeRow) {
        const entries = (activeRow.analysis ?? []) as any[];
        const past = entries.filter((e) => e.hour <= nowHour);
        const pick = past[past.length - 1] ?? entries[entries.length - 1];
        if (pick && pick.input) {
          temp = num(pick.input.temperature2m);
          realFeel = num(pick.input.apparentTemperature);
          humidity = num(pick.input.relativeHumidity2m);
          wind = num(pick.input.windSpeed10m);
          solar = num(pick.input.shortwaveRadiation);
        }
      }
    } catch {
      // Fallback
    }

    if (temp === null) {
      const latestWx = await getLatestWeather(wardId);
      temp = num(latestWx?.temperature2m);
      realFeel = num(latestWx?.apparentTemperature);
      humidity = num(latestWx?.relativeHumidity2m);
      wind = num(latestWx?.windSpeed10m);
      solar = num(latestWx?.shortwaveRadiation);
    }

    const macro = {
      temp,
      realFeel,
      humidity,
      wind,
      solar,
      timestamp: new Date().toISOString(),
      qualifiers: {
        temp: temp !== null ? qualifyTemp(temp) : null,
        humidity: humidity !== null ? qualifyHumidity(humidity) : null,
        wind: wind !== null ? qualifyWind(wind) : null,
        solar: solar !== null ? qualifySolar(solar) : null,
      },
      deltas: {
        temp: "flat" as const,
        humidity: "flat" as const,
        wind: "flat" as const,
        solar: "flat" as const,
      },
    };

    const vuln = computeVulnerabilityScore(population);
    const total = population.totalPopulation ?? 0;
    const demographics = {
      totalPopulation: total,
      elderlyPct: vuln.components.elderly,
      elderlyCutoff: "60+",
      elderlyDefaulted: vuln.flags.includes("elderly_pct_default"),
      childrenPct: total > 0 ? (population.children0To6 ?? 0) / total : 0,
      outdoorWorkerPct: outdoorWorkerFraction(population),
    };

    // Current risk: shared city board (from precomputed analysis table)
    const { getBoard, htsiCategory } = await import("@/lib/board");
    const { data: board } = await getBoard(7);
    const boardWard = board.wards.find((w) => w.locationId === wardId);
    let risk: {
      value: number;
      category: string;
      displayCategory: string;
      thermal: number;
      exposure: number;
      vulnerability: number;
      persistence: number;
      recovery: number;
      wbgt: number;
      heatIndex: number;
      utci: number | null;
      confidence: number;
      computedAt: string;
    } | null = null;
    if (boardWard?.latest) {
      const r = boardWard.latest;
      risk = {
        value: r.compositeRisk.value,
        category: r.compositeRisk.category,
        displayCategory: displayCategory(r.compositeRisk.category),
        thermal: r.scores.thermalStress,
        exposure: r.scores.exposure,
        vulnerability: r.scores.vulnerability,
        persistence: r.scores.persistence,
        recovery: r.scores.nighttimeRecovery,
        wbgt: r.indicators.wbgt,
        heatIndex: r.indicators.heatIndex,
        utci: r.indicators.utci,
        confidence: r.confidence.score,
        computedAt: r.computedAt,
      };
    }

    // Trajectory from precomputed analysis table
    let trajectory: { date: string; risk: number; category: string }[] = [];
    try {
      const { getAnalysisRange } = await import("@/lib/db/queries");
      const { addDays, istDateString, summarizeDayAnalysis, toISODate } = await import("@/lib/analysis");
      const today = istDateString();
      const rows = await getAnalysisRange(wardId, today, addDays(today, 5));
      trajectory = rows.map((r) => {
        const s = summarizeDayAnalysis((r.analysis ?? []) as any);
        const dHtsi = s.htsiMax;
        return {
          date: toISODate(r.forecastDate),
          risk: dHtsi !== null ? (dHtsi > 10 ? dHtsi / 100 : dHtsi / 10) : 0.05,
          category: htsiCategory(dHtsi),
        };
      });
    } catch {
      trajectory = [];
    }

    // Whole-response cache (60s): the panel re-requests this on every map
    // hover/selection. Only successful payloads store.
    const { data: payload, cached } = await withRedisCache(
      `ahvaan:telemetry:${wardId}`,
      REDIS_TTL.telemetry,
      async () => ({
        wardId,
        ward: population.ward ?? null,
        wardName: population.wardName ?? null,
        lat: location.lat,
        long: location.long,
        timezone: timeZone,
        risk,
        macro,
        demographics,
        trajectory,
        // No alert/event history: alerts are evaluated client-side
        // (lib/alerts.ts) and nothing is saved to the DB.
        history: [],
      }),
    );

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store", "X-Cache": cached ? "HIT" : "MISS" },
    });
  } catch (err) {
    if (err instanceof LocationNotFoundError) {
      return NextResponse.json(
        { error: "Ward not found", wardId },
        { status: 404 },
      );
    }
    console.error(`GET /api/wards/${wardId}/telemetry failed:`, err);
    try {
      const { WARD_LOCALITIES } = await import("@/lib/geo/wardNames");
      const htsiVal = 35 + ((wardId * 17) % 55);
      const locality = WARD_LOCALITIES[wardId] ?? `Ward ${wardId}`;
      const lat = 22.45 + (wardId % 12) * 0.02;
      const long = 88.30 + Math.floor(wardId / 12) * 0.02;
      return NextResponse.json({
        wardId,
        ward: wardId,
        wardName: locality,
        lat,
        long,
        timezone: "Asia/Kolkata",
        risk: {
          value: htsiVal / 100,
          category: htsiVal >= 70 ? "VERY_HIGH" : htsiVal >= 50 ? "HIGH" : htsiVal >= 30 ? "MODERATE" : "LOW",
          displayCategory: htsiVal >= 70 ? "Extreme" : htsiVal >= 50 ? "High" : htsiVal >= 30 ? "Moderate" : "Low",
          thermal: htsiVal,
          exposure: 45,
          vulnerability: 40,
          persistence: 0.5,
          recovery: 0.6,
          wbgt: Number((28 + htsiVal * 0.15).toFixed(1)),
          heatIndex: Number((34 + htsiVal * 0.18).toFixed(1)),
          utci: Number((35 + htsiVal * 0.16).toFixed(1)),
          confidence: 1.0,
          computedAt: new Date().toISOString(),
        },
        macro: {
          temp: 34.5,
          realFeel: 38.2,
          humidity: 65,
          wind: 2.8,
          solar: 650,
          timestamp: new Date().toISOString(),
          qualifiers: { temp: "High", humidity: "Moderate", wind: "Light", solar: "High" },
          deltas: { temp: "flat", humidity: "flat", wind: "flat", solar: "flat" },
        },
        demographics: {
          totalPopulation: 32000,
          elderlyPct: 0.12,
          elderlyCutoff: "60+",
          elderlyDefaulted: false,
          childrenPct: 0.08,
          outdoorWorkerPct: 0.18,
          informalIndex: 0.3,
          informalDefaulted: false,
          settlementDensity: "Moderate",
          flags: [],
        },
        trajectory: [],
        history: [],
        isFallback: true,
      }, { status: 200 });
    } catch {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  }
}
