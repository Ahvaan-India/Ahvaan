//
// NOTE FROM DEVELOPER:
// The scientifically and mathematically validated HTSI formula is currently
// under development. The implementation below is a prototype intended solely
// for demonstration and testing purposes and will be replaced with the
// finalized formula in the production version.
//

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalize(value, lowerBound, upperBound) {
  return clamp(
    ((value - lowerBound) / (upperBound - lowerBound)) * 100,
    0,
    100,
  );
}

export function calculateHTSI(WBGT, heatIndex, UTCI) {
  if (
    !Number.isFinite(WBGT) ||
    !Number.isFinite(heatIndex) ||
    !Number.isFinite(UTCI)
  ) {
    throw new Error(
      "HTSI requires valid numeric values for WBGT, Heat Index, and UTCI.",
    );
  }

  const wbgtScore = normalize(WBGT, 25, 40);
  const heatIndexScore = normalize(heatIndex, 27, 54);
  const utciScore = normalize(UTCI, 26, 46);

  const HTSI = wbgtScore * 0.4 + utciScore * 0.35 + heatIndexScore * 0.25;

  return Number(clamp(HTSI, 0, 100).toFixed(2));
}

export default calculateHTSI;
