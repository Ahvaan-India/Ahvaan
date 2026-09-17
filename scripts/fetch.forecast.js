import "dotenv/config";

import { fetchWithRetry } from "../fetchWithRetry.js";

const FORECAST_API = "https://api.open-meteo.com/v1/forecast";

const FORECAST_VARIABLES = [
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

export async function fetchForecast(
  latitude,
  longitude,
  startDate = null,
  endDate = null,
  wardNumber = null,
) {
  try {
    if (!startDate || !endDate) {
      throw new Error("startDate and endDate must be provided.");
    }

    const url = new URL(FORECAST_API);

    url.searchParams.set("latitude", latitude);
    url.searchParams.set("longitude", longitude);
    url.searchParams.set("hourly", FORECAST_VARIABLES.join(","));
    url.searchParams.set("timezone", "Asia/Kolkata");

    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);

    const result = await fetchWithRetry(url.toString());

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        status: result.status,
      };
    }

    const forecast = await result.response.json();

    if (!forecast.hourly?.time) {
      return {
        success: false,
        error: "Forecast API returned no hourly data.",
      };
    }

    return {
      success: true,
      timezone: forecast.timezone,
      hourly: forecast.hourly,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
