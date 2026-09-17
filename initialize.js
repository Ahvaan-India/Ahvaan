import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { locationsTable } from "./models/index.js";
import { parseDemographics } from "./scripts/parse.demographics.js";
import { fetchForecast } from "./scripts/fetch.forecast.js";
import { dbWithRetry } from "./dbWithRetry.js";
import { fetchGeometry } from "./scripts/fetch.geometry.js";
import { storeForecast } from "./scripts/store.forecast.js";
import { storeDemographics } from "./scripts/store.demographics.js";
import { validateForecast } from "./scripts/validation/validate.forecast.js";
import { storeIngestionError } from "./scripts/data.ingestion.errors.js";
import { validateDemographics } from "./scripts/validation/validate.demographics.js";
import { getDateAfterDays, getDateBeforeDays } from "./utils/date.utils.js";

export async function initializeDatabase() {
  const demographics = parseDemographics("./data/kolkata.xlsx");

  const firstWard = Object.values(demographics)[0];

  const district = firstWard.District;

  const wards = Object.keys(demographics);

  const existingWards = (
    await db
      .select({
        ward: locationsTable.ward,
      })
      .from(locationsTable)
      .where(eq(locationsTable.district, district))
  ).map((row) => row.ward);

  const missingWards = wards.filter(
    (ward) => !existingWards.includes(Number(ward)),
  );

  // All the wards that have not been initialized
  console.log("Missing:", missingWards);

  for (const ward of missingWards) {
    console.log(`\nProcessing Ward ${ward}`);

    const [location] = await dbWithRetry(
      () =>
        db
          .insert(locationsTable)
          .values({
            district,
            ward,
            status: "active",
          })
          .returning(),
      3,
      2000,
    );

    const locationId = location.id;

    // 2. Fetch geometry from ArcGIS
    const geometryResult = await fetchGeometry(ward);

    if (!geometryResult.success) {
      console.error(
        `Failed to get geometry for Ward ${ward}:`,
        geometryResult.error,
      );

      await storeIngestionError({
        district,
        ward,
        source: "arcgis",
        errorType: "api_error",
        errorMessage: geometryResult.error,
      });

      await dbWithRetry(
        () =>
          db
            .update(locationsTable)
            .set({
              status: "inactive",
            })
            .where(eq(locationsTable.id, locationId)),
        3,
        2000,
      );

      continue;
    }

    // 3. Update location with coordinates + geometry
    await dbWithRetry(
      () =>
        db
          .update(locationsTable)
          .set({
            lat: geometryResult.latitude,
            long: geometryResult.longitude,
            geometry: geometryResult.geometry,
          })
          .where(eq(locationsTable.id, locationId)),
      3,
      2000,
    );

    console.log(`Geometry stored for Ward ${ward}`);

    // Fetch forecast
    const startDate = getDateBeforeDays(2);
    const endDate = getDateAfterDays(7);

    const forecastResult = await fetchForecast(
      geometryResult.latitude,
      geometryResult.longitude,
      startDate,
      endDate,
      ward,
    );

    if (!forecastResult.success) {
      await storeIngestionError({
        district,
        ward,
        source: "open_meteo",
        errorType: "api_error",
        errorMessage: forecastResult.error,
      });

      await dbWithRetry(
        () =>
          db
            .update(locationsTable)
            .set({
              status: "inactive",
            })
            .where(eq(locationsTable.id, locationId)),
        3,
        2000,
      );

      continue;
    }

    const validation = validateForecast(forecastResult);

    if (validation !== true) {
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

    // 5. Store forecast
    await storeForecast(forecastResult, locationId);

    console.log(`Ward ${ward} completed.`);

    const demographicData = demographics[ward];

    const demographicValidation = validateDemographics(demographicData);

    if (demographicValidation !== true) {
      await storeIngestionError({
        district,
        ward,
        source: "census",
        errorType: "invalid_data",
        missingFields: demographicValidation.failedFields,
        errorMessage: "Demographic data failed validation.",
      });
    }

    await storeDemographics(demographicData, locationId);
  }

  console.log("Database initialization completed.");
}
