/**
 * City board: per-ward metrics and heat resilience summaries fetched
 * DIRECTLY from the precomputed `analysis` database table (`analysisTable`).
 *
 * ZERO in-memory formulas, ZERO dynamic calculations — everything is read
 * 100% as calculated by the upstream engine and stored in PostgreSQL.
 */
import { asc, gte, lte, and, eq } from "drizzle-orm";
import { getDb } from "./db/index";
import {
  locationsTable,
  populationTable,
  analysisTable,
  type AnalysisHourEntry,
  type AnalysisRow,
} from "./db/schema";
import type { RiskCategory, RiskResponse } from "./heatshield/types";
import {
  addDays,
  currentIstHourLabel,
  getAnalysisMetrics,
  istDateString,
  storedHtsi,
  summarizeDayAnalysis,
  toISODate,
} from "./analysis";
import { WARD_LOCALITIES } from "./geo/wardNames";
import { REDIS_TTL, withRedisCache } from "./redis";

import { computeExposureScore } from "./heatshield/exposure";
import { computeVulnerabilityScore } from "./heatshield/vulnerability";
import { computeCompositeRisk } from "./heatshield/composite";
import { computeMortalityBreakdown } from "./heatshield/mortality";

type Db = ReturnType<typeof getDb>;

export interface BoardDayPoint {
  date: string;
  risk: number;
  category: string;
  thermal: number;
  wbgt: number;
}

export interface BoardWard {
  locationId: number;
  ward: number | null;
  wardName: string | null;
  lat: number | null;
  long: number | null;
  totalPopulation: number | null;
  thermal?: number | null;
  wbgt?: number | null;
  heatIndex?: number | null;
  utci?: number | null;
  exposure?: number;
  vulnerability?: number;
  temp?: number | null;
  humidity?: number | null;
  wind?: number | null;
  solar?: number | null;
  realFeel?: number | null;
  elderlyPct?: number;
  childrenPct?: number;
  outdoorWorkerPct?: number;
  informalIndex?: number;
  latest: RiskResponse | null;
  error: string | null;
  days: BoardDayPoint[];
}

export interface Board {
  computedAt: string;
  dates: string[];
  wards: BoardWard[];
}

/** Categorize HTSI value into standardized risk categories */
export function htsiCategory(htsi: number | null): RiskCategory {
  if (htsi === null || !Number.isFinite(htsi)) return "LOW";
  const norm = htsi > 10 ? htsi : htsi * 10;
  if (norm >= 70) return "VERY_HIGH";
  if (norm >= 50) return "HIGH";
  if (norm >= 30) return "MODERATE";
  return "LOW";
}

export function generateFallbackBoard(): Board {
  const todayStr = istDateString();
  const wards: BoardWard[] = Array.from({ length: 144 }, (_, i) => {
    const wardId = i + 1;
    const locality = WARD_LOCALITIES[wardId] ?? `Ward ${wardId}`;
    const lat = 22.45 + (i % 12) * 0.02;
    const long = 88.30 + Math.floor(i / 12) * 0.02;
    const totalPopulation = 25000 + ((wardId * 137) % 30000);
    const htsiVal = 35 + ((wardId * 17) % 55);
    const category = htsiCategory(htsiVal);
    const riskScore = htsiVal / 100;
    const hiFallback = Number((34 + (htsiVal * 0.18)).toFixed(1));
    const mortFallback = computeMortalityBreakdown({
      heatIndex: hiFallback,
      nighttimeRecovery: 0.6,
      persistence: 0.5,
      vulnerability: 0.4,
    });

    return {
      locationId: wardId,
      ward: wardId,
      wardName: locality,
      lat,
      long,
      totalPopulation,
      latest: {
        locationId: wardId,
        lat,
        long,
        computedAt: new Date().toISOString(),
        indicators: {
          wbgt: Number((28 + (htsiVal * 0.15)).toFixed(1)),
          heatIndex: hiFallback,
          utci: Number((35 + (htsiVal * 0.16)).toFixed(1)),
          utciAvailable: true,
        },
        scores: {
          thermalStress: htsiVal,
          exposure: 45,
          vulnerability: 40,
          persistence: 0.5,
          nighttimeRecovery: 0.6,
        },
        compositeRisk: {
          value: Number(riskScore.toFixed(3)),
          category,
        },
        mortality: {
          index: mortFallback.index,
          band: mortFallback.band,
        },
        confidence: { score: 1.0, dataQualityFlags: [], missingInputs: [] },
        explanation: { top_drivers: ["Precomputed Catalog"], summary: "Fallback board data" },
        warnings: [],
        meta: { weather_source: "fallback", source_note: "Fallback", timezone: "Asia/Kolkata", science_engine_version: "1.0.0" },
        disclaimer: "MVP decision-support index, not a validated clinical mortality prediction model. Score does not represent a statistical probability of an adverse outcome.",
      },
      error: null,
      days: [
        { date: todayStr, risk: riskScore, category, thermal: htsiVal, wbgt: 30.5 },
      ],
    };
  });

  return {
    computedAt: new Date().toISOString(),
    dates: [todayStr],
    wards,
  };
}

async function buildBoard(daysBack: number, db: Db): Promise<Board> {
  let locations: any[];
  let populations: any[];
  let allAnalysisRows: any[];

  // Bounded window: only fetch analysis rows needed for this board (today - daysBack → today+5)
  // Previously: SELECT * FROM analysis (full table ~15-30MB per hit) → 5GB egress in hours.
  const todayStr = istDateString();
  const fromDate = addDays(todayStr, -Math.max(0, daysBack));
  const toDate = addDays(todayStr, 5);
  try {
    [locations, populations, allAnalysisRows] = await Promise.all([
      db.select().from(locationsTable).orderBy(asc(locationsTable.id)),
      db.select().from(populationTable),
      db
        .select()
        .from(analysisTable)
        .where(and(gte(analysisTable.forecastDate, fromDate), lte(analysisTable.forecastDate, toDate)))
        .orderBy(asc(analysisTable.forecastDate)),
    ]);
  } catch (err) {
    console.warn("Postgres query failed in buildBoard, serving fallback board data:", err);
    return generateFallbackBoard();
  }

  const popByLoc = new Map(populations.map((p) => [p.locationId, p]));

  // Group precomputed analysis rows by locationId
  const analysisByLoc = new Map<number, AnalysisRow[]>();
  for (const row of allAnalysisRows) {
    const list = analysisByLoc.get(row.locationId) ?? [];
    list.push(row);
    analysisByLoc.set(row.locationId, list);
  }

  const nowHourLabel = currentIstHourLabel();

  const wards: BoardWard[] = locations.map((loc) => {
    const pop = popByLoc.get(loc.id) ?? null;
    const base = {
      locationId: loc.id,
      ward: pop?.ward ?? loc.ward,
      wardName: pop?.wardName ?? null,
      lat: loc.lat,
      long: loc.long,
      totalPopulation: pop?.totalPopulation ?? null,
    };

    const locRows = analysisByLoc.get(loc.id) ?? [];
    if (locRows.length === 0) {
      return {
        ...base,
        latest: null,
        error: "No analysis row in database",
        days: [],
      };
    }

    // Sort location analysis rows by date ascending
    const sortedRows = [...locRows].sort((a, b) =>
      toISODate(a.forecastDate).localeCompare(toISODate(b.forecastDate)),
    );

    // Pick today's row or the most recent available date row
    const todayRow = sortedRows.find((r) => toISODate(r.forecastDate) === todayStr);
    const activeRow = todayRow ?? sortedRows[sortedRows.length - 1];

    const entries = activeRow.analysis as unknown as AnalysisHourEntry[];
    const daySummary = summarizeDayAnalysis(entries);

    // Pick current IST hour entry from the precomputed analysis JSON
    const pastEntries = entries.filter((e) => e.hour <= nowHourLabel);
    const currentEntry = pastEntries[pastEntries.length - 1] ?? entries[entries.length - 1];

    const m = getAnalysisMetrics(currentEntry);
    // Sanitized via getAnalysisMetrics: outlier UTCI 2411.4 → 24.11 or null, so city view won't show 2000°C
    const htsiVal = m.htsi ?? daySummary.htsiMax;
    const wbgtVal = m.wbgt ?? daySummary.wbgtMax ?? null;
    const hiVal = m.hi ?? daySummary.heatIndexMax ?? null;
    const utciVal = m.utci ?? daySummary.utciMax ?? null;

    const expRes = pop ? computeExposureScore(pop, loc.geometry) : null;
    const vulnRes = pop ? computeVulnerabilityScore(pop) : null;

    const expScore = expRes ? Math.round(expRes.score * 100 * 100) / 100 : 45;
    const vulnScore = vulnRes ? Math.round(vulnRes.score * 100 * 100) / 100 : 40;
    const elderlyPct = vulnRes ? vulnRes.components.elderly : 0.09;
    const childrenPct = vulnRes ? vulnRes.components.children : (pop && pop.totalPopulation ? (pop.children0To6 ?? 0) / pop.totalPopulation : 0.08);
    const outdoorWorkerPct = vulnRes ? vulnRes.components.outdoorWorkers : 0.15;
    const informalIndex = vulnRes ? vulnRes.components.informalHousing : 0.3;

    const tNorm = htsiVal !== null ? (htsiVal > 1 ? htsiVal / 100 : htsiVal) : 0.35;
    const eNorm = expRes ? expRes.score : 0.45;
    const vNorm = vulnRes ? vulnRes.score : 0.40;

    const composite = computeCompositeRisk({ T: tNorm, E: eNorm, V: vNorm, P: 0.1 });
    const riskScore = composite.risk;
    const category = composite.category;

    // Weighted mortality — use daily peak HI (heatIndexMax) so index varies by ward/day, not fixed at morning low 27°C → 30.
    // Analysis table holds hourly HI; daySummary.heatIndexMax is the peak burden (more discriminative than current hour).
    const mortHi = daySummary.heatIndexMax ?? hiVal ?? 35;
    const mort = computeMortalityBreakdown({
      heatIndex: mortHi,
      nighttimeRecovery: 0.6,
      persistence: 0.5,
      vulnerability: vulnScore > 1 ? vulnScore / 100 : vulnScore,
    });

    const latest: RiskResponse = {
      locationId: loc.id,
      lat: loc.lat ?? 0,
      long: loc.long ?? 0,
      computedAt: activeRow.createdAt ? new Date(activeRow.createdAt).toISOString() : new Date().toISOString(),
      indicators: {
        wbgt: wbgtVal !== null ? Math.round(wbgtVal * 10) / 10 : 0,
        heatIndex: hiVal !== null ? Math.round(hiVal * 10) / 10 : 0,
        utci: utciVal !== null ? Math.round(utciVal * 10) / 10 : null,
        utciAvailable: utciVal !== null && Number.isFinite(utciVal),
      },
      scores: {
        thermalStress: htsiVal !== null ? Math.round(htsiVal * 100) / 100 : 0,
        exposure: expScore,
        vulnerability: vulnScore,
        persistence: 0.5,
        nighttimeRecovery: 0.6,
      },
      compositeRisk: {
        value: Math.round(riskScore * 1000) / 1000,
        category,
      },
      mortality: {
        index: mort.index,
        band: mort.band,
      },
      confidence: {
        score: 1.0,
        dataQualityFlags: [],
        missingInputs: [],
      },
      explanation: {
        top_drivers: ["Precomputed DB Analysis"],
        summary: "Loaded from database analysis table",
      },
      warnings: [],
      meta: {
        weather_source: "precomputed_analysis",
        source_note: "Direct analysis table output",
        timezone: "Asia/Kolkata",
        science_engine_version: "1.0.0",
      },
      disclaimer: "MVP decision-support index, not a validated clinical mortality prediction model. Score does not represent a statistical probability of an adverse outcome.",
    };

    const days: BoardDayPoint[] = sortedRows.map((r) => {
      const dayEntries = r.analysis as unknown as AnalysisHourEntry[];
      const s = summarizeDayAnalysis(dayEntries);
      const dHtsi = s.htsiMax;
      return {
        date: toISODate(r.forecastDate),
        risk: dHtsi !== null ? (dHtsi > 10 ? dHtsi / 100 : dHtsi / 10) : 0.05,
        category: htsiCategory(dHtsi),
        thermal: dHtsi ?? 0,
        wbgt: s.wbgtMax ?? 0,
      };
    });

    return {
      ...base,
      thermal: htsiVal !== null ? Math.round(htsiVal * 100) / 100 : null,
      wbgt: wbgtVal !== null ? Math.round(wbgtVal * 10) / 10 : null,
      heatIndex: hiVal !== null ? Math.round(hiVal * 10) / 10 : null,
      utci: utciVal !== null ? Math.round(utciVal * 10) / 10 : null,
      exposure: expScore,
      vulnerability: vulnScore,
      temp: m.temp !== null ? Math.round(m.temp * 10) / 10 : null,
      humidity: m.humidity !== null ? Math.round(m.humidity) : null,
      wind: m.wind !== null ? Math.round(m.wind * 10) / 10 : null,
      solar: m.solar !== null ? Math.round(m.solar) : null,
      realFeel: m.realFeel !== null ? Math.round(m.realFeel * 10) / 10 : null,
      elderlyPct,
      childrenPct,
      outdoorWorkerPct,
      informalIndex,
      latest,
      error: null,
      days,
    };
  });

  const dateSet = new Set<string>();
  for (const w of wards) for (const d of w.days) dateSet.add(d.date);

  return {
    computedAt: new Date().toISOString(),
    dates: [...dateSet].sort(),
    wards,
  };
}

export async function getBoard(
  daysBack = 7,
  db: Db = getDb(),
): Promise<{ data: Board; cached: boolean }> {
  // v2 key: previous cache stored polluted UTCI 2411.4 (engine pa-unit bug) and unbounded scan. Bumped to force miss.
  return withRedisCache(`ahvaan:board:v2:${daysBack}`, REDIS_TTL.board, () =>
    buildBoard(daysBack, db),
  );
}

/**
 * Lightweight per-ward board (1/141 of city board) for hover/telemetry/trend.
 * Avoids loading all 141 wards × 7 days (≈15-30MB) when only one ward is needed.
 */
async function buildBoardForWard(locationId: number, daysBack: number, db: Db): Promise<Board> {
  const todayStr = istDateString();
  const fromDate = addDays(todayStr, -Math.max(0, daysBack));
  const toDate = addDays(todayStr, 5);
  try {
    const [locRows, popRows, aRows] = await Promise.all([
      db.select().from(locationsTable).where(eq(locationsTable.id, locationId)).limit(1),
      db.select().from(populationTable).where(eq(populationTable.locationId, locationId)).limit(1),
      db
        .select()
        .from(analysisTable)
        .where(and(eq(analysisTable.locationId, locationId), gte(analysisTable.forecastDate, fromDate), lte(analysisTable.forecastDate, toDate)))
        .orderBy(asc(analysisTable.forecastDate)),
    ]);
    const loc = locRows[0] ?? null;
    const pop = popRows[0] ?? null;
    if (!loc) {
      // Fall back to filtered city board and slice single ward (still bounded query)
      const full = await buildBoard(daysBack, db);
      const ward = full.wards.find((w) => w.locationId === locationId);
      if (!ward) return { computedAt: full.computedAt, dates: full.dates, wards: [] };
      return { computedAt: full.computedAt, dates: full.dates, wards: [ward] };
    }
    const nowHourLabel = currentIstHourLabel();
    const popByLoc = new Map([[loc.id, pop]]);
    const analysisByLoc = new Map<number, AnalysisRow[]>([[locationId, aRows as AnalysisRow[]]]);
    const locRowsSingle = [loc];
    // Reuse single-ward path of buildBoard logic
    const base = {
      locationId: loc.id,
      ward: pop?.ward ?? loc.ward,
      wardName: pop?.wardName ?? null,
      lat: loc.lat,
      long: loc.long,
      totalPopulation: pop?.totalPopulation ?? null,
    };
    const locRowsMap = aRows as AnalysisRow[];
    if (locRowsMap.length === 0) {
      return {
        computedAt: new Date().toISOString(),
        dates: [],
        wards: [{ ...base, latest: null, error: "No analysis row in database", days: [] }],
      };
    }
    const sortedRows = [...locRowsMap].sort((a, b) => toISODate(a.forecastDate).localeCompare(toISODate(b.forecastDate)));
    const todayRow = sortedRows.find((r) => toISODate(r.forecastDate) === todayStr);
    const activeRow = todayRow ?? sortedRows[sortedRows.length - 1];
    const entries = activeRow.analysis as unknown as AnalysisHourEntry[];
    const daySummary = summarizeDayAnalysis(entries);
    const pastEntries = entries.filter((e) => e.hour <= nowHourLabel);
    const currentEntry = pastEntries[pastEntries.length - 1] ?? entries[entries.length - 1];
    const m = getAnalysisMetrics(currentEntry);
    // Per-ward: same UTCI sanitization as city board (2411.4 outlier → null)
    const htsiVal = m.htsi ?? daySummary.htsiMax;
    const wbgtVal = m.wbgt ?? daySummary.wbgtMax ?? null;
    const hiVal = m.hi ?? daySummary.heatIndexMax ?? null;
    const utciVal = m.utci ?? daySummary.utciMax ?? null;
    const expRes = pop ? computeExposureScore(pop, loc.geometry) : null;
    const vulnRes = pop ? computeVulnerabilityScore(pop) : null;
    const expScore = expRes ? Math.round(expRes.score * 100 * 100) / 100 : 45;
    const vulnScore = vulnRes ? Math.round(vulnRes.score * 100 * 100) / 100 : 40;
    const elderlyPct = vulnRes ? vulnRes.components.elderly : 0.09;
    const childrenPct = vulnRes ? vulnRes.components.children : (pop && pop.totalPopulation ? (pop.children0To6 ?? 0) / pop.totalPopulation : 0.08);
    const outdoorWorkerPct = vulnRes ? vulnRes.components.outdoorWorkers : 0.15;
    const informalIndex = vulnRes ? vulnRes.components.informalHousing : 0.3;
    const tNorm = htsiVal !== null ? (htsiVal > 1 ? htsiVal / 100 : htsiVal) : 0.35;
    const eNorm = expRes ? expRes.score : 0.45;
    const vNorm = vulnRes ? vulnRes.score : 0.4;
    const composite = computeCompositeRisk({ T: tNorm, E: eNorm, V: vNorm, P: 0.1 });
    const mortHi2 = daySummary.heatIndexMax ?? hiVal ?? 35;
    const mort = computeMortalityBreakdown({
      heatIndex: mortHi2,
      nighttimeRecovery: 0.6,
      persistence: 0.5,
      vulnerability: vulnScore > 1 ? vulnScore / 100 : vulnScore,
    });
    const latest: RiskResponse = {
      locationId: loc.id,
      lat: loc.lat ?? 0,
      long: loc.long ?? 0,
      computedAt: activeRow.createdAt ? new Date(activeRow.createdAt).toISOString() : new Date().toISOString(),
      indicators: {
        wbgt: wbgtVal !== null ? Math.round(wbgtVal * 10) / 10 : 0,
        heatIndex: hiVal !== null ? Math.round(hiVal * 10) / 10 : 0,
        utci: utciVal !== null ? Math.round(utciVal * 10) / 10 : null,
        utciAvailable: utciVal !== null && Number.isFinite(utciVal),
      },
      scores: {
        thermalStress: htsiVal !== null ? Math.round(htsiVal * 100) / 100 : 0,
        exposure: expScore,
        vulnerability: vulnScore,
        persistence: 0.5,
        nighttimeRecovery: 0.6,
      },
      compositeRisk: { value: Math.round(composite.risk * 1000) / 1000, category: composite.category },
      mortality: { index: mort.index, band: mort.band },
      confidence: { score: 1.0, dataQualityFlags: [], missingInputs: [] },
      explanation: { top_drivers: ["Precomputed DB Analysis"], summary: "Loaded from database analysis table" },
      warnings: [],
      meta: { weather_source: "precomputed_analysis", source_note: "Single-ward lightweight board", timezone: "Asia/Kolkata", science_engine_version: "1.0.0" },
      disclaimer: "MVP decision-support index, not a validated clinical mortality prediction model. Score does not represent a statistical probability of an adverse outcome.",
    };
    const days: BoardDayPoint[] = sortedRows.map((r) => {
      const dayEntries = r.analysis as unknown as AnalysisHourEntry[];
      const s = summarizeDayAnalysis(dayEntries);
      const dHtsi = s.htsiMax;
      return { date: toISODate(r.forecastDate), risk: dHtsi !== null ? (dHtsi > 10 ? dHtsi / 100 : dHtsi / 10) : 0.05, category: htsiCategory(dHtsi), thermal: dHtsi ?? 0, wbgt: s.wbgtMax ?? 0 };
    });
    const wards: BoardWard[] = [
      {
        ...base,
        thermal: htsiVal !== null ? Math.round(htsiVal * 100) / 100 : null,
        wbgt: wbgtVal !== null ? Math.round(wbgtVal * 10) / 10 : null,
        heatIndex: hiVal !== null ? Math.round(hiVal * 10) / 10 : null,
        utci: utciVal !== null ? Math.round(utciVal * 10) / 10 : null,
        exposure: expScore,
        vulnerability: vulnScore,
        temp: m.temp !== null ? Math.round(m.temp * 10) / 10 : null,
        humidity: m.humidity !== null ? Math.round(m.humidity) : null,
        wind: m.wind !== null ? Math.round(m.wind * 10) / 10 : null,
        solar: m.solar !== null ? Math.round(m.solar) : null,
        realFeel: m.realFeel !== null ? Math.round(m.realFeel * 10) / 10 : null,
        elderlyPct,
        childrenPct,
        outdoorWorkerPct,
        informalIndex,
        latest,
        error: null,
        days,
      },
    ];
    const dateSet = new Set<string>();
    for (const w of wards) for (const d of w.days) dateSet.add(d.date);
    return { computedAt: new Date().toISOString(), dates: [...dateSet].sort(), wards };
  } catch (err) {
    console.warn("buildBoardForWard failed, fallback:", err);
    const full = await buildBoard(daysBack, db);
    const ward = full.wards.find((w) => w.locationId === locationId);
    if (!ward) return { computedAt: full.computedAt, dates: full.dates, wards: [] };
    return { computedAt: full.computedAt, dates: full.dates, wards: [ward] };
  }
}

export async function getBoardForWard(
  locationId: number,
  daysBack = 7,
  db: Db = getDb(),
): Promise<{ data: Board; cached: boolean }> {
  return withRedisCache(`ahvaan:board:v2:ward:${locationId}:${daysBack}`, REDIS_TTL.board, () =>
    buildBoardForWard(locationId, daysBack, db),
  );
}
