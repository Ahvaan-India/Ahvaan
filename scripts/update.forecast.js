import { eq, and, gte, lte, lt, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { locationsTable, weatherTable } from "../models/index.js";

import { getDateAfterDays, getDateBeforeDays } from "../utils/date.utils.js";
import { fetchForecast } from "./fetch.forecast.js";
import { storeForecast } from "./store.forecast.js";
import { validateForecast } from "./validation/validate.forecast.js";
import { storeIngestionError } from "./data.ingestion.errors.js";

export async function updateForecast() {
  console.log("Starting forecast update...");

  // --------------------------------------------------
  // 1. Get all active locations
  // --------------------------------------------------

  const locations = await db
    .select({
      locationId: locationsTable.id,
      district: locationsTable.district,
      ward: locationsTable.ward,
      lat: locationsTable.lat,
      long: locationsTable.long,
    })
    .from(locationsTable)
    .where(eq(locationsTable.status, "active"));

  const locationIds = locations.map(({ locationId }) => locationId);

  console.log(`Found ${locationIds.length} active locations.`);
  console.log("Location IDs:", locationIds);

  // --------------------------------------------------
  // 2. Calculate rolling forecast window
  // --------------------------------------------------

  const startDate = getDateBeforeDays(2);
  const endDate = getDateAfterDays(7);

  console.log(`Forecast range: ${startDate} → ${endDate}`);

  // --------------------------------------------------
  // 3. Delete all weather data before startDate
  // --------------------------------------------------

  await db.delete(weatherTable).where(lt(weatherTable.timestamp, startDate));

  console.log(`Deleted all weather records before ${startDate}.`);

  // --------------------------------------------------
  // 4. Process each location
  // --------------------------------------------------

  for (const location of locations) {
    const { locationId, district, ward, lat, long } = location;

    console.log(`\nProcessing location ${locationId} (Ward ${ward})...`);

    // ------------------------------------------------
    // 5. Get existing dates for this location
    // ------------------------------------------------

    const existingDates = await db
      .selectDistinct({
        date: sql`DATE(${weatherTable.timestamp})`,
      })
      .from(weatherTable)
      .where(
        and(
          eq(weatherTable.locationId, locationId),
          gte(weatherTable.timestamp, startDate),
          lte(weatherTable.timestamp, endDate),
        ),
      );

    const existingDateSet = new Set(
      existingDates.map(({ date }) => String(date)),
    );

    // ------------------------------------------------
    // 6. Generate all required dates
    // ------------------------------------------------

    const requiredDates = [];

    const currentDate = new Date(startDate);
    const finalDate = new Date(endDate);

    while (currentDate <= finalDate) {
      requiredDates.push(currentDate.toISOString().split("T")[0]);

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // ------------------------------------------------
    // 7. Find missing dates
    // ------------------------------------------------

    const missingDates = requiredDates.filter(
      (date) => !existingDateSet.has(date),
    );

    console.log(`Missing dates for location ${locationId}:`, missingDates);

    // ------------------------------------------------
    // 8. Nothing missing → skip this location
    // ------------------------------------------------

    if (missingDates.length === 0) {
      console.log(`Location ${locationId} already has complete forecast data.`);

      continue;
    }

    // ------------------------------------------------
    // 9. Validate coordinates
    // ------------------------------------------------

    if (lat === null || long === null) {
      console.error(`Location ${locationId} has no coordinates. Skipping.`);

      continue;
    }

    // ------------------------------------------------
    // 10. Group consecutive missing dates
    // ------------------------------------------------

    const missingRanges = [];

    let rangeStart = missingDates[0];
    let rangeEnd = missingDates[0];

    for (let i = 1; i < missingDates.length; i++) {
      const previousDate = new Date(rangeEnd);
      const currentMissingDate = new Date(missingDates[i]);

      previousDate.setDate(previousDate.getDate() + 1);

      const isConsecutive =
        previousDate.toISOString().split("T")[0] ===
        currentMissingDate.toISOString().split("T")[0];

      if (isConsecutive) {
        rangeEnd = missingDates[i];
      } else {
        missingRanges.push({
          startDate: rangeStart,
          endDate: rangeEnd,
        });

        rangeStart = missingDates[i];
        rangeEnd = missingDates[i];
      }
    }

    // Add final range
    missingRanges.push({
      startDate: rangeStart,
      endDate: rangeEnd,
    });

    console.log(
      `Missing date ranges for location ${locationId}:`,
      missingRanges,
    );

    // ------------------------------------------------
    // 11. Fetch ONLY missing date ranges
    // ------------------------------------------------

    for (const range of missingRanges) {
      console.log(
        `Fetching forecast for location ${locationId}: ${range.startDate} → ${range.endDate}`,
      );

      const forecastResult = await fetchForecast(
        lat,
        long,
        range.startDate,
        range.endDate,
        ward,
      );

      // ------------------------------------------------
      // 12. Handle API failure
      // ------------------------------------------------

      if (!forecastResult.success) {
        console.error(
          `Failed to fetch forecast for Ward ${ward}:`,
          forecastResult.error,
        );

        await storeIngestionError({
          district,
          ward,
          source: "open_meteo",
          errorType: "api_error",
          errorMessage: forecastResult.error,
        });

        continue;
      }

      // ------------------------------------------------
      // 13. Validate forecast
      // ------------------------------------------------

      const validation = validateForecast(forecastResult);

      if (validation !== true) {
        console.error(`Forecast validation failed for Ward ${ward}.`);

        await storeIngestionError({
          district,
          ward,
          source: "open_meteo",
          errorType: "invalid_data",
          missingFields: validation.failedFields,
          errorMessage: "Forecast data failed validation.",
        });

        continue;
      }

      // ------------------------------------------------
      // 14. Store forecast
      // ------------------------------------------------

      await storeForecast(forecastResult, locationId);

      console.log(
        `Forecast stored for location ${locationId}: ${range.startDate} → ${range.endDate}`,
      );
    }

    console.log(`Forecast update completed for location ${locationId}.`);
  }

  console.log("\nForecast update completed.");
}
