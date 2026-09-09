import { NextResponse } from "next/server";
import { getWards } from "@/lib/db/queries";
import { downsampleRing } from "@/lib/geo/rings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wards  Kolkata ward catalogue for the selector + SVG map.
 * Returns id, ward number/name, centroid, population, and a downsampled
 * polygon ring per ward (rounded to 5dp, every 2nd point) to keep the
 * payload small enough for a single dashboard load. Ward polygons change
 * rarely → cached at the edge for 1h.
 */
export async function GET() {
  try {
    const wards = await getWards();
    const data = wards.map((w) => ({
      locationId: w.locationId,
      ward: w.ward,
      wardName: w.wardName,
      lat: w.lat,
      long: w.long,
      totalPopulation: w.totalPopulation,
      ring: downsampleRing(w.geometry),
    }));
    return NextResponse.json(
      { count: data.length, wards: data },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    console.error("GET /api/wards failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
