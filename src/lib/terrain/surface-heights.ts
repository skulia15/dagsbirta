/**
 * Building heights from the surface model.
 *
 * ÍslandsDEM is a median of satellite stereo surface models, so buildings show up
 * as (smoothed) bumps. Height ≈ high percentile of the DEM inside the footprint
 * minus the ground in a ring around it.
 *
 * Calibrated against OSM `height` tags, OSM levels and LUKR floors in central
 * Reykjavík (2026-11): the model flattens buildings. Median estimate/true ratio is
 * ~0.4 under 400 m² and ~0.9 above, but only ~50% land within max(3 m, 25%) even for
 * large footprints. So it is only used to replace blind type defaults on large
 * buildings (see SURFACE_MIN_AREA), never to override real data.
 */

import type { Grid } from "./grid";

export interface SurfaceEstimate {
  /** Ground elevation around the footprint (m a.s.l.) */
  ground: number;
  /** Surface elevation over the footprint (m a.s.l.) */
  top: number;
  /** top - ground (m) */
  height: number;
  /** DEM cells inside the footprint */
  cellsInside: number;
}

/** Footprints smaller than this are too flattened by the DEM to be useful */
export const SURFACE_MIN_AREA = 600;

const RING_INNER = 3;
/** Wide enough to reach the street in dense blocks, where neighbours fill the near ring */
const RING_OUTER = 25;
const TOP_PERCENTILE = 0.9;
const GROUND_PERCENTILE = 0.05;

function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

export function pointInRing(x: number, y: number, ring: number[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distance from (x, y) to the ring's boundary */
export function distanceToRing(x: number, y: number, ring: number[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const ax = ring[j];
    const ay = ring[j + 1];
    const dx = ring[i] - ax;
    const dy = ring[i + 1] - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2
      ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2))
      : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/** Polygon area (m²) of a flat [x0, y0, x1, y1, ...] ring */
export function footprintArea(ring: number[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  }
  return Math.abs(a) / 2;
}

/**
 * Estimate ground and surface height for a footprint (`ring` in the same frame as `grid`).
 * Returns null if the footprint is too small for the grid or lies outside it.
 */
export function surfaceEstimate(
  ring: number[],
  grid: Grid,
): SurfaceEstimate | null {
  let xmin = Number.POSITIVE_INFINITY;
  let xmax = Number.NEGATIVE_INFINITY;
  let ymin = Number.POSITIVE_INFINITY;
  let ymax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < ring.length; i += 2) {
    xmin = Math.min(xmin, ring[i]);
    xmax = Math.max(xmax, ring[i]);
    ymin = Math.min(ymin, ring[i + 1]);
    ymax = Math.max(ymax, ring[i + 1]);
  }
  const c0 = Math.max(0, Math.floor((xmin - RING_OUTER - grid.x0) / grid.res));
  const c1 = Math.min(
    grid.cols - 1,
    Math.ceil((xmax + RING_OUTER - grid.x0) / grid.res),
  );
  const r0 = Math.max(
    0,
    Math.floor((grid.y0 - (ymax + RING_OUTER)) / grid.res),
  );
  const r1 = Math.min(
    grid.rows - 1,
    Math.ceil((grid.y0 - (ymin - RING_OUTER)) / grid.res),
  );
  if (c1 < c0 || r1 < r0) return null;

  const inside: number[] = [];
  const around: number[] = [];
  for (let r = r0; r <= r1; r++) {
    const y = grid.y0 - r * grid.res;
    for (let c = c0; c <= c1; c++) {
      const x = grid.x0 + c * grid.res;
      const z = grid.data[r * grid.cols + c];
      if (pointInRing(x, y, ring)) {
        inside.push(z);
      } else {
        const d = distanceToRing(x, y, ring);
        if (d >= RING_INNER && d <= RING_OUTER) around.push(z);
      }
    }
  }
  if (inside.length < 4 || around.length < 8) return null;
  const ground = percentile(around, GROUND_PERCENTILE);
  const top = percentile(inside, TOP_PERCENTILE);
  return { ground, top, height: top - ground, cellsInside: inside.length };
}
