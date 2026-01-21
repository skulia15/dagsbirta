/**
 * Daily Sunlight Calculator for Dagsbirta
 *
 * Calculates the total hours of direct sunlight a location receives in a day,
 * accounting for terrain obstructions. This combines the sun path with the
 * horizon profile to determine actual visibility throughout the day.
 */

import type { DailySunlight, HorizonProfile } from '../../types/index';
import { getSunPath } from './sun';
import { isSunVisible } from './shadow';
import { CALCULATION_CONFIG } from '../constants';

/**
 * Calculate daily sunlight hours for a location, accounting for terrain.
 *
 * This function:
 * 1. Gets the sun path for the entire day at 5-minute intervals
 * 2. Checks each sun position against the terrain horizon
 * 3. Aggregates visible intervals to calculate total sunlight hours
 * 4. Identifies terrain-adjusted sunrise/sunset times
 *
 * @param lat - Latitude in degrees
 * @param lng - Longitude in degrees
 * @param date - The date to calculate (time component is ignored)
 * @param horizonProfile - Pre-computed terrain horizon profile for the location
 * @returns DailySunlight with total hours, reduction, and visibility intervals
 */
export function getDailySunlight(
  lat: number,
  lng: number,
  date: Date,
  horizonProfile: HorizonProfile
): DailySunlight {
  const intervalMinutes = CALCULATION_CONFIG.sunPathIntervalMinutes;

  // Get the full sun path for the day
  const sunPath = getSunPath(lat, lng, date, intervalMinutes);

  // Check visibility at each sun position
  const intervals: DailySunlight['intervals'] = [];
  let visibleCount = 0;
  let terrainSunrise: Date | null = null;
  let terrainSunset: Date | null = null;
  let previousVisible = false;

  for (const position of sunPath.positions) {
    // Only check visibility when sun is above astronomical horizon
    // (altitude > 0 means sun is geometrically above the horizon)
    const result = isSunVisible(horizonProfile, position);
    const isVisible = result.isVisible && position.altitude > 0;

    intervals.push({
      time: position.date,
      isVisible,
      sunAltitude: position.altitude,
    });

    if (isVisible) {
      visibleCount++;

      // Track first visible moment (terrain sunrise)
      if (!terrainSunrise) {
        terrainSunrise = position.date;
      }

      // Track last visible moment (terrain sunset)
      terrainSunset = position.date;
    }

    // Detect sun becoming obscured by terrain (helps identify shading patterns)
    previousVisible = isVisible;
  }

  // Calculate total hours of sunlight
  const totalHours = visibleCount * (intervalMinutes / 60);

  // Theoretical hours from astronomical calculation (no terrain)
  const theoreticalHours = sunPath.dayLengthHours;

  // Calculate reduction due to terrain
  const reductionHours = theoreticalHours - totalHours;
  const reductionPercent =
    theoreticalHours > 0 ? (reductionHours / theoreticalHours) * 100 : 0;

  return {
    date: sunPath.date,
    location: { lat, lng },
    totalHours,
    theoreticalHours,
    reductionHours: Math.max(0, reductionHours), // Ensure non-negative
    reductionPercent: Math.max(0, reductionPercent),
    terrainSunrise,
    terrainSunset,
    astronomicalSunrise: sunPath.sunrise,
    astronomicalSunset: sunPath.sunset,
    intervals,
  };
}

/**
 * Check if a date is during polar night (sun never rises above horizon).
 *
 * @param dailySunlight - The daily sunlight calculation result
 * @returns true if this day is a polar night
 */
export function isPolarNight(dailySunlight: DailySunlight): boolean {
  return (
    dailySunlight.theoreticalHours < 0.5 && dailySunlight.totalHours === 0
  );
}

/**
 * Check if a date has midnight sun (sun never sets below horizon).
 *
 * @param dailySunlight - The daily sunlight calculation result
 * @returns true if this day has midnight sun
 */
export function isMidnightSun(dailySunlight: DailySunlight): boolean {
  return dailySunlight.theoreticalHours >= 23.5;
}
