"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { SunPathDiagram } from "@/components/visualizations/SunPathDiagram";
import { getAnnualSunlight } from "@/lib/calculations/monthly";
import { getHorizonAtAzimuth } from "@/lib/calculations/shadow";
import { getSunPath } from "@/lib/calculations/sun";
import { HEAT_GRADIENT_CSS, heatPixels } from "@/lib/shadow/heat-colors";
import { sampleHours, sunBins, surfaceGrid } from "@/lib/shadow/heatmap";
import { obstructionProfile } from "@/lib/shadow/obstruction";
import {
  type BuiltScene,
  buildScene,
  disposeScene,
} from "@/lib/shadow/scene-geometry";
import {
  type Blocker,
  dayTimeline,
  dropOnto,
  evaluateSpot,
  farHorizon,
  type Spot,
  spotOrigin,
  type TimelineSlot,
} from "@/lib/shadow/sunlight";
import { fromIsn93 } from "@/lib/terrain/crs";
import type { Grid } from "@/lib/terrain/grid";
import type { SceneBuilding, SceneResponse } from "@/lib/terrain/scene-types";
import type { AnnualSunlight } from "@/types";
import { AddressSearch } from "./AddressSearch";
import ShadowScene from "./ShadowScene";
import type { SunHoursMessage, SunHoursRequest } from "./sun-hours.worker";

const SOLAR_DISC_MARGIN = 0.25;
const DEFAULT_CENTER = {
  lat: 64.14173,
  lng: -21.9266,
  label: "Hallgrímskirkja",
};
const RADII = [300, 500, 800];
const DAY_MS = 86_400_000;
/** Timeline resolution; matches dayTimeline()'s default step */
const STEP_MINUTES = 5;

interface Center {
  lat: number;
  lng: number;
  label: string;
}

function daysInYear(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
}

function dayOfYearNow(): number {
  const now = new Date();
  return (
    Math.floor(
      (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        Date.UTC(now.getUTCFullYear(), 0, 1)) /
        DAY_MS,
    ) + 1
  );
}

function fmtMinute(m: number): string {
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function fmtTime(d: Date | null): string {
  return d ? fmtMinute(d.getUTCHours() * 60 + d.getUTCMinutes()) : "—";
}

function fmtDuration(min: number): string {
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

const HEIGHT_SOURCE: Record<SceneBuilding["src"], string> = {
  h: "OSM height",
  r: "from Reykjavík registry floor count",
  l: "from OSM floor count",
  s: "estimated from the terrain surface model",
  d: "height estimated from building type",
};

function describe(b: Blocker): string {
  switch (b.kind) {
    case "none":
      return "In direct sunlight";
    case "night":
      return "Sun is below the horizon";
    case "building": {
      const h = b.building;
      if (!h) return `Shaded by a building ${Math.round(b.distance)} m away`;
      const how = HEIGHT_SOURCE[h.src];
      return `Shaded by a building ${Math.round(b.distance)} m away (${h.h} m, ${how})`;
    }
    case "terrain":
      return `Shaded by terrain ${Math.round(b.distance)} m away`;
    case "horizon":
      return `Sun is behind distant terrain ${b.distance.toFixed(1)} km away (peak ${Math.round(b.peakElevation)} m, horizon ${b.horizonAngle.toFixed(1)}°)`;
  }
}

const SLOT_COLORS: Record<TimelineSlot["kind"], string> = {
  none: "bg-amber-400",
  building: "bg-slate-500",
  terrain: "bg-emerald-700",
  horizon: "bg-indigo-500",
  night: "bg-slate-900",
};

function Timeline({
  slots,
  minute,
  onSeek,
}: {
  slots: TimelineSlot[];
  minute: number;
  onSeek: (m: number) => void;
}) {
  // Merge consecutive slots of the same kind into runs: a handful of divs, not 288
  const runs: { start: number; end: number; kind: TimelineSlot["kind"] }[] = [];
  for (const s of slots) {
    const last = runs[runs.length - 1];
    if (last && last.kind === s.kind) last.end = s.minute + STEP_MINUTES;
    else
      runs.push({
        start: s.minute,
        end: s.minute + STEP_MINUTES,
        kind: s.kind,
      });
  }

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(
      Math.min(
        1440 - STEP_MINUTES,
        Math.floor((f * 1440) / STEP_MINUTES) * STEP_MINUTES,
      ),
    );
  };
  const current = slots.find((s) => s.minute === minute);

  return (
    <div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Time of day"
        aria-valuemin={0}
        aria-valuemax={1440 - STEP_MINUTES}
        aria-valuenow={minute}
        aria-valuetext={`${fmtMinute(minute)}, ${current?.lit ? "sun" : (current?.kind ?? "")}`}
        className="relative h-6 cursor-pointer touch-none overflow-hidden rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            seekFromPointer(e);
        }}
        // Moves coalesce while a seek re-renders; land exactly where the pointer is released

        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            seekFromPointer(e);
        }}
        onKeyDown={(e) => {
          const delta =
            e.key === "ArrowRight"
              ? STEP_MINUTES
              : e.key === "ArrowLeft"
                ? -STEP_MINUTES
                : 0;
          if (!delta) return;
          e.preventDefault();
          onSeek((minute + delta + 1440) % 1440);
        }}
      >
        {runs.map((r) => (
          <div
            key={r.start}
            title={`${fmtMinute(r.start)}–${fmtMinute(r.end)} · ${r.kind === "none" ? "sun" : r.kind}`}
            className={`absolute top-0 h-full ${SLOT_COLORS[r.kind]}`}
            style={{
              left: `${(r.start / 1440) * 100}%`,
              width: `${((r.end - r.start) / 1440) * 100}%`,
            }}
          />
        ))}
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-white"
          style={{ left: `${(minute / 1440) * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
        <Legend color={SLOT_COLORS.none} label="Sun" />
        <Legend color={SLOT_COLORS.building} label="Building shade" />
        <Legend color={SLOT_COLORS.terrain} label="Nearby terrain" />
        <Legend color={SLOT_COLORS.horizon} label="Distant terrain" />
        <Legend color={SLOT_COLORS.night} label="Sun down" />
      </div>
    </div>
  );
}

function HeatmapControls({
  on,
  onToggle,
  progress,
  heat,
  spotHours,
}: {
  on: boolean;
  onToggle: () => void;
  progress: number | null;
  heat: HeatMap | null;
  spotHours: number | null;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Sun-hours heatmap</h2>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={onToggle}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            on
              ? "bg-amber-500 text-slate-900"
              : "bg-slate-800 text-slate-200 hover:bg-slate-700"
          }`}
        >
          {on ? "On" : "Off"}
        </button>
      </div>
      {on && progress !== null && (
        <div>
          <div className="h-1.5 overflow-hidden rounded bg-slate-800">
            <div
              className="h-full bg-amber-400"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Tracing a year of sun over every roof and street…{" "}
            {Math.round(progress * 100)}%
          </p>
        </div>
      )}
      {on && heat && progress === null && (
        <div>
          <div
            className="h-3 rounded"
            style={{ background: HEAT_GRADIENT_CSS }}
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>0 h</span>
            <span>{Math.round(heat.max / 2).toLocaleString("en-GB")} h</span>
            <span>{Math.round(heat.max).toLocaleString("en-GB")} h</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Direct sun per year on roofs and ground. Yellow = sun every hour it
            is above the horizon here; walls are not coloured.
            {spotHours !== null &&
              ` On the surface at the spot: about ${Math.round(spotHours).toLocaleString("en-GB")} h (2 m map; "Year at this spot" below is exact, at your chosen height).`}
          </p>
        </div>
      )}
    </section>
  );
}

const MONTH_LABELS = [
  "J",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
];

function AnnualPanel({ annual }: { annual: AnnualSunlight }) {
  const max = Math.max(...annual.months.map((m) => m.theoreticalHours), 1);
  const share = annual.theoreticalTotalHours
    ? (annual.totalHours / annual.theoreticalTotalHours) * 100
    : 0;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Year at this spot</h2>
        <span className="text-sm tabular-nums">
          {Math.round(annual.totalHours).toLocaleString("en-GB")} h direct sun
        </span>
      </div>
      <p className="text-xs text-slate-400">
        {share.toFixed(0)}% of the{" "}
        {Math.round(annual.theoreticalTotalHours).toLocaleString("en-GB")} h the
        sun is above the horizon, after shade from buildings and terrain.
      </p>
      <div
        className="flex h-20 items-end gap-1"
        role="img"
        aria-label="Direct sun hours per month"
      >
        {annual.months.map((m, i) => (
          <div
            key={m.month}
            className="relative flex h-full flex-1 flex-col justify-end"
            title={`${m.monthName}: ${Math.round(m.totalHours)} of ${Math.round(m.theoreticalHours)} h`}
          >
            <div
              className="absolute bottom-0 w-full rounded-sm bg-slate-700"
              style={{ height: `${(m.theoreticalHours / max) * 100}%` }}
            />
            <div
              className="relative w-full rounded-sm bg-amber-400"
              style={{ height: `${(m.totalHours / max) * 100}%` }}
            />
            <span className="absolute -bottom-4 w-full text-center text-[10px] text-slate-400">
              {MONTH_LABELS[i]}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-3 text-[11px] text-slate-300">
        <Legend color="bg-amber-400" label="Direct sun" />
        <Legend color="bg-slate-700" label="Sun above horizon" />
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

interface InitialState {
  center: Center;
  year: number;
  dayOfYear: number;
  minute: number;
  heat: boolean;
}

interface HeatMap {
  /** Scene + year it was computed for */
  key: string;
  surface: Grid;
  /** Hours on roofs (casting surface) and on bare ground, per cell of `surface` */
  roof: Float32Array;
  ground: Float32Array;
  /** Hours the sun is above the (distant-terrain) horizon: 100% of the scale */
  max: number;
  textures: { roof: THREE.DataTexture; ground: THREE.DataTexture };
}

function heatTexture(
  hours: Float32Array,
  max: number,
  grid: Grid,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    heatPixels(hours, max),
    grid.cols,
    grid.rows,
    THREE.RGBAFormat,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Initial view from ?lat=&lng=&d=YYYY-MM-DD&t=HH:MM, falling back to now at Hallgrímskirkja */
function initialState(): InitialState {
  const p = new URLSearchParams(window.location.search);
  const now = new Date();
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  const center =
    p.has("lat") && p.has("lng") && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng, label: p.get("label")?.slice(0, 80) || "Shared spot" }
      : DEFAULT_CENTER;

  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.get("d") ?? "");
  const year = d ? Number(d[1]) : now.getUTCFullYear();
  const dayOfYear = d
    ? Math.floor(
        (Date.UTC(year, Number(d[2]) - 1, Number(d[3])) -
          Date.UTC(year, 0, 1)) /
          DAY_MS,
      ) + 1
    : dayOfYearNow();

  const t = /^(\d{1,2}):(\d{2})$/.exec(p.get("t") ?? "");
  const rawMinute = t
    ? Number(t[1]) * 60 + Number(t[2])
    : now.getUTCHours() * 60 + now.getUTCMinutes();
  const minute = Math.min(1435, Math.floor(rawMinute / 5) * 5);

  return {
    center,
    year,
    dayOfYear: Math.min(daysInYear(year), Math.max(1, dayOfYear)),
    minute,
    heat: p.get("heat") === "1",
  };
}

export default function ShadowExplorer() {
  const [initial] = useState(initialState);
  const [center, setCenter] = useState<Center>(initial.center);
  const [radius, setRadius] = useState(500);
  const [scene, setScene] = useState<BuiltScene | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [heightOffset, setHeightOffset] = useState(1.5);
  const year = initial.year;
  const [dayOfYear, setDayOfYear] = useState(initial.dayOfYear);
  const [minute, setMinute] = useState(initial.minute);
  const [playing, setPlaying] = useState(false);
  const [heatOn, setHeatOn] = useState(initial.heat);
  const [heat, setHeat] = useState<HeatMap | null>(null);
  const [heatProgress, setHeatProgress] = useState<number | null>(null);

  // Keep the URL shareable (skipped while playing to avoid spamming history state)
  useEffect(() => {
    if (playing) return;
    const day = new Date(Date.UTC(year, 0, dayOfYear));
    const params = new URLSearchParams({
      lat: center.lat.toFixed(6),
      lng: center.lng.toFixed(6),
      d: day.toISOString().slice(0, 10),
      t: fmtMinute(minute),
      label: center.label,
    });
    if (heatOn) params.set("heat", "1");
    window.history.replaceState(null, "", `?${params}`);
  }, [center, year, dayOfYear, minute, playing, heatOn]);

  // Load scene
  useEffect(() => {
    let cancelled = false;
    let built: BuiltScene | null = null;
    setLoading(true);
    setError(null);
    fetch(`/api/scene?lat=${center.lat}&lng=${center.lng}&radius=${radius}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail ?? j.error ?? `HTTP ${r.status}`);
        return j as SceneResponse;
      })
      .then((data) => {
        if (cancelled) return;
        built = buildScene(data);
        setScene(built);
        setSpot(dropOnto(built, 0, 0));
      })
      .catch(
        (e: unknown) =>
          !cancelled && setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      if (built) disposeScene(built);
    };
  }, [center, radius]);

  // Play: advance 5 minutes every 60 ms (a day in ~17 s)
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setMinute((m) => (m + 5) % 1440), 60);
    return () => clearInterval(id);
  }, [playing]);

  const dayStartUtc = Date.UTC(year, 0, 1) + (dayOfYear - 1) * DAY_MS;
  const date = useMemo(
    () => new Date(dayStartUtc + minute * 60_000),
    [dayStartUtc, minute],
  );

  const origin = useMemo(
    () => (spot ? spotOrigin(spot, heightOffset) : null),
    [spot, heightOffset],
  );
  const horizon = useMemo(
    () => (scene && origin ? farHorizon(scene, origin) : null),
    [scene, origin],
  );
  const centerHorizon = useMemo(() => {
    if (!scene) return null;
    // Ground at the centre, not whatever roof happens to be there
    const c = dropOnto({ ...scene, buildingsBvh: null }, 0, 0);
    return c ? farHorizon(scene, spotOrigin(c, 1.5)) : null;
  }, [scene]);

  const sunlight = useMemo(
    () =>
      scene && origin && horizon
        ? evaluateSpot(scene, origin, horizon, date)
        : null,
    [scene, origin, horizon, date],
  );
  const timeline = useMemo(
    () =>
      scene && origin && horizon
        ? dayTimeline(scene, origin, horizon, dayStartUtc)
        : null,
    [scene, origin, horizon, dayStartUtc],
  );
  const sunPath = useMemo(
    () =>
      getSunPath(
        center.lat,
        center.lng,
        new Date(dayStartUtc + 12 * 3_600_000),
        10,
      ),
    [center, dayStartUtc],
  );
  // Same obstruction profile (buildings + terrain) the /api/analyze report uses
  const obstruction = useMemo(
    () => (scene && origin ? obstructionProfile(scene, origin) : null),
    [scene, origin],
  );
  const annual = useMemo(
    () =>
      scene && obstruction
        ? getAnnualSunlight(
            scene.data.center.lat,
            scene.data.center.lng,
            obstruction,
            year,
          )
        : null,
    [scene, obstruction, year],
  );
  // Annual sun-hours heatmap: computed in a worker on demand, cached per scene + year
  const heatKey = scene
    ? `${scene.data.center.lat},${scene.data.center.lng},${scene.data.radius},${year}`
    : null;
  useEffect(() => {
    if (
      !heatOn ||
      !scene ||
      !centerHorizon ||
      !heatKey ||
      heat?.key === heatKey
    )
      return;
    const { lat, lng } = scene.data.center;
    // Distant terrain from the centre decides which sun directions reach the scene
    const bins = sunBins(lat, lng, year, centerHorizon);
    const max = bins.reduce((sum, b) => sum + b.hours, 0);
    const surface = surfaceGrid(scene.nearGrid, scene.buildingList);
    const worker = new Worker(
      new URL("./sun-hours.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    setHeatProgress(0);
    worker.onmessage = (e: MessageEvent<SunHoursMessage>) => {
      if (e.data.type === "progress") {
        setHeatProgress(e.data.fraction);
        return;
      }
      const { roof, ground } = e.data;
      setHeat({
        key: heatKey,
        surface,
        roof,
        ground,
        max,
        textures: {
          roof: heatTexture(roof, max, surface),
          ground: heatTexture(ground, max, surface),
        },
      });
      setHeatProgress(null);
      worker.terminate();
    };
    worker.onerror = (err) => {
      console.error("Heatmap worker failed:", err);
      setHeatProgress(null);
      worker.terminate();
    };
    worker.postMessage({
      id: 1,
      surface,
      // Bare terrain: ground beside walls is coloured as ground, not roof
      ground: scene.nearGrid.data,
      bins,
      convergence: scene.data.convergence,
    } satisfies SunHoursRequest);
    return () => worker.terminate();
  }, [heatOn, scene, centerHorizon, heatKey, heat?.key, year]);
  // Free the GPU texture when a heatmap is replaced or the explorer unmounts
  useEffect(
    () => () => {
      heat?.textures.roof.dispose();
      heat?.textures.ground.dispose();
    },
    [heat],
  );

  const heatAtSpot =
    heat && heat.key === heatKey && spot
      ? sampleHours(
          heat.surface,
          spot.surface === "roof" ? heat.roof : heat.ground,
          spot.point.x,
          -spot.point.z,
        )
      : null;

  const sceneShadedByHorizon =
    !!sunlight &&
    !!centerHorizon &&
    sunlight.altitude > 0 &&
    sunlight.altitude - getHorizonAtAzimuth(centerHorizon, sunlight.azimuth) <
      SOLAR_DISC_MARGIN;

  const spotLatLng =
    scene && spot
      ? fromIsn93(
          scene.data.center.x + spot.point.x,
          scene.data.center.y - spot.point.z,
        )
      : null;
  const spotOffCentre =
    scene && spot
      ? Math.hypot(spot.point.x, spot.point.z) > scene.data.radius * 0.5
      : false;

  const firstSun = timeline?.slots.find((s) => s.lit);
  const lastSun = timeline
    ? [...timeline.slots].reverse().find((s) => s.lit)
    : undefined;

  const setDate = (month: number, day: number) =>
    setDayOfYear(
      Math.floor((Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / DAY_MS) +
        1,
    );

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100">
      <aside className="flex w-96 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-800 p-5">
        <header>
          <h1 className="text-lg font-semibold">Shadow explorer</h1>
          <p className="text-xs text-slate-400">
            Search an address, then click anywhere in the 3D view (ground or
            roof) to move the spot.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <AddressSearch onSelect={setCenter} />
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="truncate">{center.label}</span>
            <select
              className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r * 2} m area
                </option>
              ))}
            </select>
          </div>
          {spotOffCentre && spotLatLng && (
            <button
              type="button"
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
              onClick={() => setCenter({ ...spotLatLng, label: "Picked spot" })}
            >
              Re-centre scene on spot
            </button>
          )}
        </section>

        <HeatmapControls
          on={heatOn}
          onToggle={() => setHeatOn((v) => !v)}
          progress={heatProgress}
          heat={heat}
          spotHours={heatAtSpot}
        />

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="doy" className="text-sm font-medium">
              Date
            </label>
            <span className="text-sm tabular-nums">
              {new Date(dayStartUtc).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              })}
            </span>
          </div>
          <input
            id="doy"
            type="range"
            min={1}
            max={daysInYear(year)}
            value={dayOfYear}
            onChange={(e) => setDayOfYear(Number(e.target.value))}
          />
          <div className="flex gap-1 text-[11px]">
            <Preset onClick={() => setDate(11, 21)}>Winter solstice</Preset>
            <Preset onClick={() => setDate(2, 20)}>Equinox</Preset>
            <Preset onClick={() => setDate(5, 21)}>Summer solstice</Preset>
            <Preset onClick={() => setDayOfYear(dayOfYearNow())}>Today</Preset>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="tod" className="text-sm font-medium">
              Time{" "}
              <span className="text-xs font-normal text-slate-400">
                (Iceland, UTC)
              </span>
            </label>
            <span className="text-sm tabular-nums">{fmtMinute(minute)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-16 rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-amber-400"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              id="tod"
              className="flex-1"
              type="range"
              min={0}
              max={1435}
              step={5}
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
            />
          </div>
          {timeline && (
            <Timeline
              slots={timeline.slots}
              minute={minute}
              onSeek={setMinute}
            />
          )}
        </section>

        <section className="flex flex-col gap-2">
          <label
            htmlFor="height"
            className="flex items-baseline justify-between text-sm font-medium"
          >
            Height above surface{" "}
            <span className="text-sm tabular-nums">
              {heightOffset.toFixed(1)} m
            </span>
          </label>
          <input
            id="height"
            type="range"
            min={0}
            max={30}
            step={0.5}
            value={heightOffset}
            onChange={(e) => setHeightOffset(Number(e.target.value))}
          />
        </section>

        {sunlight && (
          <section
            className={`rounded-lg p-3 text-sm ${sunlight.lit ? "bg-amber-500/15 ring-1 ring-amber-500/40" : "bg-slate-800"}`}
          >
            <div className="font-semibold">
              {sunlight.lit ? "☀️ Sun" : "🌥 Shade"}
            </div>
            <div className="text-slate-300">{describe(sunlight.blocker)}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-400">
              <dt>Sun altitude</dt>
              <dd className="tabular-nums text-slate-200">
                {sunlight.altitude.toFixed(1)}°
              </dd>
              <dt>Sun azimuth</dt>
              <dd className="tabular-nums text-slate-200">
                {sunlight.azimuth.toFixed(0)}°
              </dd>
              <dt>Sunrise / sunset</dt>
              <dd className="tabular-nums text-slate-200">
                {fmtTime(sunPath.sunrise)} / {fmtTime(sunPath.sunset)}
              </dd>
              {timeline && (
                <>
                  <dt>Direct sun at spot</dt>
                  <dd className="tabular-nums text-slate-200">
                    {fmtDuration(timeline.sunMinutes)}
                  </dd>
                  <dt>First / last sun</dt>
                  <dd className="tabular-nums text-slate-200">
                    {firstSun ? fmtMinute(firstSun.minute) : "—"} /{" "}
                    {lastSun ? fmtMinute(lastSun.minute + 5) : "—"}
                  </dd>
                </>
              )}
              {spot && (
                <>
                  <dt>Spot</dt>
                  <dd className="text-slate-200">
                    {spot.surface},{" "}
                    {Math.round((spot.point.y + (scene?.yRef ?? 0)) * 10) / 10}{" "}
                    m a.s.l.
                  </dd>
                </>
              )}
              {spotLatLng && (
                <>
                  <dt>Coordinates</dt>
                  <dd className="tabular-nums text-slate-200">
                    {spotLatLng.lat.toFixed(5)}, {spotLatLng.lng.toFixed(5)}
                  </dd>
                </>
              )}
            </dl>
          </section>
        )}

        {annual && <AnnualPanel annual={annual} />}

        {obstruction && (
          <section className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">
              Sun path and blocked sky{" "}
              <span className="text-xs font-normal text-slate-400">
                (this date)
              </span>
            </h2>
            <div className="rounded-lg bg-white p-2 [&>svg]:h-auto [&>svg]:w-full">
              <SunPathDiagram sunPath={sunPath} horizonProfile={obstruction} />
            </div>
          </section>
        )}

        {scene && (
          <footer className="mt-auto text-[10px] leading-relaxed text-slate-500">
            {scene.data.attribution.map((a) => (
              <div key={a}>{a}</div>
            ))}
            <div>
              {scene.buildingList.filter((b) => b.src === "d").length} of{" "}
              {scene.buildingList.length} building heights here are estimated
              from building type.
            </div>
          </footer>
        )}
      </aside>

      <main className="relative h-full min-w-0 flex-1">
        {scene && spot && origin && sunlight && (
          <ShadowScene
            key={`${scene.data.center.lat},${scene.data.center.lng},${scene.data.radius}`}
            scene={scene}
            spot={spot}
            origin={origin}
            sunlight={sunlight}
            sceneShadedByHorizon={sceneShadedByHorizon}
            onPick={setSpot}
            heat={heatOn && heat && heat.key === heatKey ? heat.textures : null}
          />
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-sm">
            <div className="max-w-sm text-center">
              Loading terrain and buildings…
              <div className="mt-1 text-xs text-slate-400">
                The first visit to an area fetches buildings from OpenStreetMap,
                which can take up to a minute. After that it is cached.
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-x-0 top-4 mx-auto w-fit max-w-xl rounded-md bg-red-900/80 px-4 py-2 text-sm">
            {error}
          </div>
        )}
        {!error && !loading && scene?.data.warnings?.length ? (
          <div className="absolute inset-x-0 top-4 mx-auto flex w-fit max-w-xl items-center gap-3 rounded-md bg-amber-900/85 px-4 py-2 text-sm">
            <span>{scene.data.warnings.join(" ")}</span>
            <button
              type="button"
              className="shrink-0 rounded bg-amber-700 px-2 py-0.5 text-xs hover:bg-amber-600"
              onClick={() => setCenter((c) => ({ ...c }))}
            >
              Retry
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Preset({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
