/**
 * Sun Position Engine for Dagsbirta
 *
 * Calculates sun position and path using SunCalc library,
 * with special handling for Iceland's polar edge cases (63-66°N).
 */

import SunCalc from 'suncalc';
import type { SunPosition, SunPath } from '../../types/index';

/**
 * Convert radians to degrees
 */
function radToDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

/**
 * Normalize azimuth from SunCalc (radians from south, clockwise)
 * to degrees from north (0-360, clockwise).
 *
 * SunCalc azimuth: 0 = south, positive = west
 * Our azimuth: 0 = north, clockwise
 */
function normalizeAzimuth(azimuthRadians: number): number {
  // Convert radians to degrees
  let azimuthDeg = radToDeg(azimuthRadians);

  // SunCalc: 0° = south, so we add 180° to get north-based
  azimuthDeg = azimuthDeg + 180;

  // Normalize to 0-360 range
  while (azimuthDeg < 0) azimuthDeg += 360;
  while (azimuthDeg >= 360) azimuthDeg -= 360;

  return azimuthDeg;
}

/**
 * Get sun position at a specific location and time.
 *
 * @param lat - Latitude in degrees
 * @param lng - Longitude in degrees
 * @param date - Date/time for calculation
 * @returns SunPosition with altitude and azimuth in degrees
 */
export function getSunPosition(
  lat: number,
  lng: number,
  date: Date
): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);

  return {
    altitude: radToDeg(pos.altitude),
    azimuth: normalizeAzimuth(pos.azimuth),
    date: new Date(date),
  };
}

/**
 * Get complete sun path for a day at a specific location.
 *
 * Handles Iceland's polar edge cases:
 * - Midnight sun: sunrise/sunset are null, dayLength ~24h
 * - Polar night: sunrise/sunset are null, dayLength ~0h
 *
 * @param lat - Latitude in degrees
 * @param lng - Longitude in degrees
 * @param date - Date for calculation (time component is ignored)
 * @param intervalMinutes - Interval between position samples (default: 5)
 * @returns SunPath with positions, events, and polar status
 */
export function getSunPath(
  lat: number,
  lng: number,
  date: Date,
  intervalMinutes: number = 5
): SunPath {
  // Get start of day in local context
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  // Calculate sun positions throughout the day
  const positions: SunPosition[] = [];
  const intervalMs = intervalMinutes * 60 * 1000;

  for (
    let time = dayStart.getTime();
    time <= dayEnd.getTime();
    time += intervalMs
  ) {
    const currentDate = new Date(time);
    positions.push(getSunPosition(lat, lng, currentDate));
  }

  // Get sun times for the day
  const times = SunCalc.getTimes(dayStart, lat, lng);

  // Check for valid sunrise/sunset
  const sunrise = isValidDate(times.sunrise) ? times.sunrise : null;
  const sunset = isValidDate(times.sunset) ? times.sunset : null;
  const solarNoon = isValidDate(times.solarNoon)
    ? times.solarNoon
    : new Date(dayStart.getTime() + 12 * 60 * 60 * 1000);

  // Calculate day length and polar conditions
  const { dayLengthHours, isMidnightSun, isPolarNight } = calculateDayLength(
    positions,
    sunrise,
    sunset
  );

  return {
    date: new Date(dayStart),
    positions,
    sunrise,
    sunset,
    solarNoon,
    dayLengthHours,
    isMidnightSun,
    isPolarNight,
  };
}

/**
 * Check if a date is valid (not NaN or Invalid Date)
 */
function isValidDate(date: Date | undefined): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Calculate day length and detect polar conditions.
 *
 * For polar regions where sunrise/sunset may not occur,
 * we calculate based on sun altitude throughout the day.
 */
function calculateDayLength(
  positions: SunPosition[],
  sunrise: Date | null,
  sunset: Date | null
): {
  dayLengthHours: number;
  isMidnightSun: boolean;
  isPolarNight: boolean;
} {
  // If we have valid sunrise and sunset, calculate normally
  if (sunrise && sunset) {
    const dayLengthMs = sunset.getTime() - sunrise.getTime();
    const dayLengthHours = dayLengthMs / (1000 * 60 * 60);

    return {
      dayLengthHours: Math.max(0, dayLengthHours),
      isMidnightSun: false,
      isPolarNight: false,
    };
  }

  // For polar conditions, count hours where sun is above horizon
  const aboveHorizonCount = positions.filter((p) => p.altitude > 0).length;
  const totalCount = positions.length;

  // Ratio of daylight
  const daylightRatio = aboveHorizonCount / totalCount;
  const dayLengthHours = daylightRatio * 24;

  // Midnight sun: sun never sets (always above horizon)
  const isMidnightSun = daylightRatio > 0.95;

  // Polar night: sun never rises (always below horizon)
  const isPolarNight = daylightRatio < 0.05;

  return {
    dayLengthHours,
    isMidnightSun,
    isPolarNight,
  };
}
