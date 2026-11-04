/**
 * GET /api/scene?lat=64.1417&lng=-21.9266&radius=500
 *
 * Terrain (ÍslandsDEM 2 m), distant terrain (national DEM), a distant-horizon
 * profile and buildings (OSM + Reykjavík LUKR) around a point, in a scene-local
 * metric frame for the 3D shadow explorer.
 */

import { NextResponse } from "next/server";
import {
  getSceneData,
  isInIceland,
  OutsideCoverageError,
} from "@/lib/terrain/scene-data";

const DEFAULT_RADIUS = 500;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const radius = Number(params.get("radius")) || DEFAULT_RADIUS;

  if (!isInIceland(lat, lng)) {
    return NextResponse.json(
      { error: "lat/lng must be a point in Iceland" },
      { status: 400 },
    );
  }

  try {
    const body = await getSceneData(lat, lng, radius);
    return NextResponse.json(body, {
      // Partial results (OSM down) must not be cached
      headers: {
        "Cache-Control": body.warnings.length
          ? "no-store"
          : "public, max-age=86400",
      },
    });
  } catch (error) {
    if (error instanceof OutsideCoverageError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to build scene", detail: message },
      { status: 500 },
    );
  }
}
