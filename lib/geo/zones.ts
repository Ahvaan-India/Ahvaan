/**
 * Static zone dataset — shared runtime types + client-safe helpers.
 *
 * Pipeline:
 * ```
 * census-data.json (zone polygons + backend vulnerability, 3 districts)
 *   + Postgres forecast (heat_point_id ↔ unique_location_id, dates)
 *    ↓  scripts/sync-zones.ts (`npm run sync:zones`, re-runnable)
 * public/data/zones.json + public/data/manifest.json
 *    ↓  this module (browser fetch + in-memory cache, NO database per map load)
 * Ahvaan map (plotting, lookup, vulnerability, gradients)
 * ```
 *
 * `public/data/heatpoints.json` is backend-owned (real tile coordinates) and
 * read directly — the sync script only validates its coverage, never writes it.
 * Live hourly values always come from Postgres (`forecast`/`analysis`).
 */

export type ZoneKind = "WARD" | "VILLAGE" | "TOWN_COMBINED";

/** One zone in `public/data/zones.json`. Ring is [lon, lat] (GeoJSON order). */
export interface StaticZone {
  ulid: string;
  district: string;
  districtCode: string;
  name: string;
  kind: ZoneKind;
  ward: number | null;
  /** Backend vulnerability 0–100 (census-data.json), null when absent. */
  vulnerability: number | null;
  lat: number;
  long: number;
  ring: Array<[number, number]>;
  /** heat_point_ids inside this zone (sorted ascending). */
  heatpoints: number[];
}

export interface StaticZonesFile {
  generatedAt: string;
  source: string;
  count: number;
  zones: StaticZone[];
}

/** One backend heatpoint in `public/data/heatpoints.json` (array shape).
 *  Owned by the backend service — real tile coordinates, NOT derived.
 *  `id` (heat_point_id) links to `forecast`; `uniqueLocationId` to zones. */
export interface Heatpoint {
  id: number;
  uniqueLocationId: string;
  latitude: number;
  longitude: number;
}

export type HeatpointsFile = Heatpoint[];

export interface DistrictStat {
  code: string;
  name: string;
  zones: number;
  heatpoints: number;
}

export interface ZonesManifest {
  generatedAt: string;
  dates: string[];
  districts: DistrictStat[];
  counts: { zones: number; heatpoints: number; dates: number };
}

export const ZONES_JSON_PATH = "public/data/zones.json";
export const HEATPOINTS_JSON_PATH = "public/data/heatpoints.json";
export const ZONES_MANIFEST_PATH = "public/data/manifest.json";
export const DISTRICTS_JSON_PATH = "public/data/districts.json";

export const ZONES_JSON_URL = "/data/zones.json";
export const HEATPOINTS_JSON_URL = "/data/heatpoints.json";
export const ZONES_MANIFEST_URL = "/data/manifest.json";
export const DISTRICTS_JSON_URL = "/data/districts.json";

/** District boundary segments: [x1, y1, x2, y2] in lon/lat (5dp). */
export interface DistrictBoundary {
  code: string;
  name: string;
  segments: Array<[number, number, number, number]>;
}

export interface DistrictBordersFile {
  generatedAt: string;
  source: string;
  districts: DistrictBoundary[];
}

// ---------------------------------------------------------------------------
// Browser fetchers with in-memory parsed-JSON cache (no database involved).
// ---------------------------------------------------------------------------

const fetchMem = new Map<string, unknown>();

export async function fetchStaticJson<T>(url: string): Promise<T> {
  const hit = fetchMem.get(url);
  if (hit !== undefined) return hit as T;
  if (typeof window === "undefined") {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const cleanUrl = url.startsWith("/") ? url.slice(1) : url;
      const filePath = path.join(process.cwd(), "public", cleanUrl);
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content) as T;
      fetchMem.set(url, data);
      return data;
    } catch {
      // Fallback to fetch if filesystem read fails
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  const data = (await res.json()) as T;
  fetchMem.set(url, data);
  return data;
}

/** Test hook: drop the browser memory cache. */
export function clearFetchCache(): void {
  fetchMem.clear();
}

/** Zone lookup by unique_location_id (map plotting / search fallback). */
export function findZone(
  zones: StaticZone[] | null | undefined,
  ulid: string,
): StaticZone | null {
  if (!zones) return null;
  return zones.find((z) => z.ulid === ulid) ?? null;
}
