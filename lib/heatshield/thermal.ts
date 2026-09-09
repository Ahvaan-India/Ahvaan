import { THERMAL_NORMALIZATION_BOUNDS, THERMAL_WEIGHTS } from "./config";

/**
 * Thermal stress indicators. Pure functions  no I/O.
 *
 * Sources:
 *  - Saturation vapour pressure: Magnus–Tetens approximation
 *    (Alduchov & Eskridge 1996): es = 6.105 * exp(17.27*T / (237.7+T)).
 *  - WBGT approximation for shaded/no-radiation contexts:
 *    WBGT ≈ 0.567*T + 0.393*e + 3.94 (e = vapour pressure in hPa).
 *    NOTE: this omits the globe-temperature / solar term, so it
 *    understates full-sun WBGT. Direct+diffuse radiation columns exist
 *    in the schema for a future Liljegren-style upgrade.
 *  - Heat Index: NWS Rothfusz regression (NWS SR 90-23) with the two
 *    standard adjustment sub-cases (low-RH reduction, high-RH addition)
 *    plus the sub-80°F simple-formula path.
 */

export function clip(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Saturation vapour pressure (hPa) via Magnus–Tetens. Ta in °C. */
export function magnusTetensSatVaporPressure(Ta: number): number {
  return 6.105 * Math.exp((17.27 * Ta) / (237.7 + Ta));
}

/** Actual vapour pressure (hPa). RH in %, Ta in °C. */
export function vaporPressure(RH: number, Ta: number): number {
  return (RH / 100) * magnusTetensSatVaporPressure(Ta);
}

/**
 * Approximate WBGT (°C) from air temp + humidity only.
 * Formula: 0.567*Ta + 0.393*e + 3.94, e from vaporPressure().
 * Surface pressure is NOT needed here (spec gap: `pressure` is logged as
 * missing in confidence metadata, but the math is unaffected).
 */
export function wbgtApprox(Ta: number, RH: number): number {
  const e = vaporPressure(RH, Ta);
  return 0.567 * Ta + 0.393 * e + 3.94;
}

/**
 * Rothfusz Heat Index in °C. Input Tc in °C, RH in %.
 * Implements the full NWS procedure:
 *  1. Convert to °F.
 *  2. If T < 80°F use the simple Steadman-derived linear blend.
 *  3. Else the 9-term Rothfusz regression.
 *  4. Low-RH/high-temp reduction; high-RH addition (NWS caveats  the
 *     source PDF only prints the base polynomial, these come from
 *     NWS SR 90-23 / weather.gov documentation).
 *  5. Convert back to °C.
 */
export function heatIndexRothfusz(Tc: number, RH: number): number {
  const T = (Tc * 9) / 5 + 32; // °F
  const R = RH;

  let hiF: number;
  if (T < 80) {
    // Simple formula for cooler conditions.
    hiF = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + R * 0.094);
    // NWS: use the average with actual T when the blend is very cool.
    const avg = (hiF + T) / 2;
    if (avg < 80) {
      hiF = avg;
    } else {
      hiF = rothfuszRegression(T, R);
      hiF = applyRothfuszAdjustments(hiF, T, R);
    }
  } else {
    hiF = rothfuszRegression(T, R);
    hiF = applyRothfuszAdjustments(hiF, T, R);
  }

  return ((hiF - 32) * 5) / 9;
}

function rothfuszRegression(T: number, R: number): number {
  return (
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    0.00683783 * T * T -
    0.05481717 * R * R +
    0.00122874 * T * T * R +
    0.00085282 * T * R * R -
    0.00000199 * T * T * R * R
  );
}

/** NWS adjustment sub-cases (source: weather.gov heat-index documentation). */
function applyRothfuszAdjustments(hiF: number, T: number, R: number): number {
  let hi = hiF;
  // Low humidity + high heat: reduce.
  if (R < 13 && T >= 80 && T <= 112) {
    hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  } else if (R > 85 && T >= 80 && T <= 87) {
    // High humidity + warm (not extreme): add.
    hi += ((R - 85) / 10) * ((87 - T) / 5);
  }
  return hi;
}

/** Linear min–max normalization to 0–1 with clipping. */
export function normalizeThermalIndicator(
  value: number,
  min: number,
  max: number,
): number {
  if (max <= min) throw new Error("max must exceed min");
  return clip((value - min) / (max - min));
}

/**
 * Weighted thermal stress 0–1.
 * Dynamic redistribution: if UTCI is unavailable, wWBGT + wHI are rescaled
 * to sum to 1.0 proportionally. A missing metric is NEVER treated as 0
 * (that would silently drag the score toward "cool").
 */
export function computeThermalStress({
  wbgt,
  heatIndex,
  utci,
  utciAvailable,
}: {
  wbgt: number;
  heatIndex: number;
  utci: number | null;
  utciAvailable: boolean;
}): { score: number; weights: Record<string, number> } {
  const nWbgt = normalizeThermalIndicator(
    wbgt,
    THERMAL_NORMALIZATION_BOUNDS.wbgt.min,
    THERMAL_NORMALIZATION_BOUNDS.wbgt.max,
  );
  const nHi = normalizeThermalIndicator(
    heatIndex,
    THERMAL_NORMALIZATION_BOUNDS.heatIndex.min,
    THERMAL_NORMALIZATION_BOUNDS.heatIndex.max,
  );

  if (!utciAvailable || utci === null) {
    const total = THERMAL_WEIGHTS.wbgt + THERMAL_WEIGHTS.heatIndex;
    const wWbgt = THERMAL_WEIGHTS.wbgt / total;
    const wHi = THERMAL_WEIGHTS.heatIndex / total;
    return {
      score: clip(wWbgt * nWbgt + wHi * nHi),
      weights: { wbgt: wWbgt, heatIndex: wHi },
    };
  }

  const nUtci = normalizeThermalIndicator(
    utci,
    THERMAL_NORMALIZATION_BOUNDS.utci.min,
    THERMAL_NORMALIZATION_BOUNDS.utci.max,
  );
  return {
    score: clip(
      THERMAL_WEIGHTS.wbgt * nWbgt +
        THERMAL_WEIGHTS.heatIndex * nHi +
        THERMAL_WEIGHTS.utci * nUtci,
    ),
    weights: { ...THERMAL_WEIGHTS },
  };
}
