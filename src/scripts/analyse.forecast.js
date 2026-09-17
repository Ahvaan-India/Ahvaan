import { eq, and, gte, lt } from "drizzle-orm";

import { db } from "../db/index.js";
import { weatherTable } from "../models/weather.js";
import { calculate } from "../services/calculation.service.js";

export async function analyseForecast(
  locationId,
  startDate,
  endDate = startDate,
) {
  try {
    // ----------------------------------------
    // Validation
    // ----------------------------------------

    if (!Number.isInteger(locationId)) {
      throw new Error("locationId must be an integer.");
    }

    if (
      typeof startDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate)
    ) {
      throw new Error("startDate must be in YYYY-MM-DD format.");
    }

    if (typeof endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error("endDate must be in YYYY-MM-DD format.");
    }

    // ----------------------------------------
    // Date range
    // ----------------------------------------

    let currentDate = new Date(`${startDate}T00:00:00Z`);

    const lastDate = new Date(`${endDate}T00:00:00Z`);

    if (currentDate > lastDate) {
      throw new Error("endDate cannot be before startDate.");
    }

    const results = [];

    // ----------------------------------------
    // Analyse each date
    // ----------------------------------------

    while (currentDate <= lastDate) {
      const date = currentDate.toISOString().slice(0, 10);

      // ----------------------------------------
      // Date boundaries
      // ----------------------------------------

      const startTimestamp = `${date} 00:00:00`;

      const nextDate = new Date(`${date}T00:00:00Z`);

      nextDate.setUTCDate(nextDate.getUTCDate() + 1);

      const nextYear = nextDate.getUTCFullYear();
      const nextMonth = String(nextDate.getUTCMonth() + 1).padStart(2, "0");

      const nextDay = String(nextDate.getUTCDate()).padStart(2, "0");

      const endTimestamp = `${nextYear}-${nextMonth}-${nextDay} 00:00:00`;

      // ----------------------------------------
      // Fetch weather data
      // ----------------------------------------

      const weatherData = await db
        .select()
        .from(weatherTable)
        .where(
          and(
            eq(weatherTable.locationId, locationId),
            gte(weatherTable.timestamp, startTimestamp),
            lt(weatherTable.timestamp, endTimestamp),
          ),
        )
        .orderBy(weatherTable.timestamp);

      // ----------------------------------------
      // Create hourly lookup
      // ----------------------------------------

      const hourlyData = new Map(
        weatherData.map((weather) => [
          Number(weather.timestamp.slice(11, 13)),
          weather,
        ]),
      );

      // ----------------------------------------
      // Analyse each hour
      // ----------------------------------------

      const dailyAnalysis = [];

      for (let hour = 0; hour < 24; hour++) {
        const hourData = hourlyData.get(hour);

        if (!hourData) {
          console.log(
            `Missing data for hour ${String(hour).padStart(2, "0")}:00:00`,
          );

          continue;
        }

        const result = {
          hour: hourData.timestamp.slice(11),
          analysis: calculate(hourData),
          input: hourData,
        };

        dailyAnalysis.push(result);
      }

      // ----------------------------------------
      // Store date + analysis
      // ----------------------------------------

      results.push({
        date,
        analysis: dailyAnalysis,
      });

      // Move to next date
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    console.log(`\nCompleted analysis for ${results.length} date(s).`);

    return results;
  } catch (error) {
    console.error(
      `Failed to analyse forecast for location ${locationId}:`,
      error,
    );

    throw error;
  }
}
