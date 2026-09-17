import { db } from "../db/index.js";
import { analysisTable } from "../models/analysis.js";
import { locationsTable } from "../models/locations.js";
import { getTodayDate, getDateAfterDays } from "../utils/date.utils.js";
import { analyseForecast } from "./analyse.forecast.js";
import { storeAnalysis } from "./store.analysis.js";
import { eq, lt } from "drizzle-orm";

// Add days to a YYYY-MM-DD date string without UTC conversion
function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + days);

  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, "0");
  const newDay = String(date.getDate()).padStart(2, "0");

  return `${newYear}-${newMonth}-${newDay}`;
}

export async function updateAnalysis() {
  const todayDate = getTodayDate();
  const futureDate = getDateAfterDays(5);

  console.log(`Updating analysis from ${todayDate} to ${futureDate}...`);

  // --------------------------------------------------
  // 1. Delete analysis records before today
  // --------------------------------------------------

  const deleted = await db
    .delete(analysisTable)
    .where(lt(analysisTable.forecastDate, todayDate))
    .returning({
      id: analysisTable.id,
    });

  console.log(`Deleted ${deleted.length} old analysis records.`);

  // --------------------------------------------------
  // 2. Get active locations
  // --------------------------------------------------

  const locations = await db
    .select({
      locationId: locationsTable.id,
    })
    .from(locationsTable)
    .where(eq(locationsTable.status, "active"));

  console.log(`Found ${locations.length} active locations.`);

  // --------------------------------------------------
  // 3. Process each active location
  // --------------------------------------------------

  for (const { locationId } of locations) {
    console.log(`\nChecking location ${locationId}...`);

    // Get existing analysis dates for this location
    const existingAnalysis = await db
      .select({
        forecastDate: analysisTable.forecastDate,
      })
      .from(analysisTable)
      .where(eq(analysisTable.locationId, locationId));

    const existingDates = new Set(
      existingAnalysis.map(({ forecastDate }) => String(forecastDate)),
    );

    // --------------------------------------------------
    // 4. Find missing dates
    // --------------------------------------------------

    const missingDates = [];

    let currentDate = todayDate;

    while (currentDate <= futureDate) {
      if (!existingDates.has(currentDate)) {
        missingDates.push(currentDate);
      }

      currentDate = addDays(currentDate, 1);
    }

    console.log(`Missing dates for location ${locationId}:`, missingDates);

    // --------------------------------------------------
    // 5. Calculate and store ONLY missing dates
    // --------------------------------------------------

    for (const missingDate of missingDates) {
      console.log(`Calculating ${missingDate} for location ${locationId}...`);

      const analysisData = await analyseForecast(
        locationId,
        missingDate,
        missingDate,
      );

      for (const data of analysisData) {
        await storeAnalysis(locationId, data.date, data.analysis);
      }
    }
  }

  console.log("\nAnalysis update completed.");
}
