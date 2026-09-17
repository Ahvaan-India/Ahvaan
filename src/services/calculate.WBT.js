export function calculateWetBulbTemperature(temperatureC, relativeHumidity) {
  if (
    typeof temperatureC !== "number" ||
    typeof relativeHumidity !== "number"
  ) {
    throw new Error("Temperature and relative humidity must be numbers");
  }

  if (relativeHumidity < 0 || relativeHumidity > 100) {
    throw new Error("Relative humidity must be between 0 and 100");
  }

  const T = temperatureC;
  const RH = relativeHumidity;

  const wetBulb =
    T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
    Math.atan(T + RH) -
    Math.atan(RH - 1.676331) +
    0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) -
    4.686035;

  return Number(wetBulb.toFixed(2));
}
