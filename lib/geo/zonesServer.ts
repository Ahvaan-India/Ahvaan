/**
 * Server-only static zone catalogue reader (API routes — never import from
 * client components; this module pulls in `node:fs`/`node:path`).
 * Parsed once and kept in memory.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import type { StaticZonesFile } from "./zones";
import { ZONES_JSON_PATH } from "./zones";

let zonesMem: StaticZonesFile | null = null;

/** Parsed `zones.json`, kept in memory after the first read. */
export async function loadZonesStatic(): Promise<StaticZonesFile | null> {
  if (zonesMem) return zonesMem;
  try {
    const raw = await readFile(
      path.resolve(process.cwd(), ZONES_JSON_PATH),
      "utf8",
    );
    const file = JSON.parse(raw) as StaticZonesFile;
    if (Array.isArray(file.zones)) zonesMem = file;
    return zonesMem;
  } catch {
    return null;
  }
}

/** Test hook: drop the server-side memory cache. */
export function clearZonesCache(): void {
  zonesMem = null;
}
