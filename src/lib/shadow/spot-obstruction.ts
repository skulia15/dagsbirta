/**
 * Server-side obstruction profile for a lat/lng, using the same scene (terrain +
 * buildings) as the 3D explorer, so the report and the 3D view always agree.
 */

import type { HorizonProfile } from "../../types/index";
import { getSceneData } from "../terrain/scene-data";
import { obstructionProfile } from "./obstruction";
import { buildScene, disposeScene } from "./scene-geometry";
import { dropOnto, spotOrigin } from "./sunlight";

/** Detailed area around the spot. At 3° sun a 16 m building 300 m away still shades. */
const ANALYSIS_RADIUS = 400;

export type SurfaceChoice = "auto" | "roof" | "ground";

export interface SpotObstruction {
  horizonProfile: HorizonProfile;
  /** Where the spot ended up: a roof if `auto`/`roof` and a building is there */
  surface: "ground" | "roof" | "wall";
  /** Spot elevation incl. height above surface (m a.s.l.) */
  elevation: number;
  warnings: string[];
}

export async function getSpotObstruction(
  lat: number,
  lng: number,
  {
    surface = "auto",
    heightAboveSurface = 1.5,
  }: { surface?: SurfaceChoice; heightAboveSurface?: number } = {},
): Promise<SpotObstruction> {
  const data = await getSceneData(lat, lng, ANALYSIS_RADIUS);
  const scene = buildScene(data);
  try {
    const target =
      surface === "ground" ? { ...scene, buildingsBvh: null } : scene;
    const spot = dropOnto(target, 0, 0);
    if (!spot) throw new Error("No surface found at this location");
    const warnings = [...data.warnings];
    if (surface === "roof" && spot.surface !== "roof") {
      warnings.push("No building at this point; analysed at ground level.");
    }
    const origin = spotOrigin(spot, heightAboveSurface);
    const horizonProfile = obstructionProfile(scene, origin);
    horizonProfile.location = { lat, lng, elevation: origin.y + scene.yRef };
    return {
      horizonProfile,
      surface: spot.surface,
      elevation: origin.y + scene.yRef,
      warnings,
    };
  } finally {
    disposeScene(scene);
  }
}
