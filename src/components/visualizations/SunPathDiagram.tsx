/**
 * SunPathDiagram - Polar diagram showing sun trajectory and horizon profile
 *
 * T17-1: Basic component structure with SVG canvas
 */

import type { SunPath } from '../../types/index';

export interface SunPathDiagramProps {
  sunPath?: SunPath;
}

const SVG_SIZE = 500;
const VIEW_BOX = `0 0 ${SVG_SIZE} ${SVG_SIZE}`;

export function SunPathDiagram({ sunPath }: SunPathDiagramProps) {
  return (
    <svg
      width={SVG_SIZE}
      height={SVG_SIZE}
      viewBox={VIEW_BOX}
      role="img"
      aria-label="Sun path diagram"
    >
      {/* Future: polar coordinate grid, sun path arc, horizon profile */}
    </svg>
  );
}

export default SunPathDiagram;
