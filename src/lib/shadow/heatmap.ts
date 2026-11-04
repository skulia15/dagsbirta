/**
 * Annual direct-sun hours for every roof and ground cell of a scene.
 *
 * 1. surfaceGrid: the top surface (terrain, raised to roof height inside building
 *    footprints) on the scene's detailed grid.
 * 2. sunBins: a year of sun positions binned into sky directions, each weighted by
 *    hours. Directions hidden by distant terrain are dropped.
 * 3. sunHours: per direction, one sweep over the grid computes the whole shadow
 *    mask (heightfield shadow propagation): cells are visited sunward-first and
 *    each carries the highest shadow line reaching it, taken from its upstream
 *    neighbour and lowered by the sun's slope over one step. The step is exactly one
 *    cell along the sun's dominant axis, so only the minor axis is interpolated (a
 *    grid-aligned sun needs no interpolation at all). O(cells) per direction instead
 *    of one ray per cell.
 *
 * Walls are not covered (the grid only has one height per plan cell).
 */

import type { HorizonProfile } from "../../types/index";
import { getHorizonAtAzimuth } from "../calculations/shadow";
import { getSunPosition } from "../calculations/sun";
import type { Grid } from "../terrain/grid";
import type { SceneBuilding } from "../terrain/scene-types";
import { distanceToRing, pointInRing } from "../terrain/surface-heights";

/** Matches lib/calculations/shadow.ts */
const SOLAR_DISC_MARGIN = 0.25;
/** A cell is lit if within this of the shadow line (absorbs interpolation noise) */
const LIT_TOLERANCE = 0.15;

export interface SunBin {
  /** True azimuth (°, 0 = north) and altitude (°), hour-weighted means */
  azimuth: number;
  altitude: number;
  /** Direct-sun hours per year this direction stands for */
  hours: number;
}

export interface SunBinOptions {
  dayStep?: number;
  minuteStep?: number;
  azimuthBin?: number;
  altitudeBin?: number;
}

/**
 * A year of sun positions, binned. `horizon` (distant terrain, true azimuths) drops
 * directions the sun never reaches the scene from.
 */
export function sunBins(
  lat: number,
  lng: number,
  year: number,
  horizon: HorizonProfile | null,
  {
    dayStep = 2,
    minuteStep = 10,
    azimuthBin = 4,
    altitudeBin = 2,
  }: SunBinOptions = {},
): SunBin[] {
  const start = Date.UTC(year, 0, 1);
  const days = (Date.UTC(year + 1, 0, 1) - start) / 86_400_000;
  const weight = (dayStep * minuteStep) / 60;
  const acc = new Map<string, { az: number; alt: number; w: number }>();
  for (let d = 0; d < days; d += dayStep) {
    for (let m = 0; m < 1440; m += minuteStep) {
      const { altitude, azimuth } = getSunPosition(
        lat,
        lng,
        new Date(start + d * 86_400_000 + m * 60_000),
      );
      if (altitude <= 0) continue;
      if (
        horizon &&
        altitude - getHorizonAtAzimuth(horizon, azimuth) < SOLAR_DISC_MARGIN
      )
        continue;
      const key = `${Math.floor(azimuth / azimuthBin)}:${Math.floor(altitude / altitudeBin)}`;
      const b = acc.get(key);
      if (b) {
        b.az += azimuth * weight;
        b.alt += altitude * weight;
        b.w += weight;
      } else {
        acc.set(key, {
          az: azimuth * weight,
          alt: altitude * weight,
          w: weight,
        });
      }
    }
  }
  return [...acc.values()].map((b) => ({
    azimuth: b.az / b.w,
    altitude: b.alt / b.w,
    hours: b.w,
  }));
}

/**
 * Top-surface elevations (m a.s.l.): `terrain` with every cell whose centre lies in a
 * footprint, or within half a cell of its outline, raised to that building's top.
 * The half-cell margin keeps roof edges where the walls are, so shadow lengths come
 * out within about a metre. Grid and rings share the scene frame.
 */
export function surfaceGrid(terrain: Grid, buildings: SceneBuilding[]): Grid {
  const data = Float32Array.from(terrain.data);
  const { x0, y0, res, cols, rows } = terrain;
  for (const b of buildings) {
    const top = b.base + b.h;
    let xmin = Number.POSITIVE_INFINITY;
    let xmax = Number.NEGATIVE_INFINITY;
    let ymin = Number.POSITIVE_INFINITY;
    let ymax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < b.ring.length; i += 2) {
      xmin = Math.min(xmin, b.ring[i]);
      xmax = Math.max(xmax, b.ring[i]);
      ymin = Math.min(ymin, b.ring[i + 1]);
      ymax = Math.max(ymax, b.ring[i + 1]);
    }
    const margin = res / 2;
    const c0 = Math.max(0, Math.ceil((xmin - margin - x0) / res));
    const c1 = Math.min(cols - 1, Math.floor((xmax + margin - x0) / res));
    const r0 = Math.max(0, Math.ceil((y0 - ymax - margin) / res));
    const r1 = Math.min(rows - 1, Math.floor((y0 - ymin + margin) / res));
    for (let r = r0; r <= r1; r++) {
      const y = y0 - r * res;
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (top <= data[i]) continue;
        const x = x0 + c * res;
        if (pointInRing(x, y, b.ring) || distanceToRing(x, y, b.ring) <= margin)
          data[i] = top;
      }
    }
  }
  return { ...terrain, data };
}

export interface SunHoursLayers {
  /** Hours at the casting surface: roof tops inside (and just around) footprints */
  roof: Float32Array;
  /** Hours at `ground` heights, still shaded by the full surface (null if not asked) */
  ground: Float32Array | null;
}

/**
 * Direct-sun hours per cell over all `bins`. Shadows are cast by `surface`; lit-ness
 * is tested at the surface ("roof" layer) and, if given, at `ground` heights (bare
 * terrain), so ground right beside a wall gets ground values while shadows keep the
 * buildings' full footprint. `convergence` turns true azimuths into grid bearings.
 */
export function sunHoursLayers(
  surface: Grid,
  bins: SunBin[],
  convergence: number,
  ground?: Float32Array,
  onProgress?: (fraction: number) => void,
): SunHoursLayers {
  const { cols, rows, res, data: H } = surface;
  const n = cols * rows;
  const roof = new Float32Array(n);
  const groundHours = ground ? new Float32Array(n) : null;
  // M = max(surface, shadow line) per cell, filled sunward-first within one bin
  const M = new Float32Array(n);

  bins.forEach((bin, bi) => {
    const bearing = ((bin.azimuth + convergence) * Math.PI) / 180;
    // Unit step towards the sun in grid space: +col = east, +row = south
    const ux = Math.sin(bearing);
    const uy = -Math.cos(bearing);
    // One cell along the dominant axis; the upstream row/column is then always done
    const step = 1 / Math.max(Math.abs(ux), Math.abs(uy));
    const drop = step * res * Math.tan((bin.altitude * Math.PI) / 180);
    const rowMajor = Math.abs(uy) >= Math.abs(ux);
    const sx = rowMajor ? ux * step : Math.sign(ux);
    const sy = rowMajor ? Math.sign(uy) : uy * step;
    // Visit sunward cells first so upstream values exist when needed
    const rStart = uy > 0 ? rows - 1 : 0;
    const rEnd = uy > 0 ? -1 : rows;
    const rInc = uy > 0 ? -1 : 1;
    const cStart = ux > 0 ? cols - 1 : 0;
    const cEnd = ux > 0 ? -1 : cols;
    const cInc = ux > 0 ? -1 : 1;

    for (let r = rStart; r !== rEnd; r += rInc) {
      const qr = r + sy;
      const rowIn = qr >= 0 && qr <= rows - 1;
      const r0 = Math.floor(qr);
      const r1 = Math.min(rows - 1, r0 + 1);
      const ty = qr - r0;
      for (let c = cStart; c !== cEnd; c += cInc) {
        const i = r * cols + c;
        const h = H[i];
        const qc = c + sx;
        let shadow = Number.NEGATIVE_INFINITY;
        if (rowIn && qc >= 0 && qc <= cols - 1) {
          const c0 = Math.floor(qc);
          const c1 = Math.min(cols - 1, c0 + 1);
          const tx = qc - c0;
          const top = M[r0 * cols + c0] * (1 - tx) + M[r0 * cols + c1] * tx;
          const bottom = M[r1 * cols + c0] * (1 - tx) + M[r1 * cols + c1] * tx;
          shadow = top * (1 - ty) + bottom * ty - drop;
        }
        if (h + LIT_TOLERANCE >= shadow) roof[i] += bin.hours;
        if (groundHours && ground && ground[i] + LIT_TOLERANCE >= shadow) {
          groundHours[i] += bin.hours;
        }
        M[i] = h > shadow ? h : shadow;
      }
    }
    if (onProgress && (bi & 15) === 0) onProgress((bi + 1) / bins.length);
  });
  onProgress?.(1);
  return { roof, ground: groundHours };
}

/** Direct-sun hours at the `surface` itself (see sunHoursLayers) */
export function sunHours(
  surface: Grid,
  bins: SunBin[],
  convergence: number,
  onProgress?: (fraction: number) => void,
): Float32Array {
  return sunHoursLayers(surface, bins, convergence, undefined, onProgress).roof;
}

/** Bilinear sample of `hours` (on `grid`) at (x, n) in the grid's frame; null outside */
export function sampleHours(
  grid: Grid,
  hours: Float32Array,
  x: number,
  n: number,
): number | null {
  const fc = (x - grid.x0) / grid.res;
  const fr = (grid.y0 - n) / grid.res;
  if (fc < 0 || fr < 0 || fc > grid.cols - 1 || fr > grid.rows - 1) return null;
  const c = Math.min(Math.floor(fc), grid.cols - 2);
  const r = Math.min(Math.floor(fr), grid.rows - 2);
  const tx = fc - c;
  const ty = fr - r;
  const i = r * grid.cols + c;
  const top = hours[i] * (1 - tx) + hours[i + 1] * tx;
  const bottom =
    hours[i + grid.cols] * (1 - tx) + hours[i + grid.cols + 1] * tx;
  return top * (1 - ty) + bottom * ty;
}
