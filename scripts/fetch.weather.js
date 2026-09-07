import "dotenv/config";

import { db } from "../db/index.js";
import { weatherTable } from "../models/index.js";
import { fetchWithRetry } from "./fetchWithRetry.js";

const HISTORICAL_API = "https://archive-api.open-meteo.com/v1/archive";

const FORECAST_API = "https://api.open-meteo.com/v1/forecast";

const WEATHER_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "apparent_temperature",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "shortwave_radiation",
  "direct_radiation",
  "diffuse_radiation",
  "precipitation",
  "rain",
];

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().split("T")[0];
}

function createWeatherRows(hourly, locationId, filter) {
  const rows = [];

  for (let i = 0; i < hourly.time.length; i++) {
    const time = hourly.time[i];

    if (filter && !filter(time)) {
      continue;
    }

    const timestamp = `${time.replace("T", " ")}:00`;

    rows.push({
      locationId,
      timestamp,

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

  return rows;
}

export async function fetchDetails(latitude, longitude, locationId) {
  try {
    console.log(`\nFetching weather data for ${latitude}, ${longitude}...`);

    // ============================================================
    // 1. FORECAST API
    // ============================================================

    const forecastUrl = new URL(FORECAST_API);

    forecastUrl.searchParams.set("latitude", latitude);

    forecastUrl.searchParams.set("longitude", longitude);

    forecastUrl.searchParams.set("hourly", WEATHER_VARIABLES.join(","));

    // Today + next 5 complete days
    forecastUrl.searchParams.set("forecast_days", "6");

    // Include today's already available hours
    forecastUrl.searchParams.set("past_hours", "24");

    forecastUrl.searchParams.set("current", "temperature_2m");

    forecastUrl.searchParams.set("timezone", "auto");

    console.log("Fetching forecast data...");

    const forecastResponse = await fetchWithRetry(forecastUrl.toString());

    const forecastData = await forecastResponse.json();

    if (!forecastData.current?.time) {
      throw new Error("Forecast API did not return current local time.");
    }

    if (!forecastData.hourly || !forecastData.hourly.time) {
      throw new Error("Forecast API returned no hourly data.");
    }

    const currentTime = forecastData.current.time;

    const today = currentTime.substring(0, 10);

    const currentHour = Number(currentTime.substring(11, 13));

    console.log(`Location timezone: ${forecastData.timezone}`);

    console.log(`Current local time: ${currentTime}`);

    console.log(`Current local hour: ${currentHour}:00`);

    // ============================================================
    // 2. HISTORICAL API
    // ============================================================

    // Previous 84 complete days
    const historicalStart = addDays(today, -84);

    const historicalEnd = addDays(today, -1);

    console.log(`Historical API range: ${historicalStart} → ${historicalEnd}`);

    const historicalUrl = new URL(HISTORICAL_API);

    historicalUrl.searchParams.set("latitude", latitude);

    historicalUrl.searchParams.set("longitude", longitude);

    historicalUrl.searchParams.set("start_date", historicalStart);

    historicalUrl.searchParams.set("end_date", historicalEnd);

    historicalUrl.searchParams.set("hourly", WEATHER_VARIABLES.join(","));

    historicalUrl.searchParams.set("timezone", "auto");

    console.log("Fetching historical data...");

    const historicalResponse = await fetchWithRetry(historicalUrl.toString());

    const historicalData = await historicalResponse.json();

    if (!historicalData.hourly || !historicalData.hourly.time) {
      throw new Error("Historical API returned no hourly data.");
    }

    console.log(
      `Historical API returned ${historicalData.hourly.time.length} records.`,
    );

    // ============================================================
    // 3. PREVIOUS 84 DAYS
    // ============================================================

    const historicalRows = createWeatherRows(historicalData.hourly, locationId);

    console.log(`Previous 84 days: ${historicalRows.length} records.`);

    // ============================================================
    // 4. TODAY'S COMPLETED HOURS
    // ============================================================

    const todayAvailableRows = createWeatherRows(
      forecastData.hourly,
      locationId,
      (time) => {
        const date = time.substring(0, 10);

        const hour = Number(time.substring(11, 13));

        return date === today && hour < currentHour;
      },
    );

    console.log(`Today's available: ${todayAvailableRows.length} records.`);

    // ============================================================
    // 5. TODAY'S REMAINING FORECAST
    // ============================================================

    const todayForecastRows = createWeatherRows(
      forecastData.hourly,
      locationId,
      (time) => {
        const date = time.substring(0, 10);

        const hour = Number(time.substring(11, 13));

        return date === today && hour >= currentHour;
      },
    );

    console.log(`Today's forecast: ${todayForecastRows.length} records.`);

    // ============================================================
    // 6. NEXT 5 COMPLETE DAYS
    // ============================================================

    const forecastEndDate = addDays(today, 5);

    const futureForecastRows = createWeatherRows(
      forecastData.hourly,
      locationId,
      (time) => {
        const date = time.substring(0, 10);

        return date > today && date <= forecastEndDate;
      },
    );

    console.log(`Next 5 days forecast: ${futureForecastRows.length} records.`);

    // ============================================================
    // 7. COMBINE EVERYTHING
    // ============================================================

    const weatherRows = [
      ...historicalRows,
      ...todayAvailableRows,
      ...todayForecastRows,
      ...futureForecastRows,
    ];

    console.log("\n-----------------------------");

    console.log("WEATHER DATA SUMMARY");

    console.log("-----------------------------");

    console.log(`Previous 84 days : ${historicalRows.length}`);

    console.log(`Today's available: ${todayAvailableRows.length}`);

    console.log(`Today's forecast : ${todayForecastRows.length}`);

    console.log(`Next 5 days      : ${futureForecastRows.length}`);

    console.log(`TOTAL            : ${weatherRows.length}`);

    console.log("-----------------------------\n");

    // ============================================================
    // 8. INSERT INTO POSTGRESQL
    // ============================================================

    if (weatherRows.length > 0) {
      await db.insert(weatherTable).values(weatherRows);
    }

    console.log(`Successfully inserted ${weatherRows.length} weather records.`);

    // ============================================================
    // 9. RETURN SUMMARY
    // ============================================================

    return {
      locationId,

      timezone: forecastData.timezone,

      currentLocalTime: currentTime,

      historical: {
        startDate: historicalStart,

        endDate: historicalEnd,

        records: historicalRows.length,
      },

      todayAvailable: {
        startTime: `${today} 00:00:00`,

        endTime:
          currentHour === 0
            ? null
            : `${today} ${String(currentHour - 1).padStart(2, "0")}:00:00`,

        records: todayAvailableRows.length,
      },

      todayForecast: {
        startTime: `${today} ${String(currentHour).padStart(2, "0")}:00:00`,

        endTime: `${today} 23:00:00`,

        records: todayForecastRows.length,
      },

      futureForecast: {
        startDate: addDays(today, 1),

        endDate: forecastEndDate,

        records: futureForecastRows.length,
      },

      totalRecords: weatherRows.length,
    };
  } catch (error) {
    console.error("\nFailed to fetch weather data:");

    console.error(error);

    throw error;
  }
}
