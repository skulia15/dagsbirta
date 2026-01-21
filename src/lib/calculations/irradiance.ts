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
 * Calculate the optimal tilt angle for solar panels at a given latitude.
 *
 * For year-round energy production, the optimal tilt angle is typically
 * close to the latitude of the location. This is a well-established rule
 * in solar engineering: tilt ≈ latitude gives the best annual average.
 *
 * At high latitudes like Iceland (64-66°N), the optimal tilt is typically
 * in the range of 60-65°, which is slightly less than the latitude to
 * better capture summer sun when most energy is available.
 *
 * The calculation uses a refined model that accounts for:
 * 1. The latitude-based rule as a starting point
 * 2. A small adjustment based on Iceland's seasonal daylight pattern
 * 3. The high diffuse radiation component in Iceland's cloudy climate
 *
 * For Iceland (64-66°N), this returns ~60-65°.
 *
 * @param latitude - Location latitude in degrees
 * @returns Optimal tilt angle in degrees from horizontal
 */
export function calculateOptimalTilt(latitude: number): number {
  // Standard rule: optimal tilt ≈ latitude for year-round production
  // For high latitudes, we subtract a small offset to favor summer production
  // (since summer has much more daylight and contributes most annual energy)

  // Base tilt from latitude rule
  const baseTilt = latitude;

  // High-latitude adjustment: subtract 2-5° to favor summer capture
  // This offset increases slightly with latitude
  // At 64°N: offset ≈ 3°, at 66°N: offset ≈ 4°
  const latitudeOffset = 2 + (latitude - 60) * 0.2;

  // Apply the adjustment, ensuring we stay in a reasonable range
  let optimalTilt = baseTilt - latitudeOffset;

  // Clamp to sensible bounds (minimum 45°, maximum 75°)
  optimalTilt = Math.max(45, Math.min(75, optimalTilt));

  // Round to 1 decimal place
  return Math.round(optimalTilt * 10) / 10;
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

/**
 * Calculate monthly irradiance breakdown with both GHI and POA values.
 *
 * This function produces the full monthly irradiance data required by
 * IrradianceResult.monthlyIrradiance. It calculates both horizontal (GHI)
 * and tilted panel (POA) irradiance for each month.
 *
 * Key characteristics:
 * - Summer months have significantly higher irradiance (due to more sunlight hours
 *   and higher sun angles)
 * - Winter months have lower irradiance (but POA still provides gain over GHI
 *   due to optimal tilt capturing available sun better)
 * - POA values are always >= GHI values when tilt is optimal
 *
 * @param annualSunlight - Annual sunlight data with monthly breakdown
 * @param latitude - Location latitude in degrees (for POA calculation)
 * @param tiltAngle - Panel tilt angle in degrees (or uses optimal if not provided)
 * @returns Array of 12 monthly irradiance objects with month, ghi, and poa
 */
export function calculateMonthlyIrradiance(
  annualSunlight: AnnualSunlight,
  latitude: number,
  tiltAngle?: number
): Array<{ month: number; ghi: number; poa: number }> {
  // Use provided tilt or calculate optimal for this latitude
  const effectiveTilt = tiltAngle ?? calculateOptimalTilt(latitude);

  // Get monthly GHI values
  const monthlyGHI = calculateMonthlyGHI(annualSunlight);

  // Calculate POA for each month
  return annualSunlight.months.map((month, index) => {
    const ghi = monthlyGHI[index];
    const poa = calculatePOA(ghi, effectiveTilt, latitude);

    return {
      month: month.month,
      ghi: Math.round(ghi * 100) / 100, // Round to 2 decimal places
      poa: Math.round(poa * 100) / 100,
    };
  });
}

/**
 * Options for the getIrradiance function.
 */
export interface IrradianceOptions {
  /**
   * Custom tilt angle for panels in degrees from horizontal.
   * If not provided, the optimal tilt angle for the latitude will be calculated.
   */
  tiltAngle?: number;
}

/**
 * Main irradiance calculation function.
 *
 * Combines all irradiance calculation helpers to produce a complete
 * IrradianceResult for a given location. This is the primary export
 * for the irradiance module and should be used by API endpoints.
 *
 * The function:
 * 1. Calculates the optimal panel tilt angle for the location
 * 2. Computes annual Global Horizontal Irradiance (GHI)
 * 3. Computes annual Plane of Array (POA) irradiance for the tilt angle
 * 4. Generates monthly breakdown of both GHI and POA
 *
 * @param lat - Location latitude in degrees
 * @param lng - Location longitude in degrees (currently unused, reserved for future use)
 * @param annualSunlight - Annual sunlight data from getAnnualSunlight()
 * @param options - Optional configuration (e.g., custom tilt angle)
 * @returns Complete IrradianceResult with all fields populated
 *
 * @example
 * ```typescript
 * const annualSunlight = await getAnnualSunlight(lat, lng, horizon, 2024);
 * const irradiance = getIrradiance(lat, lng, annualSunlight);
 * console.log(`Annual POA: ${irradiance.annualPOA} kWh/m²`);
 * ```
 */
export function getIrradiance(
  lat: number,
  lng: number,
  annualSunlight: AnnualSunlight,
  options?: IrradianceOptions
): IrradianceResult {
  // Step 1: Calculate optimal tilt angle (or use provided override)
  const optimalTiltAngle = options?.tiltAngle ?? calculateOptimalTilt(lat);

  // Step 2: Calculate annual GHI from sunlight data
  const annualGHI = calculateGHI(annualSunlight);

  // Step 3: Calculate annual POA using the tilt angle
  const annualPOA = calculatePOA(annualGHI, optimalTiltAngle, lat);

  // Step 4: Calculate monthly breakdown
  const monthlyIrradiance = calculateMonthlyIrradiance(
    annualSunlight,
    lat,
    optimalTiltAngle
  );

  // Return complete IrradianceResult
  return {
    annualGHI: Math.round(annualGHI * 100) / 100,
    annualPOA: Math.round(annualPOA * 100) / 100,
    optimalTiltAngle,
    monthlyIrradiance,
  };
}
