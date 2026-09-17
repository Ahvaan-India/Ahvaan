import { db } from "../db/index.js";
import { analysisTable } from "../models/analysis.js";

export async function storeAnalysis(locationId, forecastDate, analysis) {
  try {
    if (!locationId || typeof locationId !== "number") {
      throw new Error("locationId must be a number.");
    }

    if (!forecastDate || typeof forecastDate !== "string") {
      throw new Error("forecastDate must be in YYYY-MM-DD format.");
    }

    if (analysis === undefined || analysis === null) {
      throw new Error("analysis data is required.");
    }

    const result = await db
      .insert(analysisTable)
      .values({
        locationId,
        forecastDate,
        analysis,
      })
      .onConflictDoUpdate({
        target: [analysisTable.locationId, analysisTable.forecastDate],
        set: {
          analysis,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error(
      `Failed to store analysis for location ${locationId} on ${forecastDate}:`,
      error,
    );

    throw error;
  }
}
