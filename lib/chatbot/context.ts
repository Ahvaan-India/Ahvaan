/**
 * Trusted citywide & ward context builder for the chatbot. Server-side only.
 * Provides full context covering all 144 KMC wards, citywide summaries,
 * microclimate telemetry, and 24-hour hourly profiles.
 */

import { getBoard } from "../board";
import { getAnalysisRange } from "../db/queries";
import { addDays, istDateString, summarizeDayAnalysis } from "../analysis";
import { evaluateWardAlert } from "../alerts";
import { getWardLocality } from "../geo/wardNames";
import type { AnalysisHourEntry } from "../db/schema";
import { watchLevel } from "../console";

export interface WardSummaryData {
  ward: number | null;
  locality: string | null;
  locationId: number;
  riskScore: number | null;
  category: string | null;
  wbgt: number | null;
  heatIndex: number | null;
  utci: number | null;
  population: number | null;
}

export interface SelectedWardDetailedContext {
  wardNumber: number | null;
  locality: string | null;
  heatRiskScore: number | null;
  riskLevel: string | null;
  thermalIndex: number | null;
  exposureIndex: number | null;
  vulnerabilityIndex: number | null;
  wbgt: number | null;
  heatIndex: number | null;
  utci: number | null;
  htsi: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedMs: number | null;
  solarRadiationWm2: number | null;
  population: number | null;
  elderlyPct: number | null;
  childrenPct: number | null;
  outdoorWorkerPct: number | null;
  informalHousingIndex: number | null;
  updatedAt: string | null;
  advisory: string;
  triggers: string[];
  hourlySeriesToday?: Array<{
    hour: string;
    temp: number | null;
    wbgt: number | null;
    hi: number | null;
    utci: number | null;
    htsi: number | null;
  }>;
}

export interface FullSiteContext {
  metroSummary: {
    totalWards: number;
    activeWards: number;
    meanMetroRiskScore: number;
    watchLevelName: string;
    categoryCounts: Record<string, number>;
    topPeakRiskWards: Array<{
      ward: number | null;
      locality: string | null;
      riskScore: number;
      category: string;
      wbgt: number | null;
    }>;
  };
  selectedWard?: SelectedWardDetailedContext | null;
  allWardsCatalog: WardSummaryData[];
}

/**
 * Build complete site-wide context with all 144 wards data and hourly profiles.
 */
export async function buildSiteContext(
  selectedLocationId?: number | null,
): Promise<FullSiteContext> {
  const { data: board } = await getBoard(2);
  const wards = board.wards ?? [];

  // 1. All Wards Catalog Summary
  const allWardsCatalog: WardSummaryData[] = wards.map((w) => ({
    ward: w.ward,
    locality: getWardLocality(w.ward),
    locationId: w.locationId,
    riskScore: w.latest?.compositeRisk.value
      ? Math.round(w.latest.compositeRisk.value * 1000) / 1000
      : null,
    category: w.latest?.compositeRisk.category ?? "LOW",
    wbgt: w.latest?.indicators.wbgt ? Math.round(w.latest.indicators.wbgt * 10) / 10 : null,
    heatIndex: w.latest?.indicators.heatIndex ? Math.round(w.latest.indicators.heatIndex * 10) / 10 : null,
    utci: w.latest?.indicators.utci ? Math.round(w.latest.indicators.utci * 10) / 10 : null,
    population: w.totalPopulation ?? null,
  }));

  // 2. Metro Board Aggregates
  const validRisks = allWardsCatalog
    .filter((w) => typeof w.riskScore === "number")
    .map((w) => w.riskScore as number);
  const meanRisk =
    validRisks.length > 0
      ? validRisks.reduce((a, b) => a + b, 0) / validRisks.length
      : 0;
  const wl = watchLevel(meanRisk);

  const categoryCounts: Record<string, number> = {
    LOW: 0,
    MODERATE: 0,
    HIGH: 0,
    VERY_HIGH: 0,
    EXTREME: 0,
  };
  for (const w of allWardsCatalog) {
    const cat = w.category ?? "LOW";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  const topPeakRiskWards = [...allWardsCatalog]
    .filter((w) => w.riskScore !== null)
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
    .slice(0, 8)
    .map((w) => ({
      ward: w.ward,
      locality: w.locality,
      riskScore: w.riskScore!,
      category: w.category ?? "LOW",
      wbgt: w.wbgt,
    }));

  // 3. Selected Ward Detailed Context (if provided)
  let selectedWard: SelectedWardDetailedContext | null = null;
  if (selectedLocationId) {
    const entry = wards.find((w) => w.locationId === selectedLocationId);
    if (entry) {
      const risk = entry.latest?.compositeRisk.value ?? null;
      const category = entry.latest?.compositeRisk.category ?? "LOW";

      let tempC: number | null = null;
      let humidityPct: number | null = null;
      let windSpeedMs: number | null = null;
      let solarWm2: number | null = null;
      let htsi: number | null = null;
      let hourlySeriesToday: SelectedWardDetailedContext["hourlySeriesToday"] = [];

      try {
        const today = istDateString();
        const rows = await getAnalysisRange(selectedLocationId, today, today);
        const entries = (rows[0]?.analysis as unknown as AnalysisHourEntry[] | undefined) ?? [];
        const summary = summarizeDayAnalysis(entries);
        htsi = summary.htsiMax;

        hourlySeriesToday = entries.map((e) => {
          const input = (e.input ?? {}) as Record<string, unknown>;
          return {
            hour: e.hour,
            temp: typeof input.temperature2m === "number" ? input.temperature2m : null,
            wbgt: e.analysis.WBGT ?? null,
            hi: e.analysis.HI ?? null,
            utci: e.analysis.UTCI ?? null,
            htsi: typeof e.analysis.HTSI === "number" ? e.analysis.HTSI : null,
          };
        });

        const nowLabel = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
        }).format(new Date());
        const nowHour = `${nowLabel}:00:00`;
        const past = entries.filter((e) => e.hour <= nowHour);
        const pick = past[past.length - 1] ?? entries[entries.length - 1];
        const input = (pick?.input ?? {}) as Record<string, unknown>;
        
        if (typeof input.temperature2m === "number") tempC = input.temperature2m;
        if (typeof input.relativeHumidity2m === "number") humidityPct = input.relativeHumidity2m;
        if (typeof input.windSpeed10m === "number") windSpeedMs = input.windSpeed10m;
        if (typeof input.shortwaveRadiation === "number") solarWm2 = input.shortwaveRadiation;
      } catch {
        // Fallbacks
      }

      const wardLabel =
        entry.ward !== null && entry.ward !== undefined
          ? `Ward ${entry.ward} (${getWardLocality(entry.ward) ?? "Kolkata"})`
          : `Location ${selectedLocationId}`;
      
      const evalAlert = evaluateWardAlert(
        {
          riskScore: risk,
          htsiMax: htsi,
          wbgtMax: entry.latest?.indicators.wbgt ?? null,
          heatIndexMax: entry.latest?.indicators.heatIndex ?? null,
        },
        wardLabel,
      );

      selectedWard = {
        wardNumber: entry.ward,
        locality: getWardLocality(entry.ward),
        heatRiskScore: risk !== null ? Math.round(risk * 1000) / 1000 : null,
        riskLevel: category,
        thermalIndex: entry.latest?.scores.thermalStress ? Math.round(entry.latest.scores.thermalStress * 1000) / 1000 : null,
        exposureIndex: entry.latest?.scores.exposure ? Math.round(entry.latest.scores.exposure * 1000) / 1000 : null,
        vulnerabilityIndex: entry.latest?.scores.vulnerability ? Math.round(entry.latest.scores.vulnerability * 1000) / 1000 : null,
        wbgt: entry.latest?.indicators.wbgt ? Math.round(entry.latest.indicators.wbgt * 10) / 10 : null,
        heatIndex: entry.latest?.indicators.heatIndex ? Math.round(entry.latest.indicators.heatIndex * 10) / 10 : null,
        utci: entry.latest?.indicators.utci ? Math.round(entry.latest.indicators.utci * 10) / 10 : null,
        htsi: htsi !== null ? Math.round(htsi * 10) / 10 : null,
        temperatureC: tempC !== null ? Math.round(tempC * 10) / 10 : null,
        humidityPct: humidityPct !== null ? Math.round(humidityPct) : null,
        windSpeedMs: windSpeedMs !== null ? Math.round(windSpeedMs * 10) / 10 : null,
        solarRadiationWm2: solarWm2 !== null ? Math.round(solarWm2) : null,
        population: entry.totalPopulation ?? null,
        elderlyPct: (entry.latest as any)?.demographics?.elderlyPct ? Math.round((entry.latest as any).demographics.elderlyPct * 1000) / 10 : null,
        childrenPct: (entry.latest as any)?.demographics?.childrenPct ? Math.round((entry.latest as any).demographics.childrenPct * 1000) / 10 : null,
        outdoorWorkerPct: (entry.latest as any)?.demographics?.outdoorWorkerPct ? Math.round((entry.latest as any).demographics.outdoorWorkerPct * 1000) / 10 : null,
        informalHousingIndex: (entry.latest as any)?.demographics?.informalIndex ? Math.round((entry.latest as any).demographics.informalIndex * 100) / 100 : null,
        updatedAt: board.computedAt,
        advisory: evalAlert.advisory,
        triggers: evalAlert.triggers,
        hourlySeriesToday,
      };
    }
  }

  return {
    metroSummary: {
      totalWards: wards.length,
      activeWards: allWardsCatalog.filter((w) => w.riskScore !== null).length,
      meanMetroRiskScore: Math.round(meanRisk * 1000) / 1000,
      watchLevelName: wl.name,
      categoryCounts,
      topPeakRiskWards,
    },
    selectedWard,
    allWardsCatalog,
  };
}

/** Legacy alias helper for backward compatibility */
export async function buildWardContext(locationId: number) {
  const ctx = await buildSiteContext(locationId);
  return ctx.selectedWard ?? null;
}
