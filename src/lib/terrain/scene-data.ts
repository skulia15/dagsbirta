/**
 * Builds the scene payload (terrain, distant terrain, distant horizon, buildings)
 * around a point. Shared by GET /api/scene (3D explorer) and the obstruction
 * analysis behind POST /api/analyze, so both see exactly the same world.
 */

import { buildingsNear } from "./buildings";
import { gridConvergence, toIsn93 } from "./crs";
import { cropGrid, readFineGrid, readNationalGrid } from "./dem";
import { computeHorizon, type Grid, sampleGrid } from "./grid";
import {
  type EncodedGrid,
  encodeElevations,
  type SceneBuilding,
  type SceneResponse,
} from "./scene-types";
import {
  footprintArea,
  SURFACE_MIN_AREA,
  surfaceEstimate,
} from "./surface-heights";

export const MIN_RADIUS = 150;
export const MAX_RADIUS = 1200;
/** Distant terrain extends this far from centre (covers Esja from central Reykjavík) */
const FAR_HALF_SIZE = 16_000;
/** National DEM resolution (data/dem/national-80m) */
const FAR_RES = 80;
/** Horizon beyond the distant-terrain mesh is computed here, from the centre */
const DISTANT_HORIZON_MAX = 40_000;
const EYE_HEIGHT = 1.5;

export class OutsideCoverageError extends Error {}

function toLocal(grid: Grid, cx: number, cy: number): EncodedGrid {
  return {
    x0: grid.x0 - cx,
    y0: grid.y0 - cy,
    res: grid.res,
    cols: grid.cols,
    rows: grid.rows,
    data: encodeElevations(grid.data),
  };
}

export function isInIceland(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 63 &&
    lat <= 67 &&
    lng >= -25 &&
    lng <= -13
  );
}

export async function getSceneData(
  lat: number,
  lng: number,
  radius: number,
): Promise<SceneResponse> {
  const r = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius));
  const [cx, cy] = toIsn93(lat, lng);
  // 2 m detail for small scenes, 4 m beyond 600 m to keep payload and mesh size sane
  const nearRes = r <= 600 ? 2 : 4;
  const [near, national, nearby] = await Promise.all([
    readFineGrid(cx, cy, r, nearRes),
    readNationalGrid(cx, cy, DISTANT_HORIZON_MAX),
    buildingsNear(cx, cy, r),
  ]);
  // Distant-terrain mesh is a pooled crop of the same national read
  const far = cropGrid(national, cx, cy, FAR_HALF_SIZE, FAR_RES);

  const groundElevation = sampleGrid(near, cx, cy);
  if (groundElevation === null) {
    throw new OutsideCoverageError("Point is outside DEM coverage");
  }

  const convergence = gridConvergence(lat, lng);
  // Terrain beyond the distant mesh, e.g. Skarðsheiði (~30 km) from Reykjavík.
  // From the centre only: a spot moving <1 km changes these angles negligibly.
  const distantHorizon = computeHorizon(
    national,
    cx,
    cy,
    groundElevation + EYE_HEIGHT,
    convergence,
    {
      angularResolution: 1,
      minDistance: FAR_HALF_SIZE,
      maxDistance: DISTANT_HORIZON_MAX,
    },
  );

  const buildings: SceneBuilding[] = nearby.buildings.map((b) => {
    let base = Number.POSITIVE_INFINITY;
    const ring = new Array<number>(b.ring.length);
    for (let i = 0; i < b.ring.length; i += 2) {
      const x = b.ring[i];
      const y = b.ring[i + 1];
      const z = sampleGrid(near, x, y);
      if (z !== null && z < base) base = z;
      ring[i] = Math.round((x - cx) * 10) / 10;
      ring[i + 1] = Math.round((y - cy) * 10) / 10;
    }
    // Large buildings with only a type-default height: the surface model is a
    // better guess than "6 m". It underestimates, so it may only raise the default.
    let h = b.h;
    let src: SceneBuilding["src"] = b.src;
    if (b.src === "d" && footprintArea(b.ring) >= SURFACE_MIN_AREA) {
      const est = surfaceEstimate(b.ring, near);
      if (est && est.height > h) {
        h = Math.round(est.height * 10) / 10;
        src = "s";
      }
    }
    return {
      id: b.id,
      h,
      mh: b.mh,
      base: Number.isFinite(base)
        ? Math.round(base * 10) / 10
        : groundElevation,
      src,
      ring,
    };
  });

  return {
    center: { lat, lng, x: cx, y: cy },
    convergence,
    groundElevation,
    radius: r,
    near: toLocal(near, cx, cy),
    far: toLocal(far, cx, cy),
    buildings,
    distantHorizon,
    warnings: nearby.warning ? [nearby.warning] : [],
    attribution: [
      "ÍslandsDEM v1.0 © Náttúrufræðistofnun / LMÍ, CC BY 4.0",
      "Buildings © OpenStreetMap contributors, ODbL",
      "Reykjavík building floors: LUKR open data, Reykjavíkurborg",
    ],
  };
}
