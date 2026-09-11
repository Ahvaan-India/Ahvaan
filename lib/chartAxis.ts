/**
 * Shared chart-axis helpers (single source for recharts axis presentation).
 * Every axis names its parameter (xLabel/yLabel) and numeric domains/ticks
 * are derived from the data (domain100/domainRaw/ceilNice/dataBins) so
 * charts never show crowded fixed ranges.
 */

export const AXIS_TICK = {
  fontSize: 11,
  fill: "hsl(var(--muted-foreground))",
} as const;

/** Parameter title under an X axis (which parameter is plotted). */
export const xLabel = (value: string) => ({
  value,
  position: "insideBottom" as const,
  offset: 0,
  fontSize: 11,
  fill: "hsl(var(--muted-foreground))",
});

/** Parameter title beside a Y axis (which parameter is plotted). */
export const yLabel = (value: string) => ({
  value,
  angle: -90,
  position: "insideLeft" as const,
  offset: 0,
  fontSize: 11,
  fill: "hsl(var(--muted-foreground))",
});

/** Padded data-driven domain for 0–100 parameters (risk, exposure …). */
export function domain100(
  values: Array<number | null | undefined>,
  pad = 0.1,
): [number, number] {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (!nums.length) return [0, 100];
  let lo = Math.min(...nums);
  let hi = Math.max(...nums);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  return [
    Math.max(0, Math.floor(lo - span * pad)),
    Math.min(100, Math.ceil(hi + span * pad)),
  ];
}

/** Padded data-driven domain for raw units (°C, counts …). */
export function domainRaw(
  values: Array<number | null | undefined>,
  pad = 0.12,
): [number, number] {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (!nums.length) return [0, 1];
  let lo = Math.min(...nums);
  let hi = Math.max(...nums);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  const f =
    span > 50
      ? (v: number) => Math.round(v)
      : (v: number) => Math.round(v * 10) / 10;
  return [f(lo - span * pad), f(hi + span * pad)];
}

/** Round up to a nice 1/2/5 × 10ⁿ ceiling for axis maximums. */
export function ceilNice(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function fmtBin(v: number, decimals: number): string {
  return decimals === 0
    ? String(Math.round(v))
    : String(Math.round(v * 10) / 10);
}

/** Even bins across the actual data range (for °C histograms). */
export function dataBins(
  values: Array<number | null | undefined>,
  maxBins = 6,
  decimals = 1,
): Array<{ bucket: string; count: number }> {
  const nums = values
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!nums.length) return [];
  const lo = nums[0];
  const hi = nums[nums.length - 1];
  const n = Math.max(3, Math.min(maxBins, Math.ceil(Math.sqrt(nums.length))));
  if (hi - lo < 1e-9)
    return [{ bucket: fmtBin(lo, decimals), count: nums.length }];
  const w = (hi - lo) / n;
  return Array.from({ length: n }, (_, i) => {
    const bLo = lo + i * w;
    const bHi = i === n - 1 ? hi + 1e-9 : lo + (i + 1) * w;
    return {
      bucket: `${fmtBin(bLo, decimals)}–${fmtBin(bHi, decimals)}`,
      count: nums.filter((v) => v >= bLo && v < bHi).length,
    };
  });
}
