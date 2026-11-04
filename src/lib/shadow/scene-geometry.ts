/**
 * Turns a SceneResponse into three.js geometry + BVHs for raycasting.
 *
 * World frame: X = east, Y = up (metres above the scene's centre ground), Z = -north.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshBVH } from "three-mesh-bvh";
import type { Grid } from "@/lib/terrain/grid";
import {
  decodeElevations,
  type EncodedGrid,
  type SceneBuilding,
  type SceneResponse,
} from "@/lib/terrain/scene-types";

/** Bury building bases this far so footprints on slopes don't float */
const BUILDING_EMBED = 0.5;
/** Push distant terrain down a little so it never pokes through the detailed mesh */
const FAR_VISUAL_DROP = 2;

export interface BuiltScene {
  data: SceneResponse;
  /** Elevation (m a.s.l.) that maps to world Y = 0 */
  yRef: number;
  nearGrid: Grid;
  farGrid: Grid;
  terrain: THREE.BufferGeometry;
  farTerrain: THREE.BufferGeometry;
  buildings: THREE.BufferGeometry | null;
  terrainBvh: MeshBVH;
  buildingsBvh: MeshBVH | null;
  /** First triangle index of each building in `buildings`, for mapping hits back */
  buildingTriStart: Int32Array;
  buildingList: SceneBuilding[];
  /**
   * Flat caps at each building's top with plan-view UVs (same mapping as
   * `terrain`), for painting per-cell data such as the sun-hours heatmap on roofs.
   */
  roofs: THREE.BufferGeometry | null;
}

/** Lift roof caps above the roof so they never z-fight with the building's own cap */
const ROOF_CAP_LIFT = 0.05;

/**
 * Plan-view UVs over `grid` (u east, v south from the grid's first row), so a
 * texture laid out like the grid (row 0 = north) maps onto any surface by x/z.
 */
function setPlanUv(geom: THREE.BufferGeometry, grid: Grid) {
  const pos = geom.attributes.position;
  const w = (grid.cols - 1) * grid.res;
  const h = (grid.rows - 1) * grid.res;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - grid.x0) / w;
    // world z = -north; v grows southward like grid rows
    uv[i * 2 + 1] = (grid.y0 + pos.getZ(i)) / h;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function roofCaps(
  buildings: SceneBuilding[],
  yRef: number,
  grid: Grid,
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const b of buildings) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < b.ring.length; i += 2)
      pts.push(new THREE.Vector2(b.ring[i], b.ring[i + 1]));
    if (pts.length < 3) continue;
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
    // Shape (x, north) -> world (x, top, -north)
    g.rotateX(-Math.PI / 2);
    g.translate(0, b.base + b.h + ROOF_CAP_LIFT - yRef, 0);
    g.deleteAttribute("uv");
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (merged) setPlanUv(merged, grid);
  return merged;
}

function decodeGrid(g: EncodedGrid): Grid {
  return {
    x0: g.x0,
    y0: g.y0,
    res: g.res,
    cols: g.cols,
    rows: g.rows,
    data: decodeElevations(g.data),
  };
}

/** Elevation colour ramp (m a.s.l. → sRGB). Sea / nodata is stored as 0 m. */
const RAMP: [number, THREE.Color][] = [
  [0.3, new THREE.Color("#4f7ea8")],
  [0.31, new THREE.Color("#b9b58f")],
  [3, new THREE.Color("#a3ab8c")],
  [150, new THREE.Color("#8f9a74")],
  [400, new THREE.Color("#7d7462")],
  [750, new THREE.Color("#8a8580")],
  [1000, new THREE.Color("#e8e8ea")],
];
const tmpColor = new THREE.Color();

function elevationColor(z: number, out: THREE.Color) {
  if (z <= RAMP[0][0]) return out.copy(RAMP[0][1]);
  for (let i = 1; i < RAMP.length; i++) {
    const [z1, c1] = RAMP[i];
    if (z <= z1) {
      const [z0, c0] = RAMP[i - 1];
      return out.copy(c0).lerp(c1, (z - z0) / (z1 - z0));
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}

function terrainGeometry(
  grid: Grid,
  yRef: number,
  skipCell?: (x: number, n: number, res: number) => boolean,
  drop = 0,
): THREE.BufferGeometry {
  const { cols, rows, res, x0, y0, data } = grid;
  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      positions[i * 3] = x0 + c * res;
      positions[i * 3 + 1] = data[i] - yRef - drop;
      positions[i * 3 + 2] = -(y0 - r * res);
      elevationColor(data[i], tmpColor).toArray(colors, i * 3);
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      // cell spans x0+c*res .. +res (east), y0-r*res .. -res (north)
      if (skipCell?.(x0 + c * res, y0 - (r + 1) * res, res)) continue;
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      // CCW seen from above (+Y)
      indices.push(a, d, b, b, d, e);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setIndex(
    positions.length / 3 > 65535
      ? new THREE.Uint32BufferAttribute(indices, 1)
      : new THREE.Uint16BufferAttribute(indices, 1),
  );
  geom.computeVertexNormals();
  return geom;
}

function buildingGeometry(
  b: SceneBuilding,
  yRef: number,
): THREE.BufferGeometry | null {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < b.ring.length; i += 2)
    pts.push(new THREE.Vector2(b.ring[i], b.ring[i + 1]));
  if (pts.length < 3) return null;
  // Parts that start above ground (min_height) float; ground-level ones get buried a little
  const bottom = b.mh ? b.mh : -BUILDING_EMBED;
  const depth = b.h - bottom;
  if (depth <= 0) return null;
  const shape = new THREE.Shape(pts);
  const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  // Shape (x, north, depth) -> world (x, depth, -north)
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, b.base + bottom - yRef, 0);
  // mergeGeometries needs matching attributes and no groups
  geom.clearGroups();
  geom.deleteAttribute("uv");
  return geom.index ? geom.toNonIndexed() : geom;
}

export function buildScene(data: SceneResponse): BuiltScene {
  const yRef = data.groundElevation;
  const nearGrid = decodeGrid(data.near);
  const farGrid = decodeGrid(data.far);

  const terrain = terrainGeometry(nearGrid, yRef);
  setPlanUv(terrain, nearGrid);

  // Distant terrain with a hole where the detailed terrain is
  const nx0 = nearGrid.x0;
  const nx1 = nearGrid.x0 + (nearGrid.cols - 1) * nearGrid.res;
  const nn1 = nearGrid.y0;
  const nn0 = nearGrid.y0 - (nearGrid.rows - 1) * nearGrid.res;
  const farTerrain = terrainGeometry(
    farGrid,
    yRef,
    (x, n, res) => x >= nx0 && x + res <= nx1 && n >= nn0 && n + res <= nn1,
    FAR_VISUAL_DROP,
  );

  const parts: THREE.BufferGeometry[] = [];
  const buildingList: SceneBuilding[] = [];
  const triStarts: number[] = [];
  let tris = 0;
  for (const b of data.buildings) {
    const g = buildingGeometry(b, yRef);
    if (!g) continue;
    triStarts.push(tris);
    tris += g.attributes.position.count / 3;
    parts.push(g);
    buildingList.push(b);
  }
  const buildings = parts.length ? mergeGeometries(parts, false) : null;
  for (const p of parts) p.dispose();
  buildings?.computeVertexNormals();

  return {
    data,
    yRef,
    nearGrid,
    farGrid,
    terrain,
    farTerrain,
    buildings,
    terrainBvh: new MeshBVH(terrain),
    // indirect: keep triangle order intact so faceIndex maps back to buildingTriStart
    buildingsBvh: buildings ? new MeshBVH(buildings, { indirect: true }) : null,
    buildingTriStart: Int32Array.from(triStarts),
    buildingList,
    roofs: roofCaps(buildingList, yRef, nearGrid),
  };
}

export function buildingForTriangle(
  scene: BuiltScene,
  faceIndex: number,
): SceneBuilding | null {
  const starts = scene.buildingTriStart;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= faceIndex) lo = mid;
    else hi = mid - 1;
  }
  return scene.buildingList[lo] ?? null;
}

export function disposeScene(scene: BuiltScene) {
  scene.terrain.dispose();
  scene.farTerrain.dispose();
  scene.buildings?.dispose();
  scene.roofs?.dispose();
}
