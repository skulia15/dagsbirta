/**
 * Monthly and Annual Sunlight Aggregator for Dagsbirta
 *
 * Aggregates daily sunlight calculations into monthly and annual summaries.
 * This enables long-term analysis for solar panel planning and seasonal
 * sunlight patterns at specific locations in Iceland.
 */

import type { MonthlySunlight, AnnualSunlight, HorizonProfile } from '../../types/index';
import { getDailySunlight } from './daily';

/**
 * Month names for display purposes
 */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Calculate sunlight statistics for a single month.
 *
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @param horizonProfile - Pre-computed horizon profile for the location
 * @param month - Month number (1-12)
 * @param year - Full year (e.g., 2024)
 * @returns MonthlySunlight summary with placeholder values (to be implemented in T07-3/T07-4)
 */
export function getMonthlySunlight(
  lat: number,
  lng: number,
  horizonProfile: HorizonProfile,
  month: number,
  year: number
): MonthlySunlight {
  // Validate month
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be 1-12.`);
  }

  // Get month name (month is 1-indexed, array is 0-indexed)
  const monthName = MONTH_NAMES[month - 1];

  // Placeholder values - actual calculation will be implemented in T07-3 and T07-4
  return {
    month,
    monthName,
    year,
    averageDailyHours: 0,
    totalHours: 0,
    theoreticalHours: 0,
    reductionPercent: 0
  };
}
