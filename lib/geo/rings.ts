/**
 * Shared polygon-ring downsampling for ward map payloads.
 *
 * Live DB stores geometry as NESTED polygon arrays (ArcGIS-style_polygon:
 * `[[[lon,lat],...]]`, sometimes multi-ring). We unwrap to the outer ring,
 * then thin + round so heatmap/wards payloads stay small enough for a
 * single dashboard load. Map components skip wards with empty rings, so
 * this must never return [] for a ward that has coordinates.
 */

type Pt = [number, number];

function isPoint(p: unknown): p is Pt {
  return (
    Array.isArray(p) &&
    typeof p[0] === "number" &&
    typeof p[1] === "number" &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1])
  );
}

/** Collect every coordinate-ring candidate at any nesting depth. */
function collectRings(node: unknown, out: Pt[][]): void {
  if (!Array.isArray(node) || node.length === 0) return;
  if (isPoint(node[0])) {
    out.push((node as unknown[]).filter(isPoint));
    return;
  }
  for (const child of node as unknown[]) collectRings(child, out);
}

export function downsampleRing(geometry: unknown): Array<[number, number]> {
  if (!Array.isArray(geometry)) return [];
  // Fast path: already a flat ring.
  if (geometry.length > 0 && isPoint(geometry[0])) {
    return thin((geometry as unknown[]).filter(isPoint));
  }
  const candidates: Pt[][] = [];
  collectRings(geometry, candidates);
  if (candidates.length === 0) return [];
  // Outer ring = longest candidate (holes are always shorter).
  let best = candidates[0];
  for (const c of candidates) if (c.length > best.length) best = c;
  return thin(best);
}

function thin(pts: Pt[]): Array<[number, number]> {
  if (pts.length === 0) return [];
  const step = pts.length > 80 ? 2 : 1;
  const out: Array<[number, number]> = [];
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
