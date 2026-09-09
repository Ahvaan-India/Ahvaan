import { vaporPressure } from "./thermal";

/**
 * Ahvaan UTCI  Bröde et al. 2012 polynomial via pythermalcomfort.
 * Flagged as estimated when Tmrt is derived from radiation (not measured).
 * Source: pythermalcomfort/models/utci.py _utci_optimized (210 coeff, vectorized).
 * Ported to scalar TS; valid for -50<Ta<50, Tr-Ta in [-30,70], 0.5<v<17.
 */

function utciOptimized(
  tdb: number,
  v: number,
  delta: number,
  pa: number,
): number {
  // Full 210-term polynomial  keep as single expression for fidelity to source.
  // Coefficients copied verbatim from pythermalcomfort; prettier-ignore on.
  return (
    tdb +
    0.607562052 +
    -0.0227712343 * tdb +
    8.06470249e-4 * tdb * tdb +
    -1.54271372e-4 * tdb * tdb * tdb +
    -3.24651735e-6 * tdb * tdb * tdb * tdb +
    7.32602852e-8 * tdb * tdb * tdb * tdb * tdb +
    1.35959073e-9 * tdb * tdb * tdb * tdb * tdb * tdb +
    -2.2583652 * v +
    0.0880326035 * tdb * v +
    0.00216844454 * tdb * tdb * v +
    -1.53347087e-5 * tdb * tdb * tdb * v +
    -5.72983704e-7 * tdb * tdb * tdb * tdb * v +
    -2.55090145e-9 * tdb * tdb * tdb * tdb * tdb * v +
    -0.751269505 * v * v +
    -0.00408350271 * tdb * v * v +
    -5.21670675e-5 * tdb * tdb * v * v +
    1.94544667e-6 * tdb * tdb * tdb * v * v +
    1.14099531e-8 * tdb * tdb * tdb * tdb * v * v +
    0.158137256 * v * v * v +
    -6.57263143e-5 * tdb * v * v * v +
    2.22697524e-7 * tdb * tdb * v * v * v +
    -4.16117031e-8 * tdb * tdb * tdb * v * v * v +
    -0.0127762753 * v * v * v * v +
    9.66891875e-6 * tdb * v * v * v * v +
    2.52785852e-9 * tdb * tdb * v * v * v * v +
    4.56306672e-4 * v * v * v * v * v +
    -1.74202546e-7 * tdb * v * v * v * v * v +
    -5.91491269e-6 * v * v * v * v * v * v +
    0.398374029 * delta +
    1.83945314e-4 * tdb * delta +
    -1.7375451e-4 * tdb * tdb * delta +
    -7.60781159e-7 * tdb * tdb * tdb * delta +
    3.77830287e-8 * tdb * tdb * tdb * tdb * delta +
    5.43079673e-10 * tdb * tdb * tdb * tdb * tdb * delta +
    -0.0200518269 * v * delta +
    8.92859837e-4 * tdb * v * delta +
    3.45433048e-6 * tdb * tdb * v * delta +
    -3.77925774e-7 * tdb * tdb * tdb * v * delta +
    -1.69699377e-9 * tdb * tdb * tdb * tdb * v * delta +
    1.69992415e-4 * v * v * delta +
    -4.99204314e-5 * tdb * v * v * delta +
    2.47417178e-7 * tdb * tdb * v * v * delta +
    1.07596466e-8 * tdb * tdb * tdb * v * v * delta +
    8.49242932e-5 * v * v * v * delta +
    1.35191328e-6 * tdb * v * v * v * delta +
    -6.21531254e-9 * tdb * tdb * v * v * v * delta +
    -4.99410301e-6 * v * v * v * v * delta +
    -1.89489258e-8 * tdb * v * v * v * v * delta +
    8.15300114e-8 * v * v * v * v * v * delta +
    7.5504309e-4 * delta * delta +
    -5.65095215e-5 * tdb * delta * delta +
    -4.52166564e-7 * tdb * tdb * delta * delta +
    2.46688878e-8 * tdb * tdb * tdb * delta * delta +
    2.42674348e-10 * tdb * tdb * tdb * tdb * delta * delta +
    1.5454725e-4 * v * delta * delta +
    5.2411097e-6 * tdb * v * delta * delta +
    -8.75874982e-8 * tdb * tdb * v * delta * delta +
    -1.50743064e-9 * tdb * tdb * tdb * v * delta * delta +
    -1.56236307e-5 * v * v * delta * delta +
    -1.33895614e-7 * tdb * v * v * delta * delta +
    2.49709824e-9 * tdb * tdb * v * v * delta * delta +
    6.51711721e-7 * v * v * v * delta * delta +
    1.94960053e-9 * tdb * v * v * v * delta * delta +
    -1.00361113e-8 * v * v * v * v * delta * delta +
    -1.21206673e-5 * delta * delta * delta +
    -2.1820366e-7 * tdb * delta * delta * delta +
    7.51269482e-9 * tdb * tdb * delta * delta * delta +
    9.79063848e-11 * tdb * tdb * tdb * delta * delta * delta +
    1.25006734e-6 * v * delta * delta * delta +
    -1.81584736e-9 * tdb * v * delta * delta * delta +
    -3.52197671e-10 * tdb * tdb * v * delta * delta * delta +
    -3.3651463e-8 * v * v * delta * delta * delta +
    1.35908359e-10 * tdb * v * v * delta * delta * delta +
    4.1703262e-10 * v * v * v * delta * delta * delta +
    -1.30369025e-9 * delta * delta * delta * delta +
    4.13908461e-10 * tdb * delta * delta * delta * delta +
    9.22652254e-12 * tdb * tdb * delta * delta * delta * delta +
    -5.08220384e-9 * v * delta * delta * delta * delta +
    -2.24730961e-11 * tdb * v * delta * delta * delta * delta +
    1.17139133e-10 * v * v * delta * delta * delta * delta +
    6.62154879e-10 * delta * delta * delta * delta * delta +
    4.0386326e-13 * tdb * delta * delta * delta * delta * delta +
    1.95087203e-12 * v * delta * delta * delta * delta * delta +
    -4.73602469e-12 * delta * delta * delta * delta * delta * delta +
    5.12733497 * pa +
    -0.312788561 * tdb * pa +
    -0.0196701861 * tdb * tdb * pa +
    9.9969087e-4 * tdb * tdb * tdb * pa +
    9.51738512e-6 * tdb * tdb * tdb * tdb * pa +
    -4.66426341e-7 * tdb * tdb * tdb * tdb * tdb * pa +
    0.548050612 * v * pa +
    -0.00330552823 * tdb * v * pa +
    -0.0016411944 * tdb * tdb * v * pa +
    -5.16670694e-6 * tdb * tdb * tdb * v * pa +
    9.52692432e-7 * tdb * tdb * tdb * tdb * v * pa +
    -0.0429223622 * v * v * pa +
    0.00500845667 * tdb * v * v * pa +
    1.00601257e-6 * tdb * tdb * v * v * pa +
    -1.81748644e-6 * tdb * tdb * tdb * v * v * pa +
    -0.00125813502 * v * v * v * pa +
    -1.79330391e-4 * tdb * v * v * v * pa +
    2.34994441e-6 * tdb * tdb * v * v * v * pa +
    1.29735808e-4 * v * v * v * v * pa +
    1.2906487e-6 * tdb * v * v * v * v * pa +
    -2.28558686e-6 * v * v * v * v * v * pa +
    -0.0369476348 * delta * pa +
    0.00162325322 * tdb * delta * pa +
    -3.1427968e-5 * tdb * tdb * delta * pa +
    2.59835559e-6 * tdb * tdb * tdb * delta * pa +
    -4.77136523e-8 * tdb * tdb * tdb * tdb * delta * pa +
    0.0086420339 * v * delta * pa +
    -6.87405181e-4 * tdb * v * delta * pa +
    -9.13863872e-6 * tdb * tdb * v * delta * pa +
    5.15916806e-7 * tdb * tdb * tdb * v * delta * pa +
    -3.59217476e-5 * v * v * delta * pa +
    3.28696511e-5 * tdb * v * v * delta * pa +
    -7.10542454e-7 * tdb * tdb * v * v * delta * pa +
    -1.243823e-5 * v * v * v * delta * pa +
    -7.385844e-9 * tdb * v * v * v * delta * pa +
    2.20609296e-7 * v * v * v * v * delta * pa +
    -7.3246918e-4 * delta * delta * pa +
    -1.87381964e-5 * tdb * delta * delta * pa +
    4.80925239e-6 * tdb * tdb * delta * delta * pa +
    -8.7549204e-8 * tdb * tdb * tdb * delta * delta * pa +
    2.7786293e-5 * v * delta * delta * pa +
    -5.06004592e-6 * tdb * v * delta * delta * pa +
    1.14325367e-7 * tdb * tdb * v * delta * delta * pa +
    2.53016723e-6 * v * v * delta * delta * pa +
    -1.72857035e-8 * tdb * v * v * delta * delta * pa +
    -3.95079398e-8 * v * v * v * delta * delta * pa +
    -3.59413173e-7 * delta * delta * delta * pa +
    7.04388046e-7 * tdb * delta * delta * delta * pa +
    -1.89309167e-8 * tdb * tdb * delta * delta * delta * pa +
    -4.79768731e-7 * v * delta * delta * delta * pa +
    7.96079978e-9 * tdb * v * delta * delta * delta * pa +
    1.62897058e-9 * v * v * delta * delta * delta * pa +
    3.94367674e-8 * delta * delta * delta * delta * pa +
    -1.18566247e-9 * tdb * delta * delta * delta * delta * pa +
    3.34678041e-10 * v * delta * delta * delta * delta * pa +
    -1.15606447e-10 * delta * delta * delta * delta * delta * pa +
    -2.80626406 * pa * pa +
    0.548712484 * tdb * pa * pa +
    -0.0039942841 * tdb * tdb * pa * pa +
    -9.54009191e-4 * tdb * tdb * tdb * pa * pa +
    1.93090978e-5 * tdb * tdb * tdb * tdb * pa * pa +
    -0.308806365 * v * pa * pa +
    0.0116952364 * tdb * v * pa * pa +
    4.95271903e-4 * tdb * tdb * v * pa * pa +
    -1.90710882e-5 * tdb * tdb * tdb * v * pa * pa +
    0.00210787756 * v * v * pa * pa +
    -6.98445738e-4 * tdb * v * v * pa * pa +
    2.30109073e-5 * tdb * tdb * v * v * pa * pa +
    4.1785659e-4 * v * v * v * pa * pa +
    -1.27043871e-5 * tdb * v * v * v * pa * pa +
    -3.04620472e-6 * v * v * v * v * pa * pa +
    0.0514507424 * delta * pa * pa +
    -0.00432510997 * tdb * delta * pa * pa +
    8.99281156e-5 * tdb * tdb * delta * pa * pa +
    -7.14663943e-7 * tdb * tdb * tdb * delta * pa * pa +
    -2.66016305e-4 * v * delta * pa * pa +
    2.63789586e-4 * tdb * v * delta * pa * pa +
    -7.01199003e-6 * tdb * tdb * v * delta * pa * pa +
    -1.06823306e-4 * v * v * delta * pa * pa +
    3.61341136e-6 * tdb * v * v * delta * pa * pa +
    2.29748967e-7 * v * v * v * delta * pa * pa +
    3.04788893e-4 * delta * delta * pa * pa +
    -6.42070836e-5 * tdb * delta * delta * pa * pa +
    1.16257971e-6 * tdb * tdb * delta * delta * pa * pa +
    7.68023384e-6 * v * delta * delta * pa * pa +
    -5.47446896e-7 * tdb * v * delta * delta * pa * pa +
    -3.5993791e-8 * v * v * delta * delta * pa * pa +
    -4.36497725e-6 * delta * delta * delta * pa * pa +
    1.68737969e-7 * tdb * delta * delta * delta * pa * pa +
    2.67489271e-8 * v * delta * delta * delta * pa * pa +
    3.23926897e-9 * delta * delta * delta * delta * pa * pa +
    -0.0353874123 * pa * pa * pa +
    -0.22120119 * tdb * pa * pa * pa +
    0.0155126038 * tdb * tdb * pa * pa * pa +
    -2.63917279e-4 * tdb * tdb * tdb * pa * pa * pa +
    0.0453433455 * v * pa * pa * pa +
    -0.00432943862 * tdb * v * pa * pa * pa +
    1.45389826e-4 * tdb * tdb * v * pa * pa * pa +
    2.1750861e-4 * v * v * pa * pa * pa +
    -6.66724702e-5 * tdb * v * v * pa * pa * pa +
    3.3321714e-5 * v * v * v * pa * pa * pa +
    -0.00226921615 * delta * pa * pa * pa +
    3.80261982e-4 * tdb * delta * pa * pa * pa +
    -5.45314314e-9 * tdb * tdb * delta * pa * pa * pa +
    -7.96355448e-4 * v * delta * pa * pa * pa +
    2.53458034e-5 * tdb * v * delta * pa * pa * pa +
    -6.31223658e-6 * v * v * delta * pa * pa * pa +
    3.02122035e-4 * delta * delta * pa * pa * pa +
    -4.77403547e-6 * tdb * delta * delta * pa * pa * pa +
    1.73825715e-6 * v * delta * delta * pa * pa * pa +
    -4.09087898e-7 * delta * delta * delta * pa * pa * pa +
    0.614155345 * pa * pa * pa * pa +
    -0.0616755931 * tdb * pa * pa * pa * pa +
    0.00133374846 * tdb * tdb * pa * pa * pa * pa +
    0.00355375387 * v * pa * pa * pa * pa +
    -5.13027851e-4 * tdb * v * pa * pa * pa * pa +
    1.02449757e-4 * v * v * pa * pa * pa * pa +
    -0.00148526421 * delta * pa * pa * pa * pa +
    -4.11469183e-5 * tdb * delta * pa * pa * pa * pa +
    -6.80434415e-6 * v * delta * pa * pa * pa * pa +
    -9.77675906e-6 * delta * delta * pa * pa * pa * pa +
    0.0882773108 * pa * pa * pa * pa * pa +
    -0.00301859306 * tdb * pa * pa * pa * pa * pa +
    0.00104452989 * v * pa * pa * pa * pa * pa +
    2.47090539e-4 * delta * pa * pa * pa * pa * pa +
    0.00148348065 * pa * pa * pa * pa * pa * pa
  );
}

export function estimateTmrt(
  Ta: number,
  shortwaveRadiation: number | null | undefined,
  windSpeed10m: number | null | undefined,
): { tmrt: number; estimated: boolean } {
  const sr =
    typeof shortwaveRadiation === "number" &&
    Number.isFinite(shortwaveRadiation)
      ? Math.max(0, shortwaveRadiation)
      : 0;
  const v =
    typeof windSpeed10m === "number" && Number.isFinite(windSpeed10m)
      ? Math.max(0.5, windSpeed10m)
      : 1;
  // Empirical: Tmrt ≈ Ta + solar boost damped by wind. At 800 W/m² and 1 m/s, ~+18°C; at 5 m/s, ~+8°C.
  // Tuned against Liljegren sun/shade split; flagged as estimated so confidence can penalize.
  const boost = (sr * 0.022) / Math.pow(v, 0.3);
  return { tmrt: Ta + boost, estimated: sr > 0 };
}

export function computeUTCI(
  Ta: number,
  Tmrt: number,
  wind10m: number,
  RH: number,
): { utci: number; pa_kPa: number } {
  const pa_hPa = vaporPressure(RH, Ta);
  const pa_kPa = pa_hPa / 10;
  const delta = Tmrt - Ta;
  const v = Math.max(0.5, Math.min(17, wind10m));
  // Clamp Ta per model limits to avoid wild extrapolation, but still return a value
  const tdb = Math.max(-50, Math.min(50, Ta));
  const utci = utciOptimized(tdb, v, delta, pa_kPa);
  return { utci, pa_kPa };
}
