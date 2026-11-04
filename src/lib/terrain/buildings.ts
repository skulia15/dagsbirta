/**
 * Building footprints + heights, fetched on demand and cached on disk in 1 km tiles.
 *
 * Sources, in order of height precedence:
 *   1. OSM `height` tag (incl. building:part, e.g. Hallgrímskirkja's tower)
 *   2. Reykjavík LUKR open data (no login): footprints (Husflakar) joined to
 *      property units (Gerd_fasteignar_fj_herbergja) by LANDNR+MHLNR; the highest
 *      residential unit floor (HAED) gives the storey count. Only buildings with
 *      residential units are trusted: a commercial tower is often registered as a
 *      single unit on floor 01. Reykjavík municipality only.
 *   3. OSM `building:levels`
 *   4. Default by OSM building type
 *
 * LUKR terms: free to copy and use; notify usk_lukr@reykjavik.is what was taken.
 *
 * Cache: disk (data/buildings/) locally, Vercel Runtime Cache in deployments.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCache } from "@vercel/functions";
import { fromIsn93, toIsn93 } from "./crs";

export interface Building {
  id: string;
  /** Height above ground in metres */
  h: number;
  /** Building parts: height above ground where the part starts (e.g. a tower on a nave) */
  mh?: number;
  /** h = OSM height tag, r = LUKR registry floors, l = OSM building:levels, d = type default */
  src: "h" | "r" | "l" | "d";
  /** Flat [x0, y0, x1, y1, ...] ISN93 outer ring, not closed */
  ring: number[];
}

const TILE = 1000;
// Bump the version when building processing changes, to invalidate cached tiles
const CACHE_DIR = path.join(process.cwd(), "data", "buildings", "cache-v2");
const STOREY_HEIGHT = 3;
const ROOF_ALLOWANCE = 1;
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const LUKR = "https://lukrgatt.reykjavik.is/server/rest/services/OpinGognHus";
const USER_AGENT = "dagsbirta-dev";

// ---------- geometry helpers ----------

function centroid(ring: number[]): [number, number] {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < ring.length; i += 2) {
    sx += ring[i];
    sy += ring[i + 1];
  }
  return [(sx * 2) / ring.length, (sy * 2) / ring.length];
}

function pointInRing(x: number, y: number, ring: number[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Bucket index over ring centroids for point-in-polygon lookups */
function bucketIndex<T extends { ring: number[] }>(items: T[], size = 200) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const [cx, cy] = centroid(it.ring);
    const key = `${Math.floor(cx / size)},${Math.floor(cy / size)}`;
    const list = map.get(key);
    if (list) list.push(it);
    else map.set(key, [it]);
  }
  return (x: number, y: number): T | null => {
    const bx = Math.floor(x / size);
    const by = Math.floor(y / size);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const it of map.get(`${bx + dx},${by + dy}`) ?? []) {
          if (pointInRing(x, y, it.ring)) return it;
        }
      }
    }
    return null;
  };
}

// ---------- OSM ----------

type LatLon = { lat: number; lon: number };

interface OsmElement {
  type: "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: LatLon[];
  members?: { type: string; role: string; geometry?: LatLon[] }[];
}

const TYPE_DEFAULTS: Record<string, number> = {
  garage: 3,
  garages: 3,
  shed: 2.5,
  carport: 2.5,
  hut: 3,
  cabin: 4,
  kiosk: 3,
  roof: 4,
  house: 6.5,
  detached: 6.5,
  semidetached_house: 6.5,
  terrace: 7,
  bungalow: 5,
  residential: 7,
  apartments: 12,
  dormitory: 12,
  commercial: 10,
  retail: 8,
  office: 12,
  supermarket: 7,
  industrial: 8,
  warehouse: 8,
  service: 4,
  farm_auxiliary: 6,
  barn: 7,
  church: 14,
  cathedral: 20,
  chapel: 7,
  school: 9,
  university: 12,
  kindergarten: 4,
  hospital: 15,
  hotel: 15,
  public: 10,
  civic: 10,
  government: 12,
  sports_hall: 10,
  stadium: 15,
};

function parseNum(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function osmHeight(tags: Record<string, string>): {
  h: number;
  src: Building["src"];
} {
  const h = parseNum(tags.height);
  if (h) return { h, src: "h" };
  const levels = parseNum(tags["building:levels"]);
  if (levels) {
    const roof = parseNum(tags["roof:levels"]) ?? 0;
    return {
      h: levels * STOREY_HEIGHT + roof * 1.5 + ROOF_ALLOWANCE,
      src: "l",
    };
  }
  return { h: TYPE_DEFAULTS[tags.building] ?? 6, src: "d" };
}

function osmMinHeight(tags: Record<string, string>): number {
  const mh = parseNum(tags.min_height);
  if (mh) return mh;
  const ml = parseNum(tags["building:min_level"]);
  return ml ? ml * STOREY_HEIGHT : 0;
}

function toRing(geometry: LatLon[] | undefined): number[] | null {
  if (!geometry || geometry.length < 4) return null;
  const ring: number[] = [];
  for (const { lat, lon } of geometry) {
    const [x, y] = toIsn93(lat, lon);
    ring.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }
  const n = ring.length;
  if (ring[0] === ring[n - 2] && ring[1] === ring[n - 1]) ring.length = n - 2;
  return ring.length >= 6 ? ring : null;
}

async function fetchOsm(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<OsmElement[]> {
  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:90];(way["building"](${bbox});relation["building"](${bbox});way["building:part"](${bbox});relation["building:part"](${bbox}););out body geom;`;
  // Public Overpass mirrors are often slow or overloaded: race them, keep the first good answer
  const controllers = OVERPASS.map(() => new AbortController());
  try {
    return await Promise.any(
      OVERPASS.map(async (url, i) => {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.any([
            controllers[i].signal,
            AbortSignal.timeout(120_000),
          ]),
        });
        if (!res.ok) throw new Error(`${url} ${res.status}`);
        const json = (await res.json()) as {
          elements?: OsmElement[];
          remark?: string;
        };
        if (!Array.isArray(json.elements))
          throw new Error(`${url}: no elements`);
        // Overloaded servers answer 200 with partial (often empty) results and a
        // remark like "runtime error: Query timed out"; caching that would hide
        // buildings permanently
        if (json.remark && /error|timed out|out of memory/i.test(json.remark))
          throw new Error(`${url}: ${json.remark}`);
        // First good answer wins; cancel the slower mirrors
        for (const [j, c] of controllers.entries()) if (j !== i) c.abort();
        return json.elements;
      }),
    );
  } catch (err) {
    const reasons =
      err instanceof AggregateError ? err.errors.join("; ") : String(err);
    throw new Error(`All Overpass endpoints failed: ${reasons}`);
  }
}

function osmToBuildings(elements: OsmElement[]): Building[] {
  const outlines: Building[] = [];
  const parts: Building[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const isPart = !!tags["building:part"] && tags["building:part"] !== "no";
    const isOutline = !!tags.building && tags.building !== "no";
    if (!isPart && !isOutline) continue;
    const rings =
      el.type === "way"
        ? [toRing(el.geometry)]
        : (el.members ?? [])
            .filter((m) => m.type === "way" && m.role === "outer")
            .map((m) => toRing(m.geometry));
    for (const ring of rings) {
      if (!ring) continue;
      const { h, src } = osmHeight(tags);
      const mh = isPart ? Math.min(osmMinHeight(tags), h) : 0;
      const b: Building = {
        id: `${el.type[0]}${el.id}`,
        h: Math.round(h * 10) / 10,
        src,
        ring,
      };
      if (mh > 0) b.mh = Math.round(mh * 10) / 10;
      // A way tagged both building and building:part counts as a part
      (isPart ? parts : outlines).push(b);
    }
  }
  // Simple 3D Buildings: an outline with parts inside is replaced by its parts
  const findOutline = bucketIndex(outlines);
  const replaced = new Set<Building>();
  for (const p of parts) {
    const [px, py] = centroid(p.ring);
    const o = findOutline(px, py);
    if (o) replaced.add(o);
  }
  return [...outlines.filter((o) => !replaced.has(o)), ...parts];
}

// ---------- LUKR (Reykjavík) ----------

export interface LukrFootprint {
  key: string;
  ring: number[];
  floors: number;
}

type ArcgisFeature<A> = {
  attributes: A;
  geometry?: { rings: number[][][] };
};

async function arcgisQuery<A>(
  layer: string,
  params: Record<string, string>,
): Promise<ArcgisFeature<A>[]> {
  const out: ArcgisFeature<A>[] = [];
  for (let offset = 0; ; ) {
    const qs = new URLSearchParams({
      f: "json",
      resultOffset: String(offset),
      ...params,
    });
    const res = await fetch(`${LUKR}/${layer}/FeatureServer/0/query?${qs}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`LUKR ${layer} ${res.status}`);
    const json = (await res.json()) as {
      features?: ArcgisFeature<A>[];
      exceededTransferLimit?: boolean;
      error?: unknown;
    };
    if (json.error) {
      throw new Error(`LUKR ${layer}: ${JSON.stringify(json.error)}`);
    }
    const features = json.features ?? [];
    out.push(...features);
    if (!json.exceededTransferLimit || features.length === 0) return out;
    offset += features.length;
  }
}

/** Unit usage texts (free text in the registry) whose floor numbers are reliable */
export const RESIDENTIAL =
  /íbúð|einbýli|raðhús|parhús|fjölbýli|tvíbýli|þríbýli/i;

/** Storey from a LUKR HAED code: "01".."40" are floors; letter codes are ambiguous and ignored. */
export function floorFromHaed(haed: string | null): number | null {
  if (!haed || !/^\d{2}$/.test(haed)) return null;
  const n = Number(haed);
  return n >= 1 && n <= 40 ? n : null;
}

async function fetchLukr(
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): Promise<LukrFootprint[]> {
  const envelope = (pad: number) => ({
    geometry: `${xmin - pad},${ymin - pad},${xmax + pad},${ymax + pad}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "3057",
    spatialRel: "esriSpatialRelIntersects",
  });
  const [footprints, units] = await Promise.all([
    arcgisQuery<{ LANDNR: number; MHLNR: string }>("Husflakar", {
      ...envelope(0),
      outFields: "LANDNR,MHLNR",
      outSR: "3057",
      returnGeometry: "true",
    }),
    // Unit points can sit a little outside their footprint's block
    arcgisQuery<{
      LANDNR: number;
      MHLNR: string;
      HAED: string | null;
      NOTKTEXTI: string | null;
    }>("Gerd_fasteignar_fj_herbergja", {
      ...envelope(150),
      outFields: "LANDNR,MHLNR,HAED,NOTKTEXTI",
      returnGeometry: "false",
    }),
  ]);

  const floors = new Map<string, number>();
  for (const u of units) {
    if (!RESIDENTIAL.test(u.attributes.NOTKTEXTI ?? "")) continue;
    const f = floorFromHaed(u.attributes.HAED);
    if (!f) continue;
    const key = `${u.attributes.LANDNR}-${u.attributes.MHLNR}`;
    floors.set(key, Math.max(floors.get(key) ?? 0, f));
  }

  const result: LukrFootprint[] = [];
  for (const fp of footprints) {
    const key = `${fp.attributes.LANDNR}-${fp.attributes.MHLNR}`;
    const n = floors.get(key);
    const outer = fp.geometry?.rings?.[0];
    if (!n || !outer || outer.length < 4) continue;
    const ring = outer
      .slice(0, -1)
      .flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    result.push({ key, ring, floors: n });
  }
  return result;
}

/** Apply LUKR storey counts to OSM buildings; add registry buildings missing from OSM. */
export function mergeLukr(osm: Building[], lukr: LukrFootprint[]): Building[] {
  if (lukr.length === 0) return osm;
  const findLukr = bucketIndex(lukr);
  const matched = new Set<LukrFootprint>();
  for (const b of osm) {
    if (b.src === "h" || b.mh) continue;
    const [cx, cy] = centroid(b.ring);
    const fp = findLukr(cx, cy);
    if (!fp) continue;
    matched.add(fp);
    const registry = fp.floors * STOREY_HEIGHT + ROOF_ALLOWANCE;
    // Registry counts the top residential floor; an explicit OSM floor count can be higher
    // (e.g. offices above flats), so never lower an OSM `building:levels` height
    if (b.src === "l" && b.h > registry) continue;
    b.h = registry;
    b.src = "r";
  }
  const findOsm = bucketIndex(osm);
  const added: Building[] = [];
  for (const fp of lukr) {
    if (matched.has(fp)) continue;
    const [cx, cy] = centroid(fp.ring);
    if (findOsm(cx, cy)) continue;
    added.push({
      id: `lukr-${fp.key}`,
      h: fp.floors * STOREY_HEIGHT + ROOF_ALLOWANCE,
      src: "r",
      ring: fp.ring,
    });
  }
  return [...osm, ...added];
}

// ---------- tile cache ----------

/** Tiles are refetched after this, so OSM edits eventually show up */
const TILE_TTL_SECONDS = 30 * 24 * 3600;
const MEMORY_TILES = 200;

interface TileStore {
  read(key: string): Promise<Building[] | null>;
  write(key: string, buildings: Building[]): Promise<void>;
}

/** Local dev: JSON files under data/buildings (gitignored) */
const diskStore: TileStore = {
  async read(key) {
    try {
      return JSON.parse(
        await readFile(path.join(CACHE_DIR, `${key}.json`), "utf8"),
      ) as Building[];
    } catch {
      return null;
    }
  },
  async write(key, buildings) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(
      path.join(CACHE_DIR, `${key}.json`),
      JSON.stringify(buildings),
    );
  },
};

/**
 * Vercel: the filesystem is read-only, so use the regional Runtime Cache, with
 * the instance's memory in front of it. A cache outage only costs a refetch.
 */
function runtimeStore(): TileStore {
  const cache = getCache({ namespace: path.basename(CACHE_DIR) });
  const memory = new Map<string, Building[]>();
  const remember = (key: string, v: Building[]) => {
    memory.delete(key);
    memory.set(key, v);
    // ~250 KB per dense tile; keep the instance's memory bounded
    if (memory.size > MEMORY_TILES)
      memory.delete(memory.keys().next().value as string);
  };
  return {
    async read(key) {
      const hit = memory.get(key);
      if (hit) return hit;
      try {
        const v = (await cache.get(key)) as Building[] | null | undefined;
        if (v) remember(key, v);
        return v ?? null;
      } catch (err) {
        console.warn("Runtime Cache read failed:", err);
        return null;
      }
    },
    async write(key, buildings) {
      remember(key, buildings);
      try {
        await cache.set(key, buildings, {
          ttl: TILE_TTL_SECONDS,
          tags: ["buildings"],
          name: "building-tile",
        });
      } catch (err) {
        console.warn("Runtime Cache write failed:", err);
      }
    },
  };
}

const store: TileStore = process.env.VERCEL ? runtimeStore() : diskStore;

function readTile(tx: number, ty: number): Promise<Building[] | null> {
  return store.read(`${tx}_${ty}`);
}

interface FillResult {
  tiles: Map<string, Building[]>;
  /** Set when OSM could not be fetched; results are partial and not cached */
  warning?: string;
}

/**
 * Fetch a block of missing tiles in one Overpass + LUKR round. Complete results are
 * cached on disk. If OSM is unavailable, LUKR footprints (Reykjavík only) are
 * returned without caching, so the next request retries OSM.
 */
async function fillTiles(missing: [number, number][]): Promise<FillResult> {
  const txs = missing.map(([tx]) => tx);
  const tys = missing.map(([, ty]) => ty);
  const xmin = Math.min(...txs) * TILE;
  const ymin = Math.min(...tys) * TILE;
  const xmax = (Math.max(...txs) + 1) * TILE;
  const ymax = (Math.max(...tys) + 1) * TILE;

  const corners = [
    fromIsn93(xmin, ymin),
    fromIsn93(xmin, ymax),
    fromIsn93(xmax, ymin),
    fromIsn93(xmax, ymax),
  ];
  const [osm, lukr] = await Promise.all([
    fetchOsm(
      Math.min(...corners.map((c) => c.lat)),
      Math.min(...corners.map((c) => c.lng)),
      Math.max(...corners.map((c) => c.lat)),
      Math.max(...corners.map((c) => c.lng)),
    ).then(
      (elements) => ({ elements, error: null }),
      (error: unknown) => ({ elements: null, error }),
    ),
    // LUKR only covers Reykjavík (elsewhere it returns nothing); a failure must not
    // block OSM buildings, but it must not be cached either
    fetchLukr(xmin, ymin, xmax, ymax).then(
      (footprints) => ({ footprints, failed: false }),
      (err: unknown) => {
        console.warn("LUKR fetch failed, using OSM heights only:", err);
        return { footprints: [] as LukrFootprint[], failed: true };
      },
    ),
  ]);
  if (osm.error) console.warn("OSM fetch failed:", osm.error);
  const buildings = mergeLukr(
    osm.elements ? osmToBuildings(osm.elements) : [],
    lukr.footprints,
  );

  const tiles = new Map<string, Building[]>(
    missing.map(([tx, ty]) => [`${tx}_${ty}`, []]),
  );
  for (const b of buildings) {
    const [cx, cy] = centroid(b.ring);
    tiles.get(`${Math.floor(cx / TILE)}_${Math.floor(cy / TILE)}`)?.push(b);
  }

  if (!osm.elements) {
    return {
      tiles,
      warning:
        lukr.footprints.length > 0
          ? "OpenStreetMap is not responding, so only Reykjavík registry buildings are shown. Try again in a minute."
          : "OpenStreetMap is not responding, so buildings are missing. Try again in a minute.",
    };
  }
  if (lukr.failed) {
    return {
      tiles,
      warning:
        "Reykjavík's building registry is not responding, so some heights are estimates. Try again in a minute.",
    };
  }
  await Promise.all(
    missing.map(([tx, ty]) =>
      store.write(`${tx}_${ty}`, tiles.get(`${tx}_${ty}`) ?? []),
    ),
  );
  return { tiles };
}

const inflightFills = new Map<string, Promise<FillResult>>();

/**
 * Buildings whose centroid falls inside the square of half-size `halfSize` around
 * ISN93 (x, y). `warning` is set when the result is partial.
 */
export async function buildingsNear(
  x: number,
  y: number,
  halfSize: number,
): Promise<{ buildings: Building[]; warning?: string }> {
  const tx0 = Math.floor((x - halfSize) / TILE);
  const tx1 = Math.floor((x + halfSize) / TILE);
  const ty0 = Math.floor((y - halfSize) / TILE);
  const ty1 = Math.floor((y + halfSize) / TILE);

  const coords: [number, number][] = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) coords.push([tx, ty]);
  }

  const tiles = await Promise.all(coords.map(([tx, ty]) => readTile(tx, ty)));
  const missing = coords.filter((_, i) => tiles[i] === null);
  let warning: string | undefined;
  if (missing.length) {
    const key = missing.map(([a, b]) => `${a}_${b}`).join(",");
    let job = inflightFills.get(key);
    if (!job) {
      job = fillTiles(missing).finally(() => inflightFills.delete(key));
      inflightFills.set(key, job);
    }
    const filled = await job;
    warning = filled.warning;
    coords.forEach(([tx, ty], i) => {
      tiles[i] ??= filled.tiles.get(`${tx}_${ty}`) ?? [];
    });
  }

  const buildings: Building[] = [];
  for (const list of tiles) {
    for (const b of list ?? []) {
      const [cx, cy] = centroid(b.ring);
      if (Math.abs(cx - x) <= halfSize && Math.abs(cy - y) <= halfSize) {
        buildings.push(b);
      }
    }
  }
  return { buildings, warning };
}
