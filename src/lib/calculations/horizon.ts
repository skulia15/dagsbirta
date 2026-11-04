/**
 * Terrain horizon profile from ÍslandsDEM (server-only: reads DEM files).
 *
 * Rays are marched over the fine 2 m DEM out to 1.5 km, then the national 20 m DEM. Earth curvature and standard
 * atmospheric refraction are included because the profile reaches 20+ km,
 * where curvature alone lowers terrain by ~30 m.
 */

import type { HorizonProfile } from "../../types/index";
import { gridConvergence, toIsn93 } from "../terrain/crs";
import { readFineGrid, readNationalGrid } from "../terrain/dem";
import { computeHorizon, sampleGrid } from "../terrain/grid";

/** Fine-DEM patch used for the near part of the horizon */
const FINE_HALF_SIZE = 1500;
const FINE_RES = 4;

export interface HorizonOptions {
  /** Degrees between azimuth samples (default 1) */
  angularResolution?: number;
  /** Ignore terrain closer than this, in metres (default 100) */
  minDistance?: number;
  /** Stop marching at this distance, in metres (default 40 km) */
  maxDistance?: number;
  /** Eye height above ground, in metres (default 1.5) */
  observerHeight?: number;
}

export async function getHorizonProfile(
  lat: number,
  lng: number,
  options: HorizonOptions = {},
): Promise<HorizonProfile> {
  const {
    angularResolution = 1,
    minDistance = 100,
    maxDistance = 40_000,
    observerHeight = 1.5,
  } = options;

  const [x, y] = toIsn93(lat, lng);
  // Near terrain from the 2 m DEM; the 20 m grid is too coarse close to the observer
  const [fine, coarse] = await Promise.all([
    readFineGrid(x, y, FINE_HALF_SIZE, FINE_RES),
    readNationalGrid(x, y, maxDistance),
  ]);
  const ground = sampleGrid(fine, x, y);
  if (ground === null) {
    throw new Error(`Location ${lat},${lng} is outside DEM coverage`);
  }

  const eye = ground + observerHeight;
  const convergence = gridConvergence(lat, lng);
  const handover = FINE_HALF_SIZE - FINE_RES * 2;
  const near = computeHorizon(fine, x, y, eye, convergence, {
    angularResolution,
    minDistance,
    maxDistance: Math.min(handover, maxDistance),
  });
  const far =
    maxDistance > handover
      ? computeHorizon(coarse, x, y, eye, convergence, {
          angularResolution,
          minDistance: Math.max(handover, minDistance),
          maxDistance,
        })
      : near;

  return {
    location: { lat, lng, elevation: ground },
    profile: near.map((n, i) =>
      far[i].elevationAngle > n.elevationAngle ? far[i] : n,
    ),
    computedAt: new Date(),
  };
}
