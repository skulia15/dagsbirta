/**
 * Sun direction + "is this spot in sunlight?" for the 3D explorer.
 *
 * Blocking is checked in three layers, nearest first:
 *   1. buildings (BVH raycast)
 *   2. detailed 2 m terrain inside the scene (BVH raycast)
 *   3. distant terrain beyond the scene edge (horizon profile over the 50 m grid)
 */

import * as THREE from "three";
import { getHorizonAtAzimuth } from "@/lib/calculations/shadow";
import { getSunPosition } from "@/lib/calculations/sun";
import { computeHorizon } from "@/lib/terrain/grid";
import type { SceneBuilding } from "@/lib/terrain/scene-types";
import type { HorizonProfile } from "@/types";
import { type BuiltScene, buildingForTriangle } from "./scene-geometry";

/** Half the sun's apparent diameter; matches lib/calculations/shadow.ts */
const SOLAR_DISC_MARGIN = 0.25;
/** Lift ray origins off the surface to avoid self-hits */
const SURFACE_OFFSET = 0.2;

export type Blocker =
  | { kind: "none" }
  | { kind: "night" }
  | { kind: "building"; distance: number; building: SceneBuilding | null }
  | { kind: "terrain"; distance: number }
  | {
      kind: "horizon";
      distance: number;
      peakElevation: number;
      horizonAngle: number;
    };

export interface SpotSunlight {
  lit: boolean;
  blocker: Blocker;
  altitude: number;
  azimuth: number;
  /** Unit vector towards the sun (world frame) */
  direction: THREE.Vector3;
  /** World-space hit point when blocked inside the scene */
  hitPoint: THREE.Vector3 | null;
}

export interface Spot {
  /** World position on the surface */
  point: THREE.Vector3;
  /** World surface normal */
  normal: THREE.Vector3;
  surface: "ground" | "roof" | "wall";
}

/** Direction towards the sun in world space (X east, Y up, Z -north on the ISN93 grid) */
export function sunDirection(
  azimuth: number,
  altitude: number,
  convergence: number,
  out = new THREE.Vector3(),
) {
  const g = ((azimuth + convergence) * Math.PI) / 180;
  const a = (altitude * Math.PI) / 180;
  return out.set(
    Math.sin(g) * Math.cos(a),
    Math.sin(a),
    -Math.cos(g) * Math.cos(a),
  );
}

/** Ray origin for a spot: lifted off the surface, plus `heightOffset` metres (eye level, balcony…) */
export function spotOrigin(
  spot: Spot,
  heightOffset: number,
  out = new THREE.Vector3(),
) {
  out.copy(spot.point).addScaledVector(spot.normal, SURFACE_OFFSET);
  out.y += heightOffset;
  return out;
}

/**
 * Horizon from distant terrain only. Marching starts where each ray leaves the
 * detailed area, so nothing is counted twice and nearby ridges come from the 2 m mesh.
 */
export function farHorizon(
  scene: BuiltScene,
  origin: THREE.Vector3,
): HorizonProfile {
  const { nearGrid, farGrid, yRef, data } = scene;
  const x = origin.x;
  const n = -origin.z;
  const xMin = nearGrid.x0;
  const xMax = nearGrid.x0 + (nearGrid.cols - 1) * nearGrid.res;
  const nMax = nearGrid.y0;
  const nMin = nearGrid.y0 - (nearGrid.rows - 1) * nearGrid.res;

  const exitDistance = (dx: number, dy: number) => {
    const tx =
      dx > 0
        ? (xMax - x) / dx
        : dx < 0
          ? (xMin - x) / dx
          : Number.POSITIVE_INFINITY;
    const ty =
      dy > 0
        ? (nMax - n) / dy
        : dy < 0
          ? (nMin - n) / dy
          : Number.POSITIVE_INFINITY;
    return Math.max(0, Math.min(tx, ty));
  };

  // Scene axes are ISN93 grid axes, so the true->grid convergence still applies
  const profile = computeHorizon(
    farGrid,
    x,
    n,
    origin.y + yRef,
    data.convergence,
    {
      angularResolution: 1,
      minDistance: exitDistance,
      maxDistance: 40_000,
    },
  );
  // Terrain beyond the distant mesh comes precomputed from the server (from the centre)
  for (const p of data.distantHorizon ?? []) {
    const i = Math.round(p.azimuth) % profile.length;
    if (p.elevationAngle > profile[i].elevationAngle) profile[i] = p;
  }
  return {
    location: {
      lat: data.center.lat,
      lng: data.center.lng,
      elevation: origin.y + yRef,
    },
    profile,
    computedAt: new Date(),
  };
}

const ray = new THREE.Ray();

export function evaluateSpot(
  scene: BuiltScene,
  origin: THREE.Vector3,
  horizon: HorizonProfile,
  date: Date,
): SpotSunlight {
  const { lat, lng } = scene.data.center;
  const { altitude, azimuth } = getSunPosition(lat, lng, date);
  const direction = sunDirection(azimuth, altitude, scene.data.convergence);
  const base = { altitude, azimuth, direction, hitPoint: null };

  if (altitude <= 0) return { ...base, lit: false, blocker: { kind: "night" } };

  ray.set(origin, direction);

  const bHit = scene.buildingsBvh?.raycastFirst(ray, THREE.DoubleSide);
  if (bHit) {
    return {
      ...base,
      lit: false,
      hitPoint: bHit.point.clone(),
      blocker: {
        kind: "building",
        distance: bHit.distance,
        building:
          bHit.faceIndex != null
            ? buildingForTriangle(scene, bHit.faceIndex)
            : null,
      },
    };
  }

  const tHit = scene.terrainBvh.raycastFirst(ray, THREE.DoubleSide);
  if (tHit) {
    return {
      ...base,
      lit: false,
      hitPoint: tHit.point.clone(),
      blocker: { kind: "terrain", distance: tHit.distance },
    };
  }

  const horizonAngle = getHorizonAtAzimuth(horizon, azimuth);
  if (altitude - horizonAngle < SOLAR_DISC_MARGIN) {
    const idx =
      Math.round(azimuth / (360 / horizon.profile.length)) %
      horizon.profile.length;
    const p = horizon.profile[idx];
    return {
      ...base,
      lit: false,
      blocker: {
        kind: "horizon",
        distance: p.distance,
        peakElevation: p.peakElevation,
        horizonAngle,
      },
    };
  }

  return { ...base, lit: true, blocker: { kind: "none" } };
}

export interface TimelineSlot {
  minute: number;
  lit: boolean;
  kind: Blocker["kind"];
}

/** Sunlight for every `step` minutes of a UTC day (Iceland has no DST, so UTC = local time). */
export function dayTimeline(
  scene: BuiltScene,
  origin: THREE.Vector3,
  horizon: HorizonProfile,
  dayStartUtc: number,
  step = 5,
): { slots: TimelineSlot[]; sunMinutes: number; daylightMinutes: number } {
  const slots: TimelineSlot[] = [];
  let sunMinutes = 0;
  let daylightMinutes = 0;
  for (let m = 0; m < 1440; m += step) {
    const r = evaluateSpot(
      scene,
      origin,
      horizon,
      // Slot start, so the bar agrees with the status panel when seeking to `m`
      new Date(dayStartUtc + m * 60_000),
    );
    slots.push({ minute: m, lit: r.lit, kind: r.blocker.kind });
    if (r.lit) sunMinutes += step;
    if (r.blocker.kind !== "night") daylightMinutes += step;
  }
  return { slots, sunMinutes, daylightMinutes };
}

/** Fire a ray straight down to find the surface under a world (x, z). */
export function dropOnto(scene: BuiltScene, x: number, z: number): Spot | null {
  const down = new THREE.Ray(
    new THREE.Vector3(x, 5000, z),
    new THREE.Vector3(0, -1, 0),
  );
  const b = scene.buildingsBvh?.raycastFirst(down, THREE.DoubleSide);
  const t = scene.terrainBvh.raycastFirst(down, THREE.DoubleSide);
  const hit = b && (!t || b.distance < t.distance) ? b : t;
  if (!hit) return null;
  const normal = hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0);
  if (normal.y < 0) normal.negate();
  return {
    point: hit.point.clone(),
    normal,
    surface: hit === b ? "roof" : "ground",
  };
}
