/**
 * Pure elevation-grid math shared by server (horizon API) and client (3D explorer).
 */

import type { HorizonPoint } from "../../types/index";

export interface Grid {
  /** Easting of column 0 cell centre (ISN93 or scene-local metres) */
  x0: number;
  /** Northing of row 0 cell centre; rows go south */
  y0: number;
  res: number;
  cols: number;
  rows: number;
  data: Float32Array;
}

const EARTH_RADIUS_M = 6_371_000;
const REFRACTION_K = 0.13;

/** Bilinear sample at (x, y). Returns null outside the grid. */
export function sampleGrid(grid: Grid, x: number, y: number): number | null {
  const fc = (x - grid.x0) / grid.res;
  const fr = (grid.y0 - y) / grid.res;
  if (fc < 0 || fr < 0 || fc > grid.cols - 1 || fr > grid.rows - 1) return null;
  const c = Math.min(Math.floor(fc), grid.cols - 2);
  const r = Math.min(Math.floor(fr), grid.rows - 2);
  const tx = fc - c;
  const ty = fr - r;
  const i = r * grid.cols + c;
  const d = grid.data;
  const top = d[i] * (1 - tx) + d[i + 1] * tx;
  const bottom = d[i + grid.cols] * (1 - tx) + d[i + grid.cols + 1] * tx;
  return top * (1 - ty) + bottom * ty;
}

export interface HorizonMarchOptions {
  /** Degrees between azimuth samples */
  angularResolution: number;
  /** Ignore terrain closer than this (m); a function gets the ray's unit grid direction */
  minDistance: number | ((dx: number, dy: number) => number);
  /** Stop marching here (m) */
  maxDistance: number;
}

/**
 * Horizon profile by marching rays over `grid` from (x, y).
 * `convergence` = grid bearing of true north (see gridConvergence), so returned
 * azimuths are true azimuths. Includes earth curvature and refraction.
 */
export function computeHorizon(
  grid: Grid,
  x: number,
  y: number,
  observerElevation: number,
  convergence: number,
  { angularResolution, minDistance, maxDistance }: HorizonMarchOptions,
): HorizonPoint[] {
  const steps = Math.round(360 / angularResolution);
  const profile: HorizonPoint[] = [];

  for (let i = 0; i < steps; i++) {
    const azimuth = i * angularResolution;
    const bearing = ((azimuth + convergence) * Math.PI) / 180;
    const dx = Math.sin(bearing);
    const dy = Math.cos(bearing);
    let best = Number.NEGATIVE_INFINITY;
    let bestDist = 0;
    let bestElev = 0;

    let d = typeof minDistance === "number" ? minDistance : minDistance(dx, dy);
    while (d <= maxDistance) {
      const z = sampleGrid(grid, x + dx * d, y + dy * d);
      if (z === null) break; // left the grid
      const drop = ((1 - REFRACTION_K) * d * d) / (2 * EARTH_RADIUS_M);
      const tan = (z - drop - observerElevation) / d;
      if (tan > best) {
        best = tan;
        bestDist = d;
        bestElev = z;
      }
      d += Math.max(grid.res / 2, d * 0.005);
    }

    profile.push({
      azimuth,
      elevationAngle: Number.isFinite(best)
        ? Math.max(0, (Math.atan(best) * 180) / Math.PI)
        : 0,
      distance: bestDist / 1000,
      peakElevation: bestElev,
    });
  }
  return profile;
}
