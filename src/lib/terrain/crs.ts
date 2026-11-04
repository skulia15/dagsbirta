/**
 * Coordinate helpers for ISN93 / Lambert 1993 (EPSG:3057), the CRS of ÍslandsDEM.
 * Safe to import from both server and client code.
 */

import proj4 from "proj4";

export const ISN93 = "EPSG:3057";

proj4.defs(
  ISN93,
  "+proj=lcc +lat_0=65 +lon_0=-19 +lat_1=64.25 +lat_2=65.75 +x_0=500000 +y_0=500000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

/** WGS84 lat/lng -> ISN93 easting/northing (metres) */
export function toIsn93(lat: number, lng: number): [number, number] {
  const [x, y] = proj4("EPSG:4326", ISN93, [lng, lat]);
  return [x, y];
}

/** ISN93 easting/northing (metres) -> WGS84 lat/lng */
export function fromIsn93(x: number, y: number): { lat: number; lng: number } {
  const [lng, lat] = proj4(ISN93, "EPSG:4326", [x, y]);
  return { lat, lng };
}

/**
 * Grid bearing (degrees clockwise from ISN93 grid north) of true north at a point.
 * A direction with true azimuth A has grid bearing A + convergence.
 * In Reykjavík this is about +2.65°, enough to visibly skew shadows if ignored.
 */
export function gridConvergence(lat: number, lng: number): number {
  const [x0, y0] = toIsn93(lat, lng);
  const [x1, y1] = toIsn93(lat + 0.001, lng);
  return (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI;
}
