import { dbWithRetry } from "../dbWithRetry.js";
import { db } from "../db/index.js";
import { weatherTable } from "../models/index.js";

export async function storeForecast(result, locationId) {
  const hourly = result.hourly;

  const rows = [];

  for (let i = 0; i < hourly.time.length; i++) {
    rows.push({
      locationId,

      timestamp: `${hourly.time[i]}:00`,

      temperature2m: hourly.temperature_2m?.[i] ?? null,
      relativeHumidity2m: hourly.relative_humidity_2m?.[i] ?? null,
      dewPoint2m: hourly.dew_point_2m?.[i] ?? null,
      apparentTemperature: hourly.apparent_temperature?.[i] ?? null,

      windSpeed10m: hourly.wind_speed_10m?.[i] ?? null,
      windDirection10m: hourly.wind_direction_10m?.[i] ?? null,
      windGusts10m: hourly.wind_gusts_10m?.[i] ?? null,

      shortwaveRadiation: hourly.shortwave_radiation?.[i] ?? null,
      directRadiation: hourly.direct_radiation?.[i] ?? null,
      diffuseRadiation: hourly.diffuse_radiation?.[i] ?? null,

      precipitation: hourly.precipitation?.[i] ?? null,
      rain: hourly.rain?.[i] ?? null,
    });
  }

  await dbWithRetry(() => db.insert(weatherTable).values(rows), 3, 2000);

  console.log(`Stored ${rows.length} forecast records.`);

  return {
    locationId,
    totalRecords: rows.length,
  };
}
