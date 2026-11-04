import { describe, expect, it } from "vitest";
import type { Grid } from "./grid";
import { footprintArea, surfaceEstimate } from "./surface-heights";

/** 200 m × 200 m grid at 2 m, ground at 10 m, with a 15 m block over [-20, 20]² */
function blockGrid(): Grid {
  const res = 2;
  const cols = 101;
  const data = new Float32Array(cols * cols);
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -100 + c * res;
      const y = 100 - r * res;
      data[r * cols + c] = Math.abs(x) <= 20 && Math.abs(y) <= 20 ? 25 : 10;
    }
  }
  return { x0: -100, y0: 100, res, cols, rows: cols, data };
}

const square = [-20, -20, 20, -20, 20, 20, -20, 20];

describe("surfaceEstimate", () => {
  it("recovers a block's height above surrounding ground", () => {
    const e = surfaceEstimate(square, blockGrid());
    expect(e?.ground).toBeCloseTo(10);
    expect(e?.height).toBeCloseTo(15);
  });

  it("returns null outside the grid", () => {
    expect(
      surfaceEstimate([500, 500, 520, 500, 520, 520], blockGrid()),
    ).toBeNull();
  });

  it("computes footprint area", () => {
    expect(footprintArea(square)).toBe(1600);
  });
});

describe("cropGrid", () => {
  it("crops and max-pools without re-reading", async () => {
    const { cropGrid } = await import("./dem");
    const g = blockGrid();
    const c = cropGrid(g, 0, 0, 30, 4);
    // 2 m cells pooled by 2: the 25 m block survives as the max, ground stays 10
    expect(c.res).toBe(4);
    expect(Math.max(...c.data)).toBe(25);
    expect(Math.min(...c.data)).toBe(10);
    expect(c.cols).toBe(c.rows);
  });
});
