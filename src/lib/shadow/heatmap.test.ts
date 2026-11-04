import { describe, expect, it } from "vitest";
import type { Grid } from "@/lib/terrain/grid";
import type { SceneBuilding } from "@/lib/terrain/scene-types";
import {
  sampleHours,
  sunBins,
  sunHours,
  sunHoursLayers,
  surfaceGrid,
} from "./heatmap";

/** 200 m × 200 m flat ground at 5 m a.s.l., 2 m cells, centred on the origin */
function flat(): Grid {
  const res = 2;
  const cols = 101;
  return {
    x0: -100,
    y0: 100,
    res,
    cols,
    rows: cols,
    data: new Float32Array(cols * cols).fill(5),
  };
}

/** 10 m tall, 20 m × 20 m block centred on the origin */
const BLOCK: SceneBuilding = {
  id: "block",
  h: 10,
  base: 5,
  src: "h",
  ring: [-10, -10, 10, -10, 10, 10, -10, 10],
};

const at = (g: Grid, h: Float32Array, x: number, n: number) =>
  sampleHours(g, h, x, n) ?? Number.NaN;

describe("surfaceGrid", () => {
  it("raises cells inside footprints to the roof", () => {
    const s = surfaceGrid(flat(), [BLOCK]);
    const i = (r: number, c: number) => s.data[r * s.cols + c];
    expect(i(50, 50)).toBe(15); // centre: roof
    expect(i(50, 10)).toBe(5); // 80 m west: ground
  });
});

describe("sunHours (single direction)", () => {
  const g = surfaceGrid(flat(), [BLOCK]);
  // Sun due south at 20°: shadow runs north, 10 / tan(20°) ≈ 27.5 m past the block
  const h = sunHours(g, [{ azimuth: 180, altitude: 20, hours: 1 }], 0);

  it("shades the ground north of the block up to the shadow length", () => {
    expect(at(g, h, 0, 14)).toBe(0); // 4 m north of the north wall
    expect(at(g, h, 0, 34)).toBe(0); // 24 m north
    expect(at(g, h, 0, 44)).toBe(1); // 34 m north: past 27.5 m
    // Shadow edge (50% boundary between cells) lands within ~1.5 m of 10 + 27.5 m
    let end = 0;
    for (let n = 10; n < 60; n += 0.25) if (at(g, h, 0, n) < 0.5) end = n;
    expect(
      Math.abs(end - (10 + 10 / Math.tan((20 * Math.PI) / 180))),
    ).toBeLessThan(1.5);
  });

  it("lights the roof, the sunny side and the flanks", () => {
    expect(at(g, h, 0, 0)).toBe(1); // roof
    expect(at(g, h, 0, -20)).toBe(1); // south of the block
    expect(at(g, h, 30, 20)).toBe(1); // east of the shadow
  });

  it("turns the shadow with the sun (west sun shades the east side)", () => {
    const w = sunHours(g, [{ azimuth: 270, altitude: 20, hours: 1 }], 0);
    expect(at(g, w, 20, 0)).toBe(0);
    expect(at(g, w, -20, 0)).toBe(1);
  });

  it("applies grid convergence (true south sun shifts the shadow on the grid)", () => {
    // +20° convergence: true 180° points to grid 200°, so the shadow leans east
    const c = sunHours(g, [{ azimuth: 180, altitude: 20, hours: 1 }], 20);
    expect(at(g, c, 8, 30)).toBe(0);
    expect(at(g, c, -8, 30)).toBe(1);
  });
});

describe("sunBins", () => {
  it("covers all daylight hours of a year in Reykjavík", () => {
    const bins = sunBins(64.14, -21.93, 2026, null);
    const total = bins.reduce((s, b) => s + b.hours, 0);
    // Sun above the horizon ≈ 4,500 h a year at 64°N
    expect(total).toBeGreaterThan(4300);
    expect(total).toBeLessThan(4700);
    expect(bins.length).toBeLessThan(1500);
  });

  it("drops directions hidden by distant terrain", () => {
    const wall = {
      location: { lat: 64.14, lng: -21.93, elevation: 0 },
      profile: Array.from({ length: 360 }, (_, azimuth) => ({
        azimuth,
        elevationAngle: 10,
        distance: 5,
        peakElevation: 900,
      })),
      computedAt: new Date(),
    };
    const open = sunBins(64.14, -21.93, 2026, null).reduce(
      (s, b) => s + b.hours,
      0,
    );
    const blocked = sunBins(64.14, -21.93, 2026, wall).reduce(
      (s, b) => s + b.hours,
      0,
    );
    expect(blocked).toBeLessThan(open * 0.85);
    expect(
      Math.min(...sunBins(64.14, -21.93, 2026, wall).map((b) => b.altitude)),
    ).toBeGreaterThan(10);
  });
});

describe("sunHoursLayers", () => {
  it("colours ground beside walls as ground while shadows keep the full footprint", () => {
    const terrain = flat();
    const surface = surfaceGrid(terrain, [BLOCK]);
    const sun = [{ azimuth: 180, altitude: 20, hours: 1 }];
    const { roof, ground } = sunHoursLayers(surface, sun, 0, terrain.data);
    if (!ground) throw new Error("ground layer missing");
    const cell = (x: number, n: number) =>
      ((terrain.y0 - n) / terrain.res) * terrain.cols +
      (x - terrain.x0) / terrain.res;
    // Footprint edge cells (n = ±10) are raised for casting; as ground they differ by side
    expect(surface.data[cell(0, -10)]).toBe(15);
    expect(ground[cell(0, -10)]).toBe(1); // sunny south wall foot
    expect(ground[cell(0, 10)]).toBe(0); // shaded north wall foot
    expect(roof[cell(0, 0)]).toBe(1); // roof itself
    // Shadow length is unchanged by the extra layer
    expect(ground[cell(0, 30)]).toBe(0);
    expect(ground[cell(0, 44)]).toBe(1);
  });
});
