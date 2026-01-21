/**
 * Irradiance Calculator for Dagsbirta
 *
 * Calculates solar irradiance values for Iceland locations:
 * - GHI (Global Horizontal Irradiance): Total solar radiation on a horizontal surface
 * - POA (Plane of Array): Solar radiation on a tilted panel surface
 * - Optimal tilt angle for maximum annual energy capture
 *
 * Uses annual sunlight data to estimate irradiance accounting for Iceland's
 * unique atmospheric conditions and high latitude.
 */

import type { IrradianceResult, AnnualSunlight } from '../../types/index';
import { SOLAR_CONSTANTS } from '../constants';

/**
 * Iceland-specific atmospheric and irradiance constants
 */
const IRRADIANCE_CONSTANTS = {
  // Average extraterrestrial irradiance (W/m²)
  solarConstant: 1361,

  // Iceland atmospheric transmission factor (lower than mid-latitudes due to
  // frequent cloud cover and atmospheric scattering at high latitudes)
  atmosphericTransmission: 0.65,

  // Clear sky index for Iceland (accounts for typical cloud cover)
  clearSkyIndex: 0.55,

  // Diffuse fraction (Iceland has high diffuse component due to clouds)
  diffuseFraction: 0.50,

  // Average solar altitude factor for Iceland (accounts for low sun angles)
  // At 64-66°N latitude, the sun never gets very high even at solar noon in summer
  // This reduces effective irradiance compared to equatorial regions
  averageSolarAltitudeFactor: 0.45,
} as const;

/**
 * Calculate Global Horizontal Irradiance (GHI) from annual sunlight data.
 *
 * GHI represents the total solar radiation received on a horizontal surface.
 * This calculation converts sunlight hours to energy using Iceland-specific
 * atmospheric factors.
 *
 * The formula accounts for:
 * - Average extraterrestrial irradiance (solar constant)
 * - Atmospheric transmission (absorption/scattering)
 * - Clear sky index (cloud cover)
 * - Average solar altitude (low sun angles at high latitudes)
 *
 * @param annualSunlight - Annual sunlight data with total hours
 * @returns Annual GHI in kWh/m²/year
 */
export function calculateGHI(annualSunlight: AnnualSunlight): number {
  const {
    solarConstant,
    atmosphericTransmission,
    clearSkyIndex,
    averageSolarAltitudeFactor,
  } = IRRADIANCE_CONSTANTS;

  // Annual sunlight hours (typically 1500-2500 hours for Iceland)
  const annualSunlightHours = annualSunlight.totalHours;

  // Calculate effective irradiance rate (W/m²)
  // This is the average power received during sunny periods
  // solarConstant × atmosphericTransmission × clearSkyIndex × altitudeFactor
  const effectiveIrradiance =
    solarConstant *
    atmosphericTransmission *
    clearSkyIndex *
    averageSolarAltitudeFactor;

  // Convert to annual energy: hours × W/m² × (1 kWh / 1000 Wh)
  // GHI (kWh/m²/year) = sunlightHours × effectiveIrradiance / 1000
  const annualGHI = (annualSunlightHours * effectiveIrradiance) / 1000;

  return annualGHI;
}

/**
 * Calculate Plane of Array (POA) irradiance for a tilted panel.
 *
 * POA represents the solar radiation received on a tilted surface,
 * which is typically higher than GHI when the panel is optimally tilted
 * toward the sun.
 *
 * Uses simplified formula: POA ≈ GHI × (1 + 0.15 × sin(tilt - lat + 15°))
 *
 * This approximation captures:
 * - The gain from tilting panels toward the sun
 * - The latitude-dependent optimal angle
 * - The +15° offset for year-round optimization (slightly steeper than lat)
 *
 * @param ghi - Global Horizontal Irradiance in kWh/m²
 * @param tiltAngle - Panel tilt angle in degrees from horizontal
 * @param latitude - Location latitude in degrees
 * @returns POA irradiance in kWh/m²
 */
export function calculatePOA(
  ghi: number,
  tiltAngle: number,
  latitude: number
): number {
  // Convert degrees to radians for Math.sin
  const angleRad = ((tiltAngle - latitude + 15) * Math.PI) / 180;

  // POA ≈ GHI × (1 + 0.15 × sin(tilt - lat + 15°))
  // This simplified formula works well for year-round optimization
  const tiltGain = 1 + 0.15 * Math.sin(angleRad);

  // Ensure we never return less than GHI (can happen at extreme angles)
  const poa = ghi * Math.max(1, tiltGain);

  return poa;
}

/**
 * Calculate monthly GHI values based on monthly sunlight data.
 *
 * Accounts for seasonal variation in sun angle and daylight hours.
 * Summer months have higher GHI due to more sunlight hours, while
 * winter months have lower GHI despite potentially clearer skies.
 *
 * @param annualSunlight - Annual sunlight data with monthly breakdown
 * @returns Array of monthly GHI values in kWh/m²/month
 */
export function calculateMonthlyGHI(annualSunlight: AnnualSunlight): number[] {
  const {
    solarConstant,
    atmosphericTransmission,
    clearSkyIndex,
  } = IRRADIANCE_CONSTANTS;

  // Base irradiance without altitude factor (we'll calculate per-month)
  const baseIrradiance = solarConstant * atmosphericTransmission * clearSkyIndex;

  return annualSunlight.months.map((month) => {
    // Calculate seasonal altitude factor based on month
    // Summer months (June) have highest sun angles, winter (December) lowest
    // Using a sinusoidal approximation: peaks in June (month 6)
    const monthIndex = month.month;
    // Phase shift so June (month 6) is at peak
    // sin value ranges from -1 to 1, normalize to 0-1 range, then scale
    // Winter minimum factor ~0.15, summer maximum ~0.65
    const sinValue = Math.sin(((monthIndex - 3) / 12) * 2 * Math.PI);
    const normalizedSin = (sinValue + 1) / 2; // Now 0-1
    const seasonalFactor = 0.15 + 0.50 * normalizedSin; // 0.15 to 0.65

    // Monthly GHI = hours × baseIrradiance × seasonalFactor / 1000
    const monthlyGHI = (month.totalHours * baseIrradiance * seasonalFactor) / 1000;

    return monthlyGHI;
  });
}
