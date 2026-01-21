/**
 * SunPathDiagram - Polar diagram showing sun trajectory and horizon profile
 *
 * T17-1: Basic component structure with SVG canvas
 * T17-2: Polar coordinate system with altitude circles and cardinal directions
 * T17-3: polarToCartesian helper for sun position coordinate conversion
 * T17-4: Sun path arc drawing using sunPath.positions data
 * T17-5: Markers for sunrise, solar noon, and sunset with time labels
 * T17-6: Horizon profile overlay showing terrain blocking
 */

import type { HorizonProfile, SunPath, SunPosition } from '../../types/index';

export interface SunPathDiagramProps {
  sunPath?: SunPath;
  horizonProfile?: HorizonProfile;
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
 * Renders the horizon profile as a filled area from center outward
 * T17-6: Overlay terrain horizon showing blocked sky
 *
 * The filled area represents terrain that blocks the view of the sky.
 * It extends from the center (zenith) to the horizon elevation angle at each azimuth.
 *
 * @param horizonProfile - The terrain horizon data containing profile array
 */
function HorizonOverlay({ horizonProfile }: { horizonProfile: HorizonProfile }) {
  const { profile } = horizonProfile;

  // Need profile data to render
  if (!profile || profile.length === 0) {
    return null;
  }

  // Sort profile by azimuth to ensure proper path order
  const sortedProfile = [...profile].sort((a, b) => a.azimuth - b.azimuth);

  // Build SVG path for the filled horizon area
  // The path goes around the diagram at the horizon elevation for each azimuth,
  // then closes back through the outer edge (0° altitude = full horizon)
  const pathParts: string[] = [];

  // First, draw the inner edge (at terrain horizon elevations)
  sortedProfile.forEach((point, index) => {
    // Use the elevation angle as the altitude (terrain blocks up to this angle)
    const { x, y } = polarToCartesian(point.azimuth, point.elevationAngle);
    if (index === 0) {
      pathParts.push(`M ${x} ${y}`);
    } else {
      pathParts.push(`L ${x} ${y}`);
    }
  });

  // Close the inner loop by connecting back to the first point
  if (sortedProfile.length > 0) {
    const first = sortedProfile[0];
    const { x, y } = polarToCartesian(first.azimuth, first.elevationAngle);
    pathParts.push(`L ${x} ${y}`);
  }

  // Now draw the outer edge (at 0° altitude, the horizon circle) in reverse
  // This creates a "donut" shape where the terrain fills between the horizon and the elevation
  // We go around the full circle at RADIUS to close the fill properly
  const outerPathParts: string[] = [];

  // Trace the outer edge (0° altitude = RADIUS from center) in reverse order
  [...sortedProfile].reverse().forEach((point, index) => {
    const { x, y } = polarToCartesian(point.azimuth, 0);
    if (index === 0) {
      outerPathParts.push(`L ${x} ${y}`);
    } else {
      outerPathParts.push(`L ${x} ${y}`);
    }
  });

  // Complete the outer loop
  if (sortedProfile.length > 0) {
    const last = sortedProfile[sortedProfile.length - 1];
    const { x: lastX, y: lastY } = polarToCartesian(last.azimuth, last.elevationAngle);
    outerPathParts.push(`L ${lastX} ${lastY}`);
  }

  const pathData = [...pathParts, ...outerPathParts, 'Z'].join(' ');

  return (
    <g className="horizon-overlay">
      {/* Terrain fill - gray/brown color representing blocked terrain */}
      <path
        d={pathData}
        fill="#8B7355"
        fillOpacity={0.4}
        stroke="#6B5344"
        strokeWidth={1}
        strokeOpacity={0.6}
      />
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

/**
 * Finds the sun position closest to a given target time
 * Returns null if positions array is empty or target is null
 */
function findPositionAtTime(
  positions: SunPosition[],
  targetTime: Date | null
): SunPosition | null {
  if (!targetTime || positions.length === 0) {
    return null;
  }

  const targetMs = targetTime.getTime();
  let closest: SunPosition | null = null;
  let minDiff = Infinity;

  for (const pos of positions) {
    const diff = Math.abs(pos.date.getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = pos;
    }
  }

  return closest;
}

/**
 * Formats a Date object to a time string (HH:MM)
 */
function formatTime(date: Date | null): string {
  if (!date) return '';
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Individual sun marker with label
 */
function SunMarker({
  position,
  label,
  time,
  color,
}: {
  position: SunPosition;
  label: string;
  time: string;
  color: string;
}) {
  const { x, y } = polarToCartesian(position.azimuth, position.altitude);

  // Calculate label position offset based on azimuth to avoid overlapping the path
  // Place labels slightly outside the marker
  const labelOffset = 18;
  const labelRadians = ((position.azimuth - 90) * Math.PI) / 180;
  const labelX = x + labelOffset * Math.cos(labelRadians);
  const labelY = y + labelOffset * Math.sin(labelRadians);

  return (
    <g className={`sun-marker sun-marker-${label.toLowerCase().replace(' ', '-')}`}>
      {/* Marker circle with white outline for visibility */}
      <circle cx={x} cy={y} r={8} fill="white" stroke={color} strokeWidth={2} />
      <circle cx={x} cy={y} r={5} fill={color} />

      {/* Label with time */}
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight="bold"
        fill="#333"
      >
        {label}
      </text>
      <text
        x={labelX}
        y={labelY + 12}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10}
        fill="#666"
      >
        {time}
      </text>
    </g>
  );
}

/**
 * Renders markers at sunrise, solar noon, and sunset positions
 * T17-5: Add markers at key sun positions with time labels
 */
function SunMarkers({ sunPath }: { sunPath: SunPath }) {
  const markers: Array<{
    position: SunPosition | null;
    label: string;
    time: Date | null;
    color: string;
  }> = [
    {
      position: findPositionAtTime(sunPath.positions, sunPath.sunrise),
      label: 'Sunrise',
      time: sunPath.sunrise,
      color: '#FF6B6B', // Warm red/orange for sunrise
    },
    {
      position: findPositionAtTime(sunPath.positions, sunPath.solarNoon),
      label: 'Noon',
      time: sunPath.solarNoon,
      color: '#FFD93D', // Bright yellow for noon
    },
    {
      position: findPositionAtTime(sunPath.positions, sunPath.sunset),
      label: 'Sunset',
      time: sunPath.sunset,
      color: '#C9190B', // Deep red/orange for sunset
    },
  ];

  return (
    <g className="sun-markers">
      {markers.map(({ position, label, time, color }) => {
        // Only render markers for positions above the horizon
        if (!position || position.altitude <= 0) {
          return null;
        }
        return (
          <SunMarker
            key={label}
            position={position}
            label={label}
            time={formatTime(time)}
            color={color}
          />
        );
      })}
    </g>
  );
}

export function SunPathDiagram({ sunPath, horizonProfile }: SunPathDiagramProps) {
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

      {/* Horizon profile overlay - T17-6: shows terrain blocking */}
      {horizonProfile && <HorizonOverlay horizonProfile={horizonProfile} />}

      {/* Sun path arc - T17-4 */}
      {sunPath && <SunPathArc sunPath={sunPath} />}

      {/* Sunrise, noon, sunset markers - T17-5 */}
      {sunPath && <SunMarkers sunPath={sunPath} />}

      {/* Center point marker (zenith) */}
      <circle cx={CENTER} cy={CENTER} r={3} fill="#666" />
    </svg>
  );
}

export default SunPathDiagram;
