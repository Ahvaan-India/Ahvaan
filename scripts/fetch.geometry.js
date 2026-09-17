import { fetchWithRetry } from "../fetchWithRetry.js";

export async function fetchGeometry(wardNumber) {
  const url = new URL(
    "https://services5.arcgis.com/zrARILBg781FQA8M/ArcGIS/rest/services/Kolkata_ward_shapefile/FeatureServer/0/query",
  );

  url.searchParams.set("where", `WARD='${wardNumber}'`);
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("returnCentroid", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "json");

  const result = await fetchWithRetry(url.toString());

  // Fetch failed even after all retries
  if (!result.success) {
    console.error(`Failed to fetch Ward ${wardNumber}:`, result.error);

    return {
      success: false,
      wardNumber,
      error: result.error,
      status: result.status,
    };
  }

  const data = await result.response.json();

  // Ward doesn't exist
  if (!data.features || data.features.length === 0) {
    console.error(`Ward ${wardNumber} not found`);

    return {
      success: false,
      wardNumber,
      error: `Ward ${wardNumber} not found`,
    };
  }

  const feature = data.features[0];

  return {
    success: true,
    wardNumber,
    latitude: feature.centroid.y,
    longitude: feature.centroid.x,
    geometry: feature.geometry.rings,
  };
}
