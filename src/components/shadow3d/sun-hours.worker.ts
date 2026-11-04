/// <reference lib="webworker" />
/**
 * Runs the sun-hours sweep (lib/shadow/heatmap.ts) off the main thread:
 * ~250k cells × ~1,000 sun directions takes a couple of seconds.
 */

import { type SunBin, sunHoursLayers } from "@/lib/shadow/heatmap";
import type { Grid } from "@/lib/terrain/grid";

export interface SunHoursRequest {
  id: number;
  surface: Grid;
  /** Bare-terrain heights for the ground layer */
  ground: Float32Array;
  bins: SunBin[];
  convergence: number;
}

export type SunHoursMessage =
  | { id: number; type: "progress"; fraction: number }
  | { id: number; type: "done"; roof: Float32Array; ground: Float32Array };

self.onmessage = (e: MessageEvent<SunHoursRequest>) => {
  const { id, surface, ground, bins, convergence } = e.data;
  const layers = sunHoursLayers(
    surface,
    bins,
    convergence,
    ground,
    (fraction) =>
      self.postMessage({
        id,
        type: "progress",
        fraction,
      } satisfies SunHoursMessage),
  );
  const groundHours = layers.ground ?? layers.roof;
  self.postMessage(
    {
      id,
      type: "done",
      roof: layers.roof,
      ground: groundHours,
    } satisfies SunHoursMessage,
    [layers.roof.buffer, groundHours.buffer],
  );
};
