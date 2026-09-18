/**
 * Trusted ward context builder for the chatbot. Server-side only.
 * Assembles the exact fields the system prompt allows the model to use —
 * everything comes from live reads (board + showcase), nothing invented.
 */

import { getBoard } from "../board";
import { getAnalysisRange } from "../db/queries";
import { istDateString, summarizeDayAnalysis } from "../analysis";
import { evaluateWardAlert } from "../alerts";
import type { AnalysisHourEntry } from "../db/schema";

export interface WardContext {
  wardNumber: number | null;
  heatRiskScore: number | null;
  riskLevel: string | null;
  temperatureC: number | null;
  htsi: number | null;
  updatedAt: string | null;
  highRiskAdvice: string[];
}

/**
 * Build context for a ward. Returns null when the ward has no computable
 * data at all (the route then answers with a fixed missing-data reply
 * instead of calling the model).
 */
export async function buildWardContext(
  locationId: number,
): Promise<WardContext | null> {
  const { data: board } = await getBoard(2);
  const entry = board.wards.find((w) => w.locationId === locationId);
  if (!entry) return null;

  const risk = entry.latest?.compositeRisk.value ?? null;
  const level = entry.latest?.compositeRisk.category ?? null;

  // Current-hour observed temp + stored HTSI from the precomputed showcase.
  let temperatureC: number | null = null;
  let htsi: number | null = null;
  try {
    const today = istDateString();
    const rows = await getAnalysisRange(locationId, today, today);
    const entries = (rows[0]?.analysis as unknown as AnalysisHourEntry[] | undefined) ?? [];
    const summary = summarizeDayAnalysis(entries);
    htsi = summary.htsiMax;
    // Current hour: latest entry at/before now IST, else the day's last.
    const nowLabel = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
    }).format(new Date());
    const nowHour = `${nowLabel}:00:00`;
    const past = entries.filter((e) => e.hour <= nowHour);
    const pick = past[past.length - 1] ?? entries[entries.length - 1];
    const t = (pick?.input as Record<string, unknown> | undefined)?.temperature2m;
    if (typeof t === "number" && Number.isFinite(t)) temperatureC = t;
  } catch {
    // analysis gaps are fine — fields stay null, prompt handles it
  }

  const wardLabel =
    entry.ward !== null && entry.ward !== undefined
      ? `Ward ${entry.ward}`
      : `Location ${locationId}`;
  const evaluation = evaluateWardAlert(
    {
      riskScore: risk,
      htsiMax: htsi,
      wbgtMax: entry.latest?.indicators.wbgt ?? null,
      heatIndexMax: entry.latest?.indicators.heatIndex ?? null,
    },
    wardLabel,
  );
  const highRiskAdvice = [
    evaluation.advisory,
    ...evaluation.triggers.filter((t) => t !== evaluation.advisory),
  ].slice(0, 4);

  return {
    wardNumber: entry.ward,
    heatRiskScore: risk !== null ? Math.round(risk * 1000) / 1000 : null,
    riskLevel: level,
    temperatureC,
    htsi,
    updatedAt: board.computedAt,
    highRiskAdvice,
  };
}
