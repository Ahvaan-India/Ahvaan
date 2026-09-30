import { NextResponse } from "next/server";
import { getForecastWithAnalysis } from "@/lib/db/queries";
import type { AnalysisHour, ForecastHour } from "@/lib/db/schema";
import { REDIS_TTL, redisKeys, withRedisCache } from "@/lib/redis";
import { loadZonesStatic } from "@/lib/geo/zonesServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * GET /api/zone/[ulid] — one zone: static identity + per-date 24h series
 * (tile means for temp/humidity/wind/solar/rain) + backend analysis rows
 * when present (empty until the backend service writes them).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ulid: string }> },
) {
  const { ulid } = await params;
  if (!ulid) {
    return NextResponse.json({ error: "Missing zone id" }, { status: 400 });
  }
  try {
    const zonesFile = await loadZonesStatic();
    let zone = zonesFile?.zones.find((z) => z.ulid === ulid) ?? null;

    const { data: detail, cached } = await withRedisCache(
      redisKeys.zoneDetail(ulid),
      REDIS_TTL.zoneDetail,
      async () => {
        // Forecast rows for the zone WITH their linked `analyses` relation.
        const rows = await getForecastWithAnalysis(
          { ulid, from: "2000-01-01", to: "2100-01-01" },
        );

        if (!zone) {
          if (!rows.length) return null;
          const heatpoints = [...new Set(rows.map((r) => r.heatPointId))].sort(
            (a, b) => a - b,
          );
          const dcode = ulid.split("_")[1] ?? "";
          zone = {
            ulid,
            district: "Zone",
            districtCode: dcode,
            name: `Zone ${ulid}`,
            kind: "VILLAGE",
            ward: null,
            vulnerability: null,
            lat: 0,
            long: 0,
            ring: [],
            heatpoints,
          };
        }
        // date → per-hour value lists across tiles (averaged below).
        const perDateGrid = new Map<
          string,
          {
            temp: number[][];
            humidity: number[][];
            wind: number[][];
            solar: number[][];
            rain: number[][];
          }
        >();
        const hours = new Set<string>();
        for (const r of rows) {
          const h = (r.hourlyForecast ?? []) as ForecastHour[];
          h.forEach((e, i) => {
            if (i >= 24) return;
            if (typeof e?.hour === "string") hours.add(e.hour);
          });
          let g = perDateGrid.get(r.date);
          if (!g) {
            const mk = () =>
              Array.from({ length: 24 }, () => [] as number[]);
            g = { temp: mk(), humidity: mk(), wind: mk(), solar: mk(), rain: mk() };
            perDateGrid.set(r.date, g);
          }
          h.forEach((e, i) => {
            if (i >= 24) return;
            const push = (arr: number[][], v: number | null) => {
              if (v !== null) arr[i].push(v);
            };
            push(g.temp, num(e?.temperature));
            push(g.humidity, num(e?.relativeHumidity));
            push(g.wind, num(e?.windSpeed));
            push(g.solar, num(e?.shortwaveRadiation));
            push(g.rain, num(e?.rain));
          });
        }
        const hourList = [...hours].sort().slice(0, 24);
        const series: Record<
          string,
          {
            temp: Array<number | null>;
            humidity: Array<number | null>;
            wind: Array<number | null>;
            solar: Array<number | null>;
            rain: Array<number | null>;
          }
        > = {};
        const dates = [...perDateGrid.keys()].sort();
        for (const d of dates) {
          const g = perDateGrid.get(d)!;
          const m = (grid: number[][]) =>
            grid.map((xs) =>
              xs.length
                ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
                : null,
            );
          series[d] = {
            temp: m(g.temp),
            humidity: m(g.humidity),
            wind: m(g.wind),
            solar: m(g.solar),
            rain: m(g.rain),
          };
        }
        const dateByForecast = new Map(rows.map((r) => [r.id, r.date]));
        const analysisRows = rows.flatMap((r) => r.analyses ?? []);
        // Per-date 24h means of backend indices across the zone's tiles.
        const aGrid = new Map<
          string,
          { htsi: number[][]; wbgt: number[][]; hi: number[][]; utci: number[][]; wbt: number[][] }
        >();
        for (const a of analysisRows) {
          const d = dateByForecast.get(a.forecastId);
          if (!d) continue;
          let g = aGrid.get(d);
          if (!g) {
            const mk = () => Array.from({ length: 24 }, () => [] as number[]);
            g = { htsi: mk(), wbgt: mk(), hi: mk(), utci: mk(), wbt: mk() };
            aGrid.set(d, g);
          }
          const hd = (a.hourlyData ?? []) as AnalysisHour[];
          hd.forEach((e, i) => {
            if (i >= 24) return;
            const push = (arr: number[][], v: number | null) => {
              if (v !== null) arr[i].push(v);
            };
            push(g.htsi, num(e?.HTSI));
            push(g.wbgt, num(e?.WBGT));
            push(g.hi, num(e?.HI));
            push(g.utci, num(e?.UTCI));
            push(g.wbt, num(e?.WBT));
          });
        }
        const analysisSeries: Record<
          string,
          {
            htsi: Array<number | null>;
            wbgt: Array<number | null>;
            hi: Array<number | null>;
            utci: Array<number | null>;
            wbt: Array<number | null>;
          }
        > = {};
        for (const [d, g] of aGrid) {
          const m = (grid: number[][]) =>
            grid.map((xs) =>
              xs.length
                ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
                : null,
            );
          analysisSeries[d] = {
            htsi: m(g.htsi),
            wbgt: m(g.wbgt),
            hi: m(g.hi),
            utci: m(g.utci),
            wbt: m(g.wbt),
          };
        }
        return {
          zone,
          dates,
          hours: hourList,
          heatpoints: zone.heatpoints,
          series,
          analysisCount: analysisRows.length,
          analysisSeries,
        };
      },
    );

    if (!detail) {
      return NextResponse.json({ error: "Unknown zone" }, { status: 404 });
    }

    return NextResponse.json(detail, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120",
        "X-Cache": cached ? "HIT" : "MISS",
      },
    });
  } catch (err) {
    console.error("GET /api/zone failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
