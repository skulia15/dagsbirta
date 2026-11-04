/**
 * Obstruction profile: for every azimuth, the highest altitude at which the sky is
 * blocked by buildings or terrain, seen from one spot.
 *
 * For an observer at a point this is exact for opaque obstacles that stand on the
 * ground: the sun is hidden iff its altitude is below the obstruction angle at its
 * azimuth. That lets every existing HorizonProfile consumer (daily, monthly, annual,
 * irradiance, ROI, SunPathDiagram) account for buildings without changes.
 * (Floating building parts, e.g. a tower over an open arcade, are treated as solid.)
 */

import * as THREE from "three";
import type { HorizonPoint, HorizonProfile } from "../../types/index";
import type { BuiltScene } from "./scene-geometry";
import { farHorizon, sunDirection } from "./sunlight";

/** Binary-search iterations: 90° / 2^14 ≈ 0.005° */
const ITERATIONS = 14;

const ray = new THREE.Ray();
const dir = new THREE.Vector3();

type Hit = {
  distance: number;
  point: THREE.Vector3;
  source: "building" | "terrain";
};

function firstHit(
  scene: BuiltScene,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): Hit | null {
  ray.set(origin, direction);
  const b = scene.buildingsBvh?.raycastFirst(ray, THREE.DoubleSide);
  const t = scene.terrainBvh.raycastFirst(ray, THREE.DoubleSide);
  if (b && (!t || b.distance <= t.distance))
    return { distance: b.distance, point: b.point, source: "building" };
  if (t) return { distance: t.distance, point: t.point, source: "terrain" };
  return null;
}

/**
 * Obstruction within the detailed scene (buildings + 2 m terrain) for one azimuth:
 * the highest altitude whose ray still hits something.
 */
function nearObstruction(
  scene: BuiltScene,
  origin: THREE.Vector3,
  azimuth: number,
): { angle: number; hit: Hit | null } {
  const conv = scene.data.convergence;
  let hit = firstHit(scene, origin, sunDirection(azimuth, 0, conv, dir));
  if (!hit) return { angle: 0, hit: null };
  let lo = 0;
  let hi = 90;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const h = firstHit(scene, origin, sunDirection(azimuth, mid, conv, dir));
    if (h) {
      lo = mid;
      hit = { ...h, point: h.point.clone() };
    } else {
      hi = mid;
    }
  }
  return { angle: lo, hit };
}

/**
 * Full obstruction profile at `angularResolution`° steps (true azimuths), merging the
 * detailed scene with distant terrain (farHorizon). `origin` is in scene world space.
 */
export function obstructionProfile(
  scene: BuiltScene,
  origin: THREE.Vector3,
  angularResolution = 1,
): HorizonProfile {
  const distant = farHorizon(scene, origin);
  const steps = Math.round(360 / angularResolution);
  const profile: HorizonPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const azimuth = i * angularResolution;
    const { angle, hit } = nearObstruction(scene, origin, azimuth);
    const far = distant.profile[Math.round(azimuth) % distant.profile.length];
    if (hit && angle >= far.elevationAngle) {
      profile.push({
        azimuth,
        elevationAngle: angle,
        distance: hit.distance / 1000,
        peakElevation: hit.point.y + scene.yRef,
        source: hit.source,
      });
    } else {
      profile.push({ ...far, azimuth, source: "terrain" });
    }
  }
  return {
    location: distant.location,
    profile,
    computedAt: new Date(),
  };
}

/**
 * Coarsen a profile to `step`° bins, keeping each bin's maximum (conservative:
 * never shows sun that the full-resolution profile would block).
 */
export function coarsenProfile(
  profile: HorizonProfile,
  step: number,
): HorizonProfile {
  const src = profile.profile;
  const res = 360 / src.length;
  const out: HorizonPoint[] = [];
  for (let az = 0; az < 360; az += step) {
    let best: HorizonPoint | null = null;
    for (let a = az - step / 2; a < az + step / 2; a += res) {
      const p = src[Math.round((((a % 360) + 360) % 360) / res) % src.length];
      if (!best || p.elevationAngle > best.elevationAngle) best = p;
    }
    if (best) out.push({ ...best, azimuth: az });
  }
  return { ...profile, profile: out };
}
