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
} as const;
