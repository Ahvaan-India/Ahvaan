/**
 * Shared polygon-ring downsampling for ward map payloads.
 * Live DB stores rings as raw [[lon,lat],...]; we thin + round them so the
 * heatmap/wards endpoints stay small enough for a single dashboard load.
 */
export function downsampleRing(geometry: unknown): Array<[number, number]> {
  if (!Array.isArray(geometry)) return [];
  const pts = (geometry as unknown[]).filter(
    (p): p is [number, number] =>
      Array.isArray(p) &&
      typeof p[0] === "number" &&
      typeof p[1] === "number" &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]),
  );
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
