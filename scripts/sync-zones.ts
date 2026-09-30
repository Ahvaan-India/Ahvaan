#!/usr/bin/env tsx
/**
 * `npm run sync:zones` — one-time / re-runnable zone data-sync.
 *
 * ```
 * public/data/census-data.json   (zone polygons + backend vulnerability)
 *   + Postgres forecast           (heat_point_id ↔ unique_location_id, dates)
 *    ↓  this script
 * public/data/zones.json         <- runtime source: plotting, lookup, vulnerability
 * public/data/manifest.json      <- dates, districts, counts
 *    ↓  Ahvaan map (no DB per map load for base data; live hourly via API)
 * ```
 *
 * `public/data/heatpoints.json` is BACKEND-OWNED (real tile coordinates) —
 * this script never writes it, only validates id coverage against Postgres.
 * Re-run any time to pick up new forecasts/zones.
 *
 * Usage:
 *   npm run sync:zones
 */

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";

function loadEnvFiles(): void {
  for (const name of [".env", ".env.local"]) {
    const abs = path.resolve(process.cwd(), name);
    if (!existsSync(abs)) continue;
    const raw = readFileSync(abs, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      if (!key || process.env[key] !== undefined) continue;
      let val = trimmed.slice(idx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnvFiles();

import { getDb } from "../lib/db/index";
import { forecastTable } from "../lib/db/schema";
import type {
  DistrictBordersFile,
  Heatpoint,
  StaticZone,
  StaticZonesFile,
  ZoneKind,
  ZonesManifest,
} from "../lib/geo/zones";
import {
  DISTRICTS_JSON_PATH,
  HEATPOINTS_JSON_PATH,
  ZONES_JSON_PATH,
  ZONES_MANIFEST_PATH,
} from "../lib/geo/zones";

type Pt = [number, number];

/** Aggressive ring thinning for the static file (target ≤ MAX pts). */
const MAX_RING_PTS = 64;

function thinRing(pts: Pt[]): Pt[] {
  if (pts.length <= MAX_RING_PTS) {
    return pts.map(([x, y]) => [
      Math.round(x * 100000) / 100000,
      Math.round(y * 100000) / 100000,
    ]);
  }
  const step = Math.ceil(pts.length / MAX_RING_PTS);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i += step) {
    out.push([
      Math.round(pts[i][0] * 100000) / 100000,
      Math.round(pts[i][1] * 100000) / 100000,
    ]);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    out.push(first);
  }
  return out;
}

function isPoint(p: unknown): p is Pt {
  return (
    Array.isArray(p) &&
    typeof p[0] === "number" &&
    typeof p[1] === "number" &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1])
  );
}

function collectRings(node: unknown, out: Pt[][]): void {
  if (!Array.isArray(node) || node.length === 0) return;
  if (isPoint(node[0])) {
    out.push((node as unknown[]).filter(isPoint));
    return;
  }
  for (const child of node as unknown[]) collectRings(child, out);
}


async function main(): Promise<void> {
  const started = Date.now();
  if (!process.env.POSTGRES_URL) {
    throw new Error(
      "POSTGRES_URL is not set. Copy .env.example to .env and configure it first.",
    );
  }

  const raw = await readFile(
    path.resolve(process.cwd(), "public/data/census-data.json"),
    "utf8",
  );
  const census = JSON.parse(raw) as {
    states: Record<
      string,
      {
        districts: Record<
          string,
          {
            name: string;
            zones: Array<{
              uniqueLocationId: string;
              polygons: { rings: unknown };
              vulnerability: number | null;
              locationLevel: string;
              wardName: string | null;
              wardId: number | null;
              districtId: number | string;
              districtName: string;
              villageName: string | null;
              subDistrictName: string | null;
            }>;
          }
        >;
      }
    >;
  };

  const db = getDb();
  const pairs = await db
    .select({
      heatPointId: forecastTable.heatPointId,
      uniqueLocationId: forecastTable.uniqueLocationId,
    })
    .from(forecastTable)
    .groupBy(forecastTable.heatPointId, forecastTable.uniqueLocationId)
    .orderBy(forecastTable.heatPointId);
  const dateRows = await db
    .selectDistinct({ date: forecastTable.date })
    .from(forecastTable)
    .orderBy(forecastTable.date);
  const dates = dateRows.map((r) => r.date);

  const hpByZone = new Map<string, number[]>();
  for (const p of pairs) {
    const list = hpByZone.get(p.uniqueLocationId) ?? [];
    list.push(p.heatPointId);
    hpByZone.set(p.uniqueLocationId, list);
  }
  for (const list of hpByZone.values()) list.sort((a, b) => a - b);

  const warnings: string[] = [];
  const zones: StaticZone[] = [];
  const districtAgg = new Map<string, { name: string; zones: number; heatpoints: number }>();
  // Full-precision outer rings per district for boundary extraction below.
  const outerByDistrict = new Map<string, Pt[][]>();

  for (const state of Object.values(census.states)) {
    for (const [jsonCode, dist] of Object.entries(state.districts)) {
      // Canonical district code = census districtId (matches the
      // unique_location_id prefix 19_<code>_… used by forecast rows).
      const sampleId = dist.zones[0]?.districtId;
      const code = String(sampleId ?? jsonCode);
      const name = (dist.name ?? "").trim();
      const agg = districtAgg.get(code) ?? { name, zones: 0, heatpoints: 0 };
      for (const z of dist.zones) {
        const candidates: Pt[][] = [];
        collectRings(z.polygons?.rings, candidates);
        if (candidates.length === 0) {
          warnings.push(`zone ${z.uniqueLocationId}: no polygon rings, skipped`);
          continue;
        }
        let outer = candidates[0];
        for (const c of candidates) if (c.length > outer.length) outer = c;

        let sx = 0;
        let sy = 0;
        for (const [x, y] of outer) {
          sx += x;
          sy += y;
        }
        const n = outer.length || 1;
        const centroid: Pt = [sx / n, sy / n];
        const ring = thinRing(outer);
        const dcode = String(z.districtId ?? code);
        const list = outerByDistrict.get(dcode) ?? [];
        list.push(outer);
        outerByDistrict.set(dcode, list);

        const hpIds = hpByZone.get(z.uniqueLocationId) ?? [];
        if (hpIds.length === 0) {
          warnings.push(`zone ${z.uniqueLocationId}: no forecast heatpoints in DB`);
        }

        const vuln =
          typeof z.vulnerability === "number" && Number.isFinite(z.vulnerability)
            ? Math.round(z.vulnerability * 100) / 100
            : null;
        zones.push({
          ulid: z.uniqueLocationId,
          district: (z.districtName ?? dist.name ?? "").trim(),
          districtCode: String(z.districtId ?? code),
          name: z.wardName ?? z.villageName ?? z.subDistrictName ?? z.uniqueLocationId,
          kind: (z.locationLevel as ZoneKind) ?? "VILLAGE",
          ward: typeof z.wardId === "number" ? z.wardId : null,
          vulnerability: vuln,
          lat: centroid[1],
          long: centroid[0],
          ring,
          heatpoints: hpIds,
        });
        agg.zones += 1;
        agg.heatpoints += hpIds.length;
      }
      districtAgg.set(code, agg);
    }
  }

  if (zones.length === 0) throw new Error("sync:zones aborted: 0 zones parsed.");

  zones.sort((a, b) => (a.ulid < b.ulid ? -1 : 1));

  // District boundaries: segments occurring exactly once within a district
  // (shared internal edges occur twice and cancel). Inter-district edges
  // survive in both districts — same line, drawn once each.
  const r5 = (n: number) => Math.round(n * 100000) / 100000;
  const segKey = (a: Pt, b: Pt): string => {
    const k1 = `${r5(a[0])},${r5(a[1])}`;
    const k2 = `${r5(b[0])},${r5(b[1])}`;
    return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
  };
  const districtBorders: DistrictBordersFile["districts"] = [];
  for (const [dcode, rings] of outerByDistrict) {
    const counts = new Map<string, { n: number; seg: [number, number, number, number] }>();
    for (const ring of rings) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const key = segKey(a, b);
        const hit = counts.get(key);
        if (hit) hit.n += 1;
        else counts.set(key, { n: 1, seg: [r5(a[0]), r5(a[1]), r5(b[0]), r5(b[1])] });
      }
    }
    const boundary: Array<[number, number, number, number]> = [];
    for (const { n, seg } of counts.values()) if (n === 1) boundary.push(seg);
    const aggName = districtAgg.get(dcode)?.name ?? dcode;
    districtBorders.push({ code: dcode, name: aggName, segments: boundary });
    if (boundary.length === 0) warnings.push(`district ${dcode}: empty boundary`);
  }
  districtBorders.sort((a, b) => (a.code < b.code ? -1 : 1));

  // Backend-owned heatpoints.json: validate id coverage + coordinate sanity,
  // never write it.
  const hpRaw = await readFile(
    path.resolve(process.cwd(), HEATPOINTS_JSON_PATH),
    "utf8",
  );
  const hpFile = JSON.parse(hpRaw) as Heatpoint[];
  const dbIds = new Set(pairs.map((p) => p.heatPointId));
  const fileIds = new Set<number>();
  let badCoords = 0;
  const zoneUlids = new Set(zones.map((z) => z.ulid));
  for (const h of hpFile) {
    fileIds.add(h.id);
    if (
      typeof h.latitude !== "number" ||
      typeof h.longitude !== "number" ||
      !Number.isFinite(h.latitude) ||
      !Number.isFinite(h.longitude) ||
      h.latitude < 20 ||
      h.latitude > 25 ||
      h.longitude < 86 ||
      h.longitude > 91
    ) {
      badCoords += 1;
    }
    if (!zoneUlids.has(h.uniqueLocationId)) {
      warnings.push(`heatpoint ${h.id}: unknown uniqueLocationId ${h.uniqueLocationId}`);
    }
  }
  const missingInFile = [...dbIds].filter((id) => !fileIds.has(id));
  const extraInFile = [...fileIds].filter((id) => !dbIds.has(id));
  if (missingInFile.length > 0) {
    warnings.push(`${missingInFile.length} DB heat_point_ids missing from heatpoints.json (e.g. ${missingInFile.slice(0, 5).join(",")})`);
  }
  if (extraInFile.length > 0) {
    warnings.push(`${extraInFile.length} heatpoints.json ids absent from DB (e.g. ${extraInFile.slice(0, 5).join(",")})`);
  }
  if (badCoords > 0) warnings.push(`${badCoords} heatpoints with out-of-region coordinates`);

  const totalHp = [...hpByZone.values()].reduce((s, l) => s + l.length, 0);
  const generatedAt = new Date().toISOString();
  const zonesFile: StaticZonesFile = {
    generatedAt,
    source: "census-data.json polygons + vulnerability, heatpoint mapping from Postgres forecast",
    count: zones.length,
    zones,
  };
  const manifest: ZonesManifest = {
    generatedAt,
    dates,
    districts: [...districtAgg.entries()].map(([code, a]) => ({ code, ...a })),
    counts: { zones: zones.length, heatpoints: totalHp, dates: dates.length },
  };
  const bordersFile: DistrictBordersFile = {
    generatedAt,
    source: "outer-boundary segments per district (segments shared by two zones cancel)",
    districts: districtBorders,
  };

  const outDir = path.resolve(process.cwd(), "public/data");
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(path.resolve(process.cwd(), ZONES_JSON_PATH), JSON.stringify(zonesFile) + "\n", "utf8"),
    writeFile(path.resolve(process.cwd(), ZONES_MANIFEST_PATH), JSON.stringify(manifest, null, 2) + "\n", "utf8"),
    writeFile(path.resolve(process.cwd(), DISTRICTS_JSON_PATH), JSON.stringify(bordersFile) + "\n", "utf8"),
  ]);

  console.log(`sync:zones done in ${Date.now() - started}ms`);
  console.log(`  zones:      ${zones.length} -> ${ZONES_JSON_PATH}`);
  console.log(`  borders:    ${districtBorders.map((d) => `${d.code}:${d.segments.length}`).join(" ")} segments -> ${DISTRICTS_JSON_PATH}`);
  console.log(`  heatpoints: backend-owned ${hpFile.length} entries validated (ids in DB: ${dbIds.size - missingInFile.length}/${dbIds.size})`);
  console.log(`  dates:      ${dates.join(", ")}`);
  for (const [code, a] of districtAgg) {
    console.log(`  district ${code} ${a.name}: ${a.zones} zones, ${a.heatpoints} heatpoints`);
  }
  if (warnings.length > 0) {
    console.log(`  warnings (${warnings.length}):`);
    for (const w of warnings.slice(0, 20)) console.log(`    - ${w}`);
    if (warnings.length > 20) console.log(`    ... and ${warnings.length - 20} more`);
  }
}

main().catch((err) => {
  console.error("sync:zones failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
