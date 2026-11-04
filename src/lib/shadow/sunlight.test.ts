import { describe, expect, it } from "vitest";
import { getHorizonAtAzimuth } from "@/lib/calculations/shadow";
import { computeHorizon, type Grid } from "@/lib/terrain/grid";
import {
  encodeElevations,
  type SceneBuilding,
  type SceneResponse,
} from "@/lib/terrain/scene-types";
import { coarsenProfile, obstructionProfile } from "./obstruction";
import { buildScene } from "./scene-geometry";
import {
  dayTimeline,
  dropOnto,
  evaluateSpot,
  farHorizon,
  spotOrigin,
  sunDirection,
} from "./sunlight";

const CENTER = { lat: 64.1417, lng: -21.9266 };

function flatGrid(
  halfSize: number,
  res: number,
  z = 0,
  peak?: (x: number, n: number) => number,
) {
  const cells = Math.round((2 * halfSize) / res) + 1;
  const data = new Float32Array(cells * cells);
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const x = -halfSize + c * res;
      const n = halfSize - r * res;
      data[r * cells + c] = peak ? peak(x, n) : z;
    }
  }
  return { x0: -halfSize, y0: halfSize, res, cols: cells, rows: cells, data };
}

function encode(g: ReturnType<typeof flatGrid>) {
  return { ...g, data: encodeElevations(g.data) };
}

function makeScene(
  buildings: SceneBuilding[],
  farPeak?: (x: number, n: number) => number,
): SceneResponse {
  return {
    center: { ...CENTER, x: 0, y: 0 },
    convergence: 0,
    groundElevation: 0,
    radius: 100,
    near: encode(flatGrid(100, 2)),
    far: encode(flatGrid(15_000, 50, 0, farPeak)),
    buildings,
    distantHorizon: [],
    warnings: [],
    attribution: [],
  };
}

/** 8 m tall, 20 m wide wall-like block 10–20 m south of the origin */
const SOUTH_BLOCK: SceneBuilding = {
  id: "south",
  h: 8,
  base: 0,
  src: "h",
  ring: [-10, -20, 10, -20, 10, -10, -10, -10],
};

// Solar noon in Reykjavík is ~13:30 UTC
const winterNoon = new Date(Date.UTC(2026, 11, 21, 13, 30));
const summerNoon = new Date(Date.UTC(2026, 5, 21, 13, 30));

describe("sunDirection", () => {
  it("maps azimuth to the scene frame (X east, Z = -north)", () => {
    const south = sunDirection(180, 0, 0);
    expect(south.x).toBeCloseTo(0);
    expect(south.z).toBeCloseTo(1);
    const east = sunDirection(90, 0, 0);
    expect(east.x).toBeCloseTo(1);
    expect(sunDirection(0, 90, 0).y).toBeCloseTo(1);
  });

  it("applies grid convergence", () => {
    // True north with +3° convergence points slightly east on the grid
    expect(sunDirection(0, 0, 3).x).toBeGreaterThan(0);
  });
});

describe("evaluateSpot", () => {
  const scene = buildScene(makeScene([SOUTH_BLOCK]));
  const spot = dropOnto(scene, 0, 0);
  if (!spot) throw new Error("no ground under origin");
  const origin = spotOrigin(spot, 0);
  const horizon = farHorizon(scene, origin);

  it("is shaded by the block at winter noon (sun ~2.6° high)", () => {
    const r = evaluateSpot(scene, origin, horizon, winterNoon);
    expect(r.altitude).toBeGreaterThan(1);
    expect(r.altitude).toBeLessThan(4);
    expect(r.lit).toBe(false);
    expect(r.blocker.kind).toBe("building");
    if (r.blocker.kind === "building")
      expect(r.blocker.building?.id).toBe("south");
  });

  it("is lit at summer noon (sun ~49° clears an 8 m block 10 m away)", () => {
    const r = evaluateSpot(scene, origin, horizon, summerNoon);
    expect(r.altitude).toBeGreaterThan(45);
    expect(r.lit).toBe(true);
  });

  it("is night with sun below horizon", () => {
    const r = evaluateSpot(
      scene,
      origin,
      horizon,
      new Date(Date.UTC(2026, 11, 21, 2, 0)),
    );
    expect(r.blocker.kind).toBe("night");
  });

  it("a roof spot sees over the block", () => {
    // World Z = -north, so 15 m south is z = +15
    const roof = dropOnto(scene, 0, 15);
    expect(roof?.surface).toBe("roof");
    expect(roof?.point.y).toBeCloseTo(8, 0);
  });

  it("summarises a day", () => {
    const day = dayTimeline(scene, origin, horizon, Date.UTC(2026, 5, 21));
    expect(day.slots).toHaveLength(288);
    expect(day.sunMinutes).toBeGreaterThan(0);
    expect(day.sunMinutes).toBeLessThan(day.daylightMinutes);
  });
});

describe("distant terrain", () => {
  // 600 m ridge 10 km due south: blocks the low winter sun but not the summer sun
  const ridge = (_x: number, n: number) =>
    n < -9_900 && n > -10_100 ? 600 : 0;
  const scene = buildScene(makeScene([], ridge));
  const spot = dropOnto(scene, 0, 0);
  if (!spot) throw new Error("no ground under origin");
  const origin = spotOrigin(spot, 0);
  const horizon = farHorizon(scene, origin);

  it("includes curvature + refraction in the horizon angle", () => {
    const south = horizon.profile[180];
    // atan((600 - 0.87 * d² / 2R) / d): 3.42° at the ridge's near edge (~9.93 km);
    // without curvature it would be 3.46°
    expect(south.elevationAngle).toBeGreaterThan(3.38);
    expect(south.elevationAngle).toBeLessThan(3.44);
    expect(horizon.profile[0].elevationAngle).toBe(0);
  });

  it("reports the sun behind distant terrain at winter noon", () => {
    const r = evaluateSpot(scene, origin, horizon, winterNoon);
    expect(r.blocker.kind).toBe("horizon");
  });

  it("merges the server's distant horizon (terrain beyond the mesh)", () => {
    const data = makeScene([]);
    data.distantHorizon = Array.from({ length: 360 }, (_, azimuth) => ({
      azimuth,
      elevationAngle: azimuth === 180 ? 5 : 0,
      distance: 30,
      peakElevation: 2600,
    }));
    const s2 = buildScene(data);
    const o = spotOrigin(dropOnto(s2, 0, 0) ?? spot, 0);
    const h = farHorizon(s2, o);
    expect(h.profile[180].elevationAngle).toBe(5);
    expect(h.profile[180].distance).toBe(30);
    expect(h.profile[90].elevationAngle).toBe(0);
  });

  it("starts marching where rays leave the detailed area", () => {
    const grid: Grid = flatGrid(1000, 50, 0, (x) =>
      Math.abs(x) < 60 ? 100 : 0,
    );
    // A 100 m bump at the observer is ignored when minDistance skips past it
    const p = computeHorizon(grid, 0, 0, 0, 0, {
      angularResolution: 90,
      minDistance: 100,
      maxDistance: 900,
    });
    expect(p[1].elevationAngle).toBe(0);
  });
});

describe("obstructionProfile", () => {
  const scene = buildScene(makeScene([SOUTH_BLOCK]));
  const spot = dropOnto(scene, 0, 0);
  if (!spot) throw new Error("no ground under origin");
  const origin = spotOrigin(spot, 0);
  const profile = obstructionProfile(scene, origin);
  const horizon = farHorizon(scene, origin);

  it("finds the block's top edge to the south", () => {
    // Near face 10 m away, 8 m tall, eye 0.2 m above ground: atan(7.8 / 10) ≈ 37.95°
    const south = profile.profile[180];
    expect(south.source).toBe("building");
    expect(south.elevationAngle).toBeCloseTo(37.95, 0);
    expect(south.distance * 1000).toBeGreaterThan(9.9);
  });

  it("leaves open directions at the terrain horizon", () => {
    expect(profile.profile[0].elevationAngle).toBe(0);
    expect(profile.profile[0].source).toBe("terrain");
  });

  it("agrees with direct ray casting (winter noon shaded, summer noon lit)", () => {
    for (const date of [winterNoon, summerNoon]) {
      const r = evaluateSpot(scene, origin, horizon, date);
      expect(r.altitude > getHorizonAtAzimuth(profile, r.azimuth)).toBe(r.lit);
    }
  });

  it("coarsens conservatively (bin maximum)", () => {
    const coarse = coarsenProfile(profile, 10);
    expect(coarse.profile).toHaveLength(36);
    expect(coarse.profile[18].elevationAngle).toBeGreaterThanOrEqual(
      profile.profile[180].elevationAngle,
    );
  });
});
