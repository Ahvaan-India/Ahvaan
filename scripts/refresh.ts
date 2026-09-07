/**
 * Refresh ward risk snapshots + sync active alerts.
 *
 * Usage:  npx tsx scripts/refresh.ts
 * Env:    POSTGRES_URL (or .env file in project root)
 */

import fs from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import {
  alertsTable,
  locationsTable,
  populationTable,
  wardSnapshotsTable,
} from "@/lib/db/schema";
import { getLatestPopulation, getWeatherWindow } from "@/lib/db/queries";
import { buildRiskResponse } from "@/lib/heatshield/service";

const CONCURRENCY = 8;

function advisoryFor(severity: string, wardName: string, wbgt: number): string {
  const base =
    severity === "EXTREME"
      ? "Deploy shade/water stations at market zones; prioritize outdoor vendor and transit worker check-ins."
      : "Advise reduced midday outdoor activity; check on elderly foot traffic and transit workers.";
  return `${wardName}: WBGT ${wbgt.toFixed(1)}°C. ${base}`;
}

/** 12:00–16:00 Asia/Kolkata today as UTC dates (IST = UTC+5:30, no DST). */
function peakWindowToday(): { start: Date; end: Date } {
  const kolkataNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  const y = kolkataNow.getFullYear();
  const m = kolkataNow.getMonth();
  const d = kolkataNow.getDate();
  return {
    start: new Date(Date.UTC(y, m, d, 6, 30, 0)),
    end: new Date(Date.UTC(y, m, d, 10, 30, 0)),
  };
}

async function main() {
  const envPath = path.join(process.cwd(), ".env");
  if (!process.env.POSTGRES_URL && fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf8").match(/POSTGRES_URL=(.+)/);
    if (m) process.env.POSTGRES_URL = m[1].trim();
  }

  const db = getDb();
  const locations = await db.select().from(locationsTable).orderBy(locationsTable.id);
  console.log(`wards: ${locations.length}`);

  const computedAt = new Date();
  const snapshots: (typeof wardSnapshotsTable.$inferInsert)[] = [];
  const failures: Array<{ id: number; error: string }> = [];

  for (let i = 0; i < locations.length; i += CONCURRENCY) {
    const batch = locations.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (loc) => {
        try {
          const [weather, pop] = await Promise.all([
            getWeatherWindow(loc.id, 72, db),
            getLatestPopulation(loc.id, db),
          ]);
          const r = buildRiskResponse({ location: loc, weatherRows: weather, population: pop });
          return {
            locationId: loc.id,
            risk: r.compositeRisk.value,
            category: r.compositeRisk.category,
            thermal: r.scores.thermalStress,
            exposure: r.scores.exposure,
            vulnerability: r.scores.vulnerability,
            persistence: r.scores.persistence,
            recovery: r.scores.nighttimeRecovery,
            wbgt: r.indicators.wbgt,
            heatIndex: r.indicators.heatIndex,
            confidence: r.confidence.score,
            computedAt,
          };
        } catch (e) {
          failures.push({ id: loc.id, error: (e as Error).message });
          return null;
        }
      }),
    );
    for (const s of results) if (s) snapshots.push(s);
    console.log(`  ${Math.min(i + CONCURRENCY, locations.length)}/${locations.length} ok=${snapshots.length} fail=${failures.length}`);
  }

  if (snapshots.length > 0) {
    for (let i = 0; i < snapshots.length; i += 50) {
      await db.insert(wardSnapshotsTable).values(snapshots.slice(i, i + 50));
    }
    console.log(`inserted ${snapshots.length} snapshots at ${computedAt.toISOString()}`);
  }

  const popRows = await db.select().from(populationTable);
  const wardNameOf = new Map(
    popRows.map((p) => [p.locationId, p.wardName ?? `Ward ${p.ward ?? p.locationId}`]),
  );

  const activeAlerts = await db
    .select()
    .from(alertsTable)
    .where(eq(alertsTable.status, "active"));
  const activeByWard = new Map(activeAlerts.map((a) => [a.wardId, a]));

  const hot = snapshots.filter((s) => s.risk >= 0.5);
  console.log(`hot wards (risk>=0.5): ${hot.length}`);

  const { start, end } = peakWindowToday();
  let inserted = 0;
  for (const s of hot) {
    if (activeByWard.has(s.locationId)) continue;
    const severity = s.category === "VERY_HIGH" ? "EXTREME" : "HIGH";
    await db.insert(alertsTable).values({
      wardId: s.locationId,
      severity,
      riskScore: s.risk,
      peakWindowStart: start,
      peakWindowEnd: end,
      advisoryText: advisoryFor(severity, wardNameOf.get(s.locationId) ?? `Ward ${s.locationId}`, s.wbgt),
      status: "active",
    });
    inserted++;
  }
  console.log(`inserted ${inserted} new alerts`);

  const hotIds = new Set(hot.map((s) => s.locationId));
  let resolved = 0;
  for (const a of activeAlerts) {
    if (!hotIds.has(a.wardId)) {
      await db.update(alertsTable).set({ status: "resolved" }).where(eq(alertsTable.id, a.id));
      resolved++;
    }
  }
  console.log(`resolved ${resolved} stale alerts`);

  if (failures.length > 0) console.log("failures:", JSON.stringify(failures.slice(0, 10)));
  console.log("done");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
