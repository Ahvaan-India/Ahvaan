export function calculateUTCI(
  temperatureC,
  meanRadiantTemperatureC,
  windSpeed,
  relativeHumidity,
) {
  if (
    typeof temperatureC !== "number" ||
    typeof meanRadiantTemperatureC !== "number" ||
    typeof windSpeed !== "number" ||
    typeof relativeHumidity !== "number"
  ) {
    throw new Error(
      "temperatureC, meanRadiantTemperatureC, windSpeed and relativeHumidity must be numbers",
    );
  }

  if (windSpeed < 0) {
    throw new Error("Wind speed cannot be negative");
  }

  if (relativeHumidity < 0 || relativeHumidity > 100) {
    throw new Error("Relative humidity must be between 0 and 100");
  }

  const Ta = temperatureC;
  const Tr = meanRadiantTemperatureC;
  const va = Math.max(windSpeed, 0.5);

  /*
   * Saturation vapour pressure in kPa
   */
  const es = 0.6108 * Math.exp((17.27 * Ta) / (Ta + 237.3));

  /*
   * Actual vapour pressure in kPa
   */
  const e = es * (relativeHumidity / 100);

  /*
   * Convert vapour pressure to Pa
   */
  const pa = e * 1000;

  /*
   * Difference between mean radiant
   * temperature and air temperature
   */
  const deltaTr = Tr - Ta;

  /*
   * UTCI polynomial
   */
  const utci =
    Ta +
    0.607562052 +
    -0.0227712343 * Ta +
    8.06470249e-4 * Ta * Ta +
    -1.54271372e-4 * Ta * Ta * Ta +
    -3.24651735e-6 * Ta * Ta * Ta * Ta +
    7.32602852e-8 * Ta * Ta * Ta * Ta * Ta +
    1.35959073e-9 * Ta * Ta * Ta * Ta * Ta * Ta +
    -2.2583652 * va +
    0.0880326035 * Ta * va +
    0.00216844454 * Ta * Ta * va +
    -1.53347087e-5 * Ta * Ta * Ta * va +
    -5.72983704e-7 * Ta * Ta * Ta * Ta * va +
    -2.55090145e-9 * Ta * Ta * Ta * Ta * Ta * va +
    -0.751269505 * va * va +
    -0.00408350271 * Ta * va * va +
    -5.21670675e-5 * Ta * Ta * va * va +
    1.94544667e-6 * Ta * Ta * Ta * va * va +
    1.14099531e-8 * Ta * Ta * Ta * Ta * va * va +
    0.158137256 * va * va * va +
    -6.57263143e-5 * Ta * va * va * va +
    2.22697524e-7 * Ta * Ta * va * va * va +
    -4.16117031e-8 * Ta * Ta * Ta * va * va * va +
    -0.0127762753 * va * va * va * va +
    0.0001129515 * Ta * va * va * va * va +
    8.19448276e-6 * Ta * Ta * va * va * va * va +
    -1.07521523e-9 * Ta * Ta * Ta * va * va * va * va +
    0.00148348065 * va * va * va * va * va +
    -0.000003239081 * Ta * va * va * va * va * va +
    0.000000000045 * pa * deltaTr;

  return Number(utci.toFixed(2));
}
