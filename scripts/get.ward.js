import { fetchWithRetry } from "./fetchWithRetry.js";

export async function getWardData(wardNumber) {
  try {
    const url = new URL(
      "https://services5.arcgis.com/zrARILBg781FQA8M/ArcGIS/rest/services/Kolkata_ward_shapefile/FeatureServer/0/query",
    );

    url.searchParams.set("where", `WARD='${wardNumber}'`);

    url.searchParams.set("returnGeometry", "true");

    url.searchParams.set("returnCentroid", "true");

    url.searchParams.set("outSR", "4326");

    url.searchParams.set("f", "json");

    // Use retry-enabled fetch
    const response = await fetchWithRetry(url.toString());

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      throw new Error(`Ward ${wardNumber} not found`);
    }

    const feature = data.features[0];

    return {
      latitude: feature.centroid.y,
      longitude: feature.centroid.x,
      geometry: feature.geometry.rings,
    };
  } catch (error) {
    console.error(`Failed to fetch Ward ${wardNumber}:`, error);

    throw error;
  }
}
