export function calculateMRT(
  temperature2m,
  shortwaveRadiation,
  directRadiation,
  diffuseRadiation,
) {
  if (
    typeof temperature2m !== "number" ||
    typeof shortwaveRadiation !== "number" ||
    typeof directRadiation !== "number" ||
    typeof diffuseRadiation !== "number"
  ) {
    throw new Error(
      "temperature2m, shortwaveRadiation, directRadiation and diffuseRadiation must be numbers",
    );
  }

  // TODO: Replace this with the proper outdoor MRT calculation.
  const meanRadiantTemperatureC = temperature2m + 0.05 * shortwaveRadiation;

  return Number(meanRadiantTemperatureC.toFixed(2));
}
