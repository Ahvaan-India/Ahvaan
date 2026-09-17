import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";

import { analysisTable } from "./models/analysis.js";
import { locationsTable } from "./models/locations.js";
import { analyseForecast } from "./scripts/analyse.forecast.js";
import { storeAnalysis } from "./scripts/store.analysis.js";
import { getDateAfterDays, getTodayDate } from "./utils/date.utils.js";

export async function initializeEngine() {
  try {
    console.log("Initializing analysis...");

    // Get all existing analysis records
    const existingAnalysis = await db
      .select({
        locationId: analysisTable.locationId,
        forecastDate: analysisTable.forecastDate,
      })
      .from(analysisTable);

    console.log(`Found ${existingAnalysis.length} existing analysis records.`);

    const locations = await db
      .select({
        locationId: locationsTable.id,
      })
      .from(locationsTable)
      .where(eq(locationsTable.status, "active"));

    console.log(`Found ${locations.length} locations.`);

    // Get unique location IDs that already have analysis
    const analyzedLocationIds = new Set(
      existingAnalysis.map(({ locationId }) => locationId),
    );

    // Find locations that have NO analysis records at all
    const locationsWithoutAnalysis = locations
      .map(({ locationId }) => locationId)
      .filter((locationId) => !analyzedLocationIds.has(locationId));

    console.log(
      `Locations without analysis: ${locationsWithoutAnalysis.length}`,
    );

    console.log("Location IDs without analysis:");
    console.log(locationsWithoutAnalysis);

    const todayDate = getTodayDate();
    const futureDate = getDateAfterDays(5);

    for (const locationId of locationsWithoutAnalysis) {
      console.log(`Processing location: ${locationId}`);

      const analysisData = await analyseForecast(
        locationId,
        todayDate,
        futureDate,
      );

      for (const data of analysisData) {
        await storeAnalysis(locationId, data.date, data.analysis);
      }
    }

    return;
  } catch (error) {
    console.error("Failed to initialize analysis:", error);
    throw error;
  }
}
