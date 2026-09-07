import "dotenv/config";

import { db } from "../db/index.js";
import { locationsTable } from "../models/index.js";

export async function addLocation(latitude, longitude, geometry) {
  try {
    console.log(`\nAdding location data forr ${latitude}, ${longitude}...`);
    const [location] = await db
      .insert(locationsTable)
      .values({
        lat: latitude,
        long: longitude,
        geometry,
        lastRefresh: new Date(),
      })
      .returning({
        id: locationsTable.id,
      });

    const locationId = location.id;

    console.log(`Location created with ID: ${locationId}`);

    return locationId;
  } catch (error) {
    console.error("\nFailed to fetch weather data:");

    console.error(error);

    throw error;
  }
}
