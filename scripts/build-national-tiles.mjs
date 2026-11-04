/**
 * Builds the compact national elevation product used for distant terrain and
 * horizons: ÍslandsDEM v1.0 20 m, max-pooled to RES metres, stored as brotli'd
 * row-delta Int16 decimetre tiles (TILE×TILE cells). All-sea tiles are skipped.
 *
 * Input:  data/dem/raw/IslandsDEMv1.0_20x20m_isn93_zmasl.tif
 *         (https://ftp.natt.is/gisdata/raster/IslandsDEMv1.0_20x20m_isn93_zmasl.tif)
 * Output: data/dem/national-<RES>m/{index.json, <tx>_<ty>.i16.br}
 *
 * Usage: mise x -- node scripts/build-national-tiles.mjs [res=40] [--dry]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants } from "node:zlib";
import { fromFile } from "geotiff";

const SRC = "data/dem/raw/IslandsDEMv1.0_20x20m_isn93_zmasl.tif";
const RES = Number(process.argv[2]) || 40;
const DRY = process.argv.includes("--dry");
const TILE = 250;
const NODATA = -1e30;

const image = await (await fromFile(SRC)).getImage();
const [originX, originY] = image.getOrigin();
const [srcRes] = image.getResolution();
const factor = Math.round(RES / srcRes);
const cols = Math.floor(image.getWidth() / factor);
const rows = Math.floor(image.getHeight() / factor);
const tilesX = Math.ceil(cols / TILE);
const tilesY = Math.ceil(rows / TILE);
const outDir = `data/dem/national-${RES}m`;
if (!DRY) await mkdir(outDir, { recursive: true });

let written = 0;
let bytes = 0;
for (let ty = 0; ty < tilesY; ty++) {
  // One strip of source rows per tile row
  const r0 = ty * TILE;
  const r1 = Math.min(rows, r0 + TILE);
  const [strip] = await image.readRasters({
    window: [0, r0 * factor, cols * factor, r1 * factor],
  });
  const stripCols = cols * factor;
  for (let tx = 0; tx < tilesX; tx++) {
    const c0 = tx * TILE;
    const c1 = Math.min(cols, c0 + TILE);
    const tile = new Int16Array(TILE * TILE);
    let land = false;
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        let max = 0;
        for (let dy = 0; dy < factor; dy++) {
          const row = ((r - r0) * factor + dy) * stripCols + c * factor;
          for (let dx = 0; dx < factor; dx++) {
            const v = strip[row + dx];
            if (v > NODATA && v > max) max = v;
          }
        }
        const q = Math.round(max * 10);
        if (q > 0) land = true;
        tile[(r - r0) * TILE + (c - c0)] = q;
      }
    }
    if (!land) continue;
    // Row-wise delta: terrain is smooth, so differences are small and compress well
    const delta = new Int16Array(TILE * TILE);
    for (let r = 0; r < TILE; r++) {
      let prev = 0;
      for (let c = 0; c < TILE; c++) {
        const v = tile[r * TILE + c];
        delta[r * TILE + c] = v - prev;
        prev = v;
      }
    }
    const gz = brotliCompressSync(Buffer.from(delta.buffer), {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_LGWIN]: 22,
      },
    });
    bytes += gz.length;
    written++;
    if (!DRY) await writeFile(`${outDir}/${tx}_${ty}.i16.br`, gz);
  }
  process.stdout.write(
    `\rrow ${ty + 1}/${tilesY}  tiles ${written}  ${(bytes / 1e6).toFixed(1)} MB`,
  );
}
process.stdout.write("\n");

const index = {
  source:
    "ÍslandsDEM v1.0 20 m (Náttúrufræðistofnun / LMÍ, CC BY 4.0), max-pooled",
  crs: "EPSG:3057",
  // Cell centre of global cell (0, 0); rows go south
  x0: originX + (factor * srcRes) / 2,
  y0: originY - (factor * srcRes) / 2,
  res: RES,
  tile: TILE,
  cols,
  rows,
  encoding:
    "brotli of row-wise delta Int16 little-endian decimetres, row-major TILE×TILE; missing tile = sea (0 m)",
};
if (!DRY)
  await writeFile(`${outDir}/index.json`, JSON.stringify(index, null, 2));
console.log(
  `${written} tiles, ${(bytes / 1e6).toFixed(1)} MB`,
  DRY ? "(dry run)" : `-> ${outDir}`,
);
