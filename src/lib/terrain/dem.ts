/**
 * Server-side access to ÍslandsDEM v1.0 (ISN93). It is a surface model, not a
 * bare-earth DTM: the per-pixel median of multi-temporal ArcticDEM satellite stereo
 * DEMs (+ GLO-30). The median removes thin structures (e.g. Hallgrímskirkja tower)
 * but large buildings remain as smoothed bumps. Stated accuracy: <2 m XY, <0.5 m Z.
 * Metadata: https://gatt.gis.is/geonetwork/srv/eng/catalog.search#/metadata/e6712430-a63c-4ae5-9158-c89d16da6361
 *
 * - Fine (2 m): 50 km tiles listed in islandsdem-tiles.json. Read from
 *   data/dem/raw/ when downloaded, otherwise straight from gis.lmi.is with HTTP
 *   range requests (the files are tiled + ZSTD, so a 1 km window is ~0.3 s).
 * - National (80 m): data/dem/national-80m/, the 20 m national DEM max-pooled to
 *   80 m and stored as compressed tiles (17 MB, committed; rebuild with
 *   scripts/build-national-tiles.mjs). Used for distant terrain and horizons.
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliDecompress } from "node:zlib";
import { fromFile, fromUrl, type GeoTIFFImage } from "geotiff";
import type { Grid } from "./grid";
import tileIndex from "./islandsdem-tiles.json";

export type { Grid } from "./grid";
export { sampleGrid } from "./grid";

const RAW_DIR = path.join(process.cwd(), "data", "dem", "raw");
const NODATA_THRESHOLD = -1e30;
const FINE_RES = 2;

interface TileInfo {
  nr: string;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  url: string;
}

const tiles = tileIndex.tiles as TileInfo[];
const tileImages = new Map<string, Promise<GeoTIFFImage>>();

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function openTile(tile: TileInfo): Promise<GeoTIFFImage> {
  let p = tileImages.get(tile.nr);
  if (!p) {
    p = (async () => {
      const local = path.join(
        RAW_DIR,
        path.basename(new URL(tile.url).pathname),
      );
      const tiff = (await exists(local))
        ? await fromFile(local)
        : await fromUrl(tile.url);
      return tiff.getImage();
    })();
    p.catch(() => tileImages.delete(tile.nr));
    tileImages.set(tile.nr, p);
  }
  return p;
}

function clean(v: number): number {
  return v > NODATA_THRESHOLD ? Math.max(0, v) : 0;
}

/**
 * Copy the overlap of `image` with `target` (same resolution as the image) into
 * target.data. Neighbouring tiles agree in their 2 px overlap, so overwriting is fine.
 */
async function pasteImage(image: GeoTIFFImage, target: Grid) {
  const [originX, originY] = image.getOrigin();
  const [res] = image.getResolution();
  const w = image.getWidth();
  const h = image.getHeight();
  // Source pixel index of the target's first cell centre
  const c0 = Math.round((target.x0 - originX) / res - 0.5);
  const r0 = Math.round((originY - target.y0) / res - 0.5);
  const sc0 = Math.max(0, c0);
  const sr0 = Math.max(0, r0);
  const sc1 = Math.min(w, c0 + target.cols);
  const sr1 = Math.min(h, r0 + target.rows);
  if (sc1 <= sc0 || sr1 <= sr0) return;
  const [data] = (await image.readRasters({
    window: [sc0, sr0, sc1, sr1],
  })) as unknown as [Float32Array];
  const ww = sc1 - sc0;
  for (let r = sr0; r < sr1; r++) {
    const dst = (r - r0) * target.cols - c0;
    const src = (r - sr0) * ww - sc0;
    for (let c = sc0; c < sc1; c++) target.data[dst + c] = clean(data[src + c]);
  }
}

/** Downsample by `factor`, averaging (terrain surface) or max-pooling (horizon peaks) */
function downsample(grid: Grid, factor: number, mode: "mean" | "max"): Grid {
  if (factor === 1) return grid;
  const cols = Math.floor(grid.cols / factor);
  const rows = Math.floor(grid.rows / factor);
  const data = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let acc = mode === "max" ? Number.NEGATIVE_INFINITY : 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = (r * factor + dy) * grid.cols + c * factor;
        for (let dx = 0; dx < factor; dx++) {
          const v = grid.data[row + dx];
          acc = mode === "max" ? Math.max(acc, v) : acc + v;
        }
      }
      data[r * cols + c] = mode === "max" ? acc : acc / (factor * factor);
    }
  }
  const offset = ((factor - 1) * grid.res) / 2;
  return {
    x0: grid.x0 + offset,
    y0: grid.y0 - offset,
    res: grid.res * factor,
    cols,
    rows,
    data,
  };
}

/**
 * Square grid from the 2 m DEM centred on (cx, cy), mosaicked across tiles.
 * `res` must be a multiple of 2 m. Sea / nodata / outside coverage becomes 0 m.
 */
export async function readFineGrid(
  cx: number,
  cy: number,
  halfSize: number,
  res: number,
): Promise<Grid> {
  const factor = Math.max(1, Math.round(res / FINE_RES));
  // Native pixel centres sit on odd metres (tile origins are at …998)
  const snap = (v: number) => Math.round((v - 1) / FINE_RES) * FINE_RES + 1;
  const x0 = snap(cx - halfSize);
  const y0 = snap(cy + halfSize);
  const cells = (Math.ceil((2 * halfSize) / (FINE_RES * factor)) + 1) * factor;
  const fine: Grid = {
    x0,
    y0,
    res: FINE_RES,
    cols: cells,
    rows: cells,
    data: new Float32Array(cells * cells),
  };
  const x1 = x0 + (cells - 1) * FINE_RES;
  const y1 = y0 - (cells - 1) * FINE_RES;

  const hits = tiles.filter(
    (t) => t.xmin <= x1 && t.xmax >= x0 && t.ymin <= y0 && t.ymax >= y1,
  );
  if (hits.length === 0) {
    throw new Error("Location is outside ÍslandsDEM coverage");
  }
  const images = await Promise.all(hits.map(openTile));
  for (const image of images) await pasteImage(image, fine);
  return downsample(fine, factor, "mean");
}

// ---------- national 80 m tiles ----------

const NATIONAL_DIR = path.join(process.cwd(), "data", "dem", "national-80m");
const MAX_CACHED_TILES = 160;
const unbrotli = promisify(brotliDecompress);

interface NationalIndex {
  x0: number;
  y0: number;
  res: number;
  tile: number;
  cols: number;
  rows: number;
}

let nationalIndex: Promise<NationalIndex> | null = null;
/** LRU (Map keeps insertion order); null = all-sea tile */
const nationalTiles = new Map<string, Promise<Int16Array | null>>();

function loadNationalIndex(): Promise<NationalIndex> {
  nationalIndex ??= readFile(path.join(NATIONAL_DIR, "index.json"), "utf8")
    .then((t) => JSON.parse(t) as NationalIndex)
    .catch((err) => {
      nationalIndex = null;
      throw new Error(
        `National DEM tiles missing in ${NATIONAL_DIR}; run scripts/build-national-tiles.mjs (${err})`,
      );
    });
  return nationalIndex;
}

async function decodeNationalTile(
  file: string,
  size: number,
): Promise<Int16Array | null> {
  let buf: Buffer;
  try {
    buf = await readFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null; // sea
    throw err;
  }
  const raw = await unbrotli(buf);
  const q = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const out = new Int16Array(size * size);
  for (let r = 0; r < size; r++) {
    let acc = 0;
    for (let c = 0; c < size; c++) {
      acc += q[r * size + c]; // undo row-wise delta
      out[r * size + c] = acc;
    }
  }
  return out;
}

function nationalTile(
  tx: number,
  ty: number,
  size: number,
): Promise<Int16Array | null> {
  const key = `${tx}_${ty}`;
  let p = nationalTiles.get(key);
  if (p) {
    nationalTiles.delete(key); // refresh LRU position
  } else {
    p = decodeNationalTile(path.join(NATIONAL_DIR, `${key}.i16.br`), size);
    p.catch(() => nationalTiles.delete(key));
  }
  nationalTiles.set(key, p);
  while (nationalTiles.size > MAX_CACHED_TILES) {
    const oldest = nationalTiles.keys().next().value as string;
    nationalTiles.delete(oldest);
  }
  return p;
}

/** Square grid from the national 80 m DEM, max-pooled if `res` is coarser. */
export async function readNationalGrid(
  cx: number,
  cy: number,
  halfSize: number,
  res = 80,
): Promise<Grid> {
  const idx = await loadNationalIndex();
  const factor = Math.max(1, Math.round(res / idx.res));
  const cells = (Math.ceil((2 * halfSize) / (idx.res * factor)) + 1) * factor;
  const c0 = Math.round((cx - halfSize - idx.x0) / idx.res);
  const r0 = Math.round((idx.y0 - (cy + halfSize)) / idx.res);
  const grid: Grid = {
    x0: idx.x0 + c0 * idx.res,
    y0: idx.y0 - r0 * idx.res,
    res: idx.res,
    cols: cells,
    rows: cells,
    data: new Float32Array(cells * cells),
  };

  const t = idx.tile;
  const tx0 = Math.max(0, Math.floor(c0 / t));
  const tx1 = Math.min(
    Math.ceil(idx.cols / t) - 1,
    Math.floor((c0 + cells - 1) / t),
  );
  const ty0 = Math.max(0, Math.floor(r0 / t));
  const ty1 = Math.min(
    Math.ceil(idx.rows / t) - 1,
    Math.floor((r0 + cells - 1) / t),
  );
  const jobs: Promise<void>[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(
        nationalTile(tx, ty, t).then((tile) => {
          if (!tile) return;
          const gr0 = Math.max(r0, ty * t);
          const gr1 = Math.min(r0 + cells, (ty + 1) * t);
          const gc0 = Math.max(c0, tx * t);
          const gc1 = Math.min(c0 + cells, (tx + 1) * t);
          for (let gr = gr0; gr < gr1; gr++) {
            const src = (gr - ty * t) * t - tx * t;
            const dst = (gr - r0) * cells - c0;
            for (let gc = gc0; gc < gc1; gc++)
              grid.data[dst + gc] = tile[src + gc] / 10;
          }
        }),
      );
    }
  }
  await Promise.all(jobs);
  return downsample(grid, factor, "max");
}

/**
 * Square sub-grid of `src` centred on (cx, cy), max-pooled to `res` (a multiple of
 * src.res). Lets one national read serve several extents without re-reading the file.
 */
export function cropGrid(
  src: Grid,
  cx: number,
  cy: number,
  halfSize: number,
  res: number,
): Grid {
  const factor = Math.max(1, Math.round(res / src.res));
  const cells = (Math.ceil((2 * halfSize) / (src.res * factor)) + 1) * factor;
  const c0 = Math.round((cx - halfSize - src.x0) / src.res);
  const r0 = Math.round((src.y0 - (cy + halfSize)) / src.res);
  const data = new Float32Array(cells * cells);
  for (let r = 0; r < cells; r++) {
    const sr = r0 + r;
    if (sr < 0 || sr >= src.rows) continue;
    for (let c = 0; c < cells; c++) {
      const sc = c0 + c;
      if (sc >= 0 && sc < src.cols)
        data[r * cells + c] = src.data[sr * src.cols + sc];
    }
  }
  const grid: Grid = {
    x0: src.x0 + c0 * src.res,
    y0: src.y0 - r0 * src.res,
    res: src.res,
    cols: cells,
    rows: cells,
    data,
  };
  return downsample(grid, factor, "max");
}
