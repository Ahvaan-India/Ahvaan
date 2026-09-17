export function calculateWBGT(
  temperatureC,
  relativeHumidity,
  windSpeed,
  solarRadiation,
) {
  if (
    typeof temperatureC !== "number" ||
    typeof relativeHumidity !== "number" ||
    typeof windSpeed !== "number" ||
    typeof solarRadiation !== "number"
  ) {
    throw new Error(
      "Temperature, humidity, wind speed and solar radiation must be numbers",
    );
  }

  if (relativeHumidity < 0 || relativeHumidity > 100) {
    throw new Error("Relative humidity must be between 0 and 100");
  }

  if (windSpeed < 0) {
    throw new Error("Wind speed cannot be negative");
  }

  if (solarRadiation < 0) {
    throw new Error("Solar radiation cannot be negative");
  }

  const Tair = temperatureC;
  const RH = relativeHumidity;
  const wind = Math.max(windSpeed, 0.1);
  const solar = solarRadiation;

  // Saturation vapor pressure (Pa)
  const es = 610.94 * Math.exp((17.625 * Tair) / (Tair + 243.04));

  // Actual vapor pressure (Pa)
  const ea = es * (RH / 100);

  // Natural wet-bulb temperature approximation
  const Tnwb = Tair - 0.00066 * (1 + 0.00115 * Tair) * (Tair - 10) * (100 - RH);

  // Estimate globe temperature from air temperature,
  // solar radiation and wind.
  const globeHeating = 0.25 * Math.pow(solar / 100, 0.5);

  const Tg = Tair + globeHeating / Math.sqrt(wind);

  // Outdoor WBGT
  const WBGT = 0.7 * Tnwb + 0.2 * Tg + 0.1 * Tair;

  return Number(WBGT.toFixed(2));
}
