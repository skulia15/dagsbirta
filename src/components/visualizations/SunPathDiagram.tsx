/**
 * SunPathDiagram - Polar diagram showing sun trajectory and horizon profile
 *
 * T17-1: Basic component structure with SVG canvas
 * T17-2: Polar coordinate system with altitude circles and cardinal directions
 * T17-3: polarToCartesian helper for sun position coordinate conversion
 * T17-4: Sun path arc drawing using sunPath.positions data
 */

import type { SunPath } from '../../types/index';

export interface SunPathDiagramProps {
  sunPath?: SunPath;
}

const SVG_SIZE = 500;
const VIEW_BOX = `0 0 ${SVG_SIZE} ${SVG_SIZE}`;
const CENTER = SVG_SIZE / 2;
const RADIUS = 200; // Maximum radius for 0° altitude (horizon)
const LABEL_OFFSET = 20; // Distance outside the diagram for labels

// Altitude circles: 0° (outer), 30°, 60°, 90° (center)
const ALTITUDE_CIRCLES = [0, 30, 60, 90];

// Cardinal directions with their azimuths (clockwise from North)
const CARDINAL_DIRECTIONS = [
  { label: 'N', azimuth: 0 },
  { label: 'E', azimuth: 90 },
  { label: 'S', azimuth: 180 },
  { label: 'W', azimuth: 270 },
];

/**
 * Convert altitude angle (0-90°) to radius in SVG coordinates
 * 0° = outer edge (RADIUS), 90° = center (0)
 */
function altitudeToRadius(altitude: number): number {
  return RADIUS * (1 - altitude / 90);
}

/**
 * Convert azimuth angle to SVG coordinates
 * Azimuth: 0° = North (top), 90° = East (right), 180° = South (bottom), 270° = West (left)
 * SVG: 0° = right, rotates clockwise
 * We adjust by -90° to put North at top
 */
function azimuthToPoint(azimuth: number, radius: number): { x: number; y: number } {
  const radians = ((azimuth - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

/**
 * Convert sun position (azimuth, altitude) to SVG (x, y) coordinates
 *
 * T17-3: Helper function for mapping sun positions to the polar diagram
 *
 * Coordinate mapping:
 * - Azimuth 0° = top (North), 90° = right (East), 180° = bottom (South), 270° = left (West)
 * - Altitude 0° = outer edge (horizon), 90° = center (zenith)
 *
 * @param azimuth - Compass bearing in degrees (0-360°, clockwise from North)
 * @param altitude - Elevation angle in degrees (0° = horizon, 90° = zenith)
 * @returns SVG coordinates {x, y} within the diagram
 */
export function polarToCartesian(
  azimuth: number,
  altitude: number
): { x: number; y: number } {
  // Convert altitude to radius: 0° → RADIUS (outer), 90° → 0 (center)
  const radius = altitudeToRadius(altitude);

  // Convert azimuth to angle, adjusted so 0° is at top (North)
  // SVG angles: 0° is right (East), so subtract 90° to rotate North to top
  const radians = ((azimuth - 90) * Math.PI) / 180;

  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

/**
 * Renders concentric circles for altitude angles
 */
function AltitudeCircles() {
  return (
    <g className="altitude-circles">
      {ALTITUDE_CIRCLES.map((altitude) => {
        const r = altitudeToRadius(altitude);
        // Don't render a circle at the center point (90°)
        if (r === 0) return null;
        return (
          <circle
            key={altitude}
            cx={CENTER}
            cy={CENTER}
            r={r}
            fill="none"
            stroke="#ccc"
            strokeWidth={altitude === 0 ? 2 : 1}
            strokeDasharray={altitude === 0 ? 'none' : '4,4'}
          />
        );
      })}
    </g>
  );
}

/**
 * Renders radial lines for cardinal directions
 */
function CardinalLines() {
  return (
    <g className="cardinal-lines">
      {CARDINAL_DIRECTIONS.map(({ label, azimuth }) => {
        const outerPoint = azimuthToPoint(azimuth, RADIUS);
        return (
          <line
            key={label}
            x1={CENTER}
            y1={CENTER}
            x2={outerPoint.x}
            y2={outerPoint.y}
            stroke="#999"
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}

/**
 * Renders labels for cardinal directions (N, E, S, W)
 */
function CardinalLabels() {
  return (
    <g className="cardinal-labels">
      {CARDINAL_DIRECTIONS.map(({ label, azimuth }) => {
        const point = azimuthToPoint(azimuth, RADIUS + LABEL_OFFSET);
        return (
          <text
            key={label}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={16}
            fontWeight="bold"
            fill="#333"
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

/**
 * Renders the sun's path through the day as an SVG path
 * T17-4: Plot sun's trajectory using sunPath.positions data
 *
 * @param sunPath - The sun path data containing positions array
 */
function SunPathArc({ sunPath }: { sunPath: SunPath }) {
  // Filter to only include positions above the horizon (altitude > 0)
  const visiblePositions = sunPath.positions.filter((pos) => pos.altitude > 0);

  // Need at least 2 points to draw a path
  if (visiblePositions.length < 2) {
    return null;
  }

  // Build SVG path data string
  // M = moveTo (start), L = lineTo (subsequent points)
  const pathData = visiblePositions
    .map((pos, index) => {
      const { x, y } = polarToCartesian(pos.azimuth, pos.altitude);
      // First point uses M (moveTo), rest use L (lineTo)
      return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(' ');

  return (
    <g className="sun-path-arc">
      {/* Sun path stroke - yellow/orange gradient effect with glow */}
      <path
        d={pathData}
        fill="none"
        stroke="#FFA500"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
      {/* Inner brighter line for visual depth */}
      <path
        d={pathData}
        fill="none"
        stroke="#FFD700"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

export function SunPathDiagram({ sunPath }: SunPathDiagramProps) {
  return (
    <svg
      width={SVG_SIZE}
      height={SVG_SIZE}
      viewBox={VIEW_BOX}
      role="img"
      aria-label="Sun path diagram"
    >
      {/* Polar coordinate grid */}
      <AltitudeCircles />
      <CardinalLines />
      <CardinalLabels />

      {/* Sun path arc - T17-4 */}
      {sunPath && <SunPathArc sunPath={sunPath} />}

      {/* Center point marker (zenith) */}
      <circle cx={CENTER} cy={CENTER} r={3} fill="#666" />
    </svg>
  );
}

export default SunPathDiagram;
