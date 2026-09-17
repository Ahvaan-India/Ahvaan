export function calculateHeatIndex(temperatureC, relativeHumidity) {
  if (
    typeof temperatureC !== "number" ||
    typeof relativeHumidity !== "number"
  ) {
    throw new Error("Temperature and relative humidity must be numbers");
  }

  if (relativeHumidity < 0 || relativeHumidity > 100) {
    throw new Error("Relative humidity must be between 0 and 100");
  }

  // Convert Celsius → Fahrenheit
  const T = (temperatureC * 9) / 5 + 32;
  const R = relativeHumidity;

  // Lower-temperature approximation
  if (T < 80) {
    const simpleHI = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + R * 0.094);

    const hiF = (simpleHI + T) / 2;

    return Number((((hiF - 32) * 5) / 9).toFixed(2));
  }

  // Rothfusz regression
  const HI =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    0.00683783 * T * T -
    0.05481717 * R * R +
    0.00122874 * T * T * R +
    0.00085282 * T * R * R -
    0.00000199 * T * T * R * R;

  return Number((((HI - 32) * 5) / 9).toFixed(2));
}
