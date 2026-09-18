import { calculateHeatIndex } from "./calculate.HI.js";
import calculateHTSI from "./calculate.HTSI.js";
import { calculateMRT } from "./calculate.MRT.js";
import { calculateUTCI } from "./calculate.UTCI.js";
import { calculateWBGT } from "./calculate.WBGT.js";
import { calculateWetBulbTemperature } from "./calculate.WBT.js";

export function calculate(input) {
  const {
    temperature2m,
    relativeHumidity2m,
    dewPoint2m,
    apparentTemperature,
    windSpeed10m,
    windDirection10m,
    windGusts10m,
    shortwaveRadiation,
    directRadiation,
    diffuseRadiation,
    precipitation,
    rain,
  } = input;

  const HI = calculateHeatIndex(temperature2m, relativeHumidity2m);

  const WBGT = calculateWBGT(
    temperature2m,
    relativeHumidity2m,
    windSpeed10m,
    directRadiation,
  );

  const MRT = calculateMRT(
    temperature2m,
    shortwaveRadiation,
    directRadiation,
    diffuseRadiation,
  );

  const UTCI = calculateUTCI(
    temperature2m,
    MRT,
    windSpeed10m,
    relativeHumidity2m,
  );

  const WBT = calculateWetBulbTemperature(temperature2m, relativeHumidity2m);

  const HTSI = calculateHTSI(WBGT, HI, UTCI);

  return {
    HTSI,
    WBGT,
    HI,
    UTCI,
    WBT,
  };
}
