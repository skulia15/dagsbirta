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
 * Sample days to use for monthly estimation.
 * Spaced roughly every 7 days to capture sun position changes throughout the month.
 */
const SAMPLE_DAYS = [1, 8, 15, 22];

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

  // Sample 4 days per month (1st, 8th, 15th, 22nd) to estimate monthly sunlight
  // JavaScript Date months are 0-indexed, so subtract 1 from our 1-indexed month
  const sampleDates = SAMPLE_DAYS.map(day => new Date(year, month - 1, day));

  // Calculate daily sunlight for each sample day
  const dailyResults = sampleDates.map(date =>
    getDailySunlight(lat, lng, date, horizonProfile)
  );

  // Calculate average daily hours from sample days
  const averageDailyHours = dailyResults.reduce(
    (sum, result) => sum + result.totalHours,
    0
  ) / dailyResults.length;

  // Calculate average theoretical daily hours
  const averageTheoreticalDaily = dailyResults.reduce(
    (sum, result) => sum + result.theoreticalHours,
    0
  ) / dailyResults.length;

  // Get number of days in this month
  // Trick: Day 0 of next month = last day of current month
  const daysInMonth = new Date(year, month, 0).getDate();

  // Calculate monthly totals
  const totalHours = averageDailyHours * daysInMonth;
  const theoreticalHours = averageTheoreticalDaily * daysInMonth;

  // Calculate reduction percentage (terrain blocking)
  const reductionPercent = theoreticalHours > 0
    ? ((theoreticalHours - totalHours) / theoreticalHours) * 100
    : 0;

  return {
    month,
    monthName,
    year,
    averageDailyHours,
    totalHours,
    theoreticalHours,
    reductionPercent
  };
}

/**
 * Calculate sunlight statistics for an entire year.
 *
 * Aggregates monthly data for all 12 months and computes annual totals.
 * Handles leap years correctly for average calculations.
 *
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @param horizonProfile - Pre-computed horizon profile for the location
 * @param year - Full year (e.g., 2024)
 * @returns AnnualSunlight summary with monthly breakdown and annual totals
 */
export function getAnnualSunlight(
  lat: number,
  lng: number,
  horizonProfile: HorizonProfile,
  year: number
): AnnualSunlight {
  // Calculate sunlight for all 12 months
  const months: MonthlySunlight[] = [];
  for (let month = 1; month <= 12; month++) {
    months.push(getMonthlySunlight(lat, lng, horizonProfile, month, year));
  }

  // Aggregate annual totals from monthly data
  const totalHours = months.reduce((sum, m) => sum + m.totalHours, 0);
  const theoreticalTotalHours = months.reduce((sum, m) => sum + m.theoreticalHours, 0);

  // Calculate days in year (handle leap years)
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInYear = isLeapYear ? 366 : 365;

  // Average daily hours across the entire year
  const averageDailyHours = totalHours / daysInYear;

  // Overall reduction percentage from terrain
  const reductionPercent = theoreticalTotalHours > 0
    ? ((theoreticalTotalHours - totalHours) / theoreticalTotalHours) * 100
    : 0;

  return {
    year,
    months,
    totalHours,
    averageDailyHours,
    theoreticalTotalHours,
    reductionPercent
  };
}
