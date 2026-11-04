/**
 * Colour scale for sun-hours maps: deep indigo (little direct sun) through magenta
 * and orange to yellow (sun whenever it is above the horizon). Monotonic in
 * lightness, so it also reads in greyscale and for most colour-vision deficiencies.
 */

const STOPS: [number, [number, number, number]][] = [
  [0, [29, 27, 79]],
  [0.25, [91, 42, 134]],
  [0.5, [194, 54, 107]],
  [0.75, [246, 141, 69]],
  [1, [253, 231, 76]],
];

/** RGB (0–255) for t in [0, 1] */
export function heatColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (x <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const f = (x - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** CSS linear-gradient for a legend */
export const HEAT_GRADIENT_CSS = `linear-gradient(to right, ${STOPS.map(
  ([t, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${t * 100}%`,
).join(", ")})`;

/** RGBA pixels for `hours` scaled so `max` hours = 1 */
export function heatPixels(hours: Float32Array, max: number): Uint8Array {
  const px = new Uint8Array(hours.length * 4);
  for (let i = 0; i < hours.length; i++) {
    const [r, g, b] = heatColor(max > 0 ? hours[i] / max : 0);
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  return px;
}
