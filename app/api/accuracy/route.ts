import { NextResponse } from "next/server";
import { compareIndices, type CompareIndicesInput } from "@/lib/accuracy";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const latitude = Number(searchParams.get("latitude") ?? searchParams.get("lat") ?? "22.5726");
    const longitude = Number(searchParams.get("longitude") ?? searchParams.get("lon") ?? "88.3639");
    const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const time = searchParams.get("time") ?? "12:00:00";
    const apiKey = searchParams.get("apiKey") ?? undefined;
    const WBGT = Number(searchParams.get("WBGT") ?? searchParams.get("wbgt") ?? "30.5");
    const HI = Number(searchParams.get("HI") ?? searchParams.get("hi") ?? "37.2");

    const result = await compareIndices({
      latitude,
      longitude,
      date,
      time,
      apiKey,
      WBGT,
      HI,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to compare indices" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: CompareIndicesInput = await request.json();
    if (body.WBGT == null || body.HI == null) {
      return NextResponse.json(
        { success: false, error: "WBGT and HI numerical values are required" },
        { status: 400 },
      );
    }

    const latitude = body.latitude ?? 22.5726;
    const longitude = body.longitude ?? 88.3639;
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const time = body.time ?? "12:00:00";

    const result = await compareIndices({
      latitude,
      longitude,
      date,
      time,
      apiKey: body.apiKey,
      WBGT: body.WBGT,
      HI: body.HI,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to compare indices" },
      { status: 500 },
    );
  }
}
