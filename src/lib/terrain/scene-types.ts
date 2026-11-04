/**
 * Wire format for GET /api/scene, shared by the route and the 3D explorer.
 *
 * Scene-local frame: x = metres east of centre, n = metres north of centre
 * (both on the ISN93 grid), elevation = metres above sea level.
 */

import type { HorizonPoint } from "../../types/index";

export interface EncodedGrid {
  /** Local easting of column 0 */
  x0: number;
  /** Local northing of row 0 (rows go south) */
  y0: number;
  res: number;
  cols: number;
  rows: number;
  /** base64 Int16 little-endian, decimetres above sea level */
  data: string;
}

export interface SceneBuilding {
  id: string;
  /** Height above ground (m) */
  h: number;
  /** Height above ground where this part starts (m), for OSM building:part */
  mh?: number;
  /** Lowest ground elevation under the footprint (m a.s.l.) */
  base: number;
  /** h = OSM height tag, r = Reykjavík registry floors, l = OSM building:levels,
   * s = surface model (large buildings only), d = type default */
  src: "h" | "r" | "l" | "s" | "d";
  /** Flat [x0, n0, x1, n1, ...] local outer ring */
  ring: number[];
}

export interface SceneResponse {
  center: { lat: number; lng: number; x: number; y: number };
  /** Grid bearing of true north at centre, degrees */
  convergence: number;
  /** Ground elevation at centre (m a.s.l.) */
  groundElevation: number;
  /** Half-size of the detailed area, metres */
  radius: number;
  near: EncodedGrid;
  far: EncodedGrid;
  buildings: SceneBuilding[];
  /** Horizon from terrain 16–40 km away, seen from the centre (true azimuths, 1° steps) */
  distantHorizon: HorizonPoint[];
  /** Non-fatal problems, e.g. OSM unavailable so buildings are partial */
  warnings: string[];
  attribution: string[];
}

export function encodeElevations(data: Float32Array): string {
  const q = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) q[i] = Math.round(data[i] * 10);
  return Buffer.from(q.buffer, q.byteOffset, q.byteLength).toString("base64");
}

export function decodeElevations(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const q = new Int16Array(bytes.buffer);
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] / 10;
  return out;
}
