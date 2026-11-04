import { describe, expect, it } from "vitest";
import {
  type Building,
  floorFromHaed,
  mergeLukr,
  RESIDENTIAL,
} from "./buildings";

const square = (x: number, y: number, s = 10) => [
  x,
  y,
  x + s,
  y,
  x + s,
  y + s,
  x,
  y + s,
];

describe("LUKR floors", () => {
  it("parses numeric HAED codes only", () => {
    expect(floorFromHaed("04")).toBe(4);
    expect(floorFromHaed("00")).toBeNull();
    expect(floorFromHaed("-1")).toBeNull();
    expect(floorFromHaed("B2")).toBeNull();
    expect(floorFromHaed(null)).toBeNull();
  });

  it("treats only residential units as reliable", () => {
    expect(RESIDENTIAL.test("Íbúð")).toBe(true);
    expect(RESIDENTIAL.test("Einbýlishús")).toBe(true);
    expect(RESIDENTIAL.test("Verslun ofl.")).toBe(false);
    expect(RESIDENTIAL.test("Bílskúr")).toBe(false);
  });

  it("overrides defaults, keeps OSM heights and taller OSM levels", () => {
    const osm: Building[] = [
      { id: "default", h: 6, src: "d", ring: square(0, 0) },
      { id: "tagged", h: 40, src: "h", ring: square(100, 0) },
      { id: "levels", h: 58, src: "l", ring: square(200, 0) },
    ];
    const lukr = [
      { key: "a", floors: 4, ring: square(-5, -5, 20) },
      { key: "b", floors: 2, ring: square(95, -5, 20) },
      { key: "c", floors: 3, ring: square(195, -5, 20) },
      { key: "missing-from-osm", floors: 5, ring: square(500, 500) },
    ];
    const out = mergeLukr(osm, lukr);
    const byId = Object.fromEntries(out.map((b) => [b.id, b]));
    expect(byId.default).toMatchObject({ h: 13, src: "r" });
    expect(byId.tagged).toMatchObject({ h: 40, src: "h" });
    expect(byId.levels).toMatchObject({ h: 58, src: "l" });
    expect(byId["lukr-missing-from-osm"]).toMatchObject({ h: 16, src: "r" });
    expect(out).toHaveLength(4);
  });
});
