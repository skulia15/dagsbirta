/**
 * Shadow Intersection Calculator for Dagsbirta
 *
 * Determines whether the sun is visible from a given location by comparing
 * the sun's altitude to the terrain horizon profile at that azimuth.
 */

import type {
  ShadowResult,
  HorizonProfile,
  SunPosition,
} from '../../types/index';

/**
 * Solar disc margin in degrees.
 * The sun's apparent diameter is ~0.5°, so we use half (0.25°) as a margin
 * to account for partial visibility at the horizon.
 */
const SOLAR_DISC_MARGIN = 0.25;

/**
 * Get the horizon elevation angle at a specific azimuth using linear interpolation.
 *
 * Handles wrap-around at 0/360 degrees correctly for interpolation.
 *
 * @param profile - The horizon profile containing elevation angles at discrete azimuths
 * @param azimuth - The azimuth in degrees (0-360, where 0=North, 90=East)
 * @returns The interpolated horizon elevation angle in degrees
 */
export function getHorizonAtAzimuth(
  profile: HorizonProfile,
  azimuth: number
): number {
  const points = profile.profile;

  if (points.length === 0) {
    return 0;
  }

  // Normalize azimuth to 0-360 range
  let normalizedAzimuth = azimuth % 360;
  if (normalizedAzimuth < 0) {
    normalizedAzimuth += 360;
  }

  // Calculate the angular resolution of the profile
  const resolution = 360 / points.length;

  // Find the fractional index
  const idx = normalizedAzimuth / resolution;
  const idx0 = Math.floor(idx) % points.length;
  const idx1 = (idx0 + 1) % points.length; // Wraps around for 359° -> 0°
  const fraction = idx - Math.floor(idx);

  // Linear interpolation between the two nearest points
  const elevation0 = points[idx0].elevationAngle;
  const elevation1 = points[idx1].elevationAngle;

  return elevation0 * (1 - fraction) + elevation1 * fraction;
}

/**
 * Determine if the sun is visible from a location given its horizon profile.
 *
 * The sun is considered visible if its altitude exceeds the terrain horizon
 * at the sun's azimuth by at least the solar disc margin (0.25°).
 *
 * @param horizonProfile - The pre-computed horizon profile for the location
 * @param sunPosition - The current sun position (altitude and azimuth)
 * @returns ShadowResult containing visibility status and margin details
 */
export function isSunVisible(
  horizonProfile: HorizonProfile,
  sunPosition: SunPosition
): ShadowResult {
  const { altitude: sunAltitude, azimuth: sunAzimuth } = sunPosition;

  // Get the terrain horizon elevation at the sun's azimuth
  const horizonAltitude = getHorizonAtAzimuth(horizonProfile, sunAzimuth);

  // Calculate the margin between sun altitude and horizon
  // Positive margin means sun is above horizon, negative means blocked
  const margin = sunAltitude - horizonAltitude;

  // Sun is visible if it clears the horizon by at least the solar disc margin
  // This accounts for the sun being a disc, not a point
  const isVisible = margin > SOLAR_DISC_MARGIN;

  return {
    isVisible,
    sunAltitude,
    horizonAltitude,
    margin,
  };
}
