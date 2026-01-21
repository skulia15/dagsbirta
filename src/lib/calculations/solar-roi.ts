/**
 * Solar Panel ROI Calculator for Dagsbirta
 *
 * Calculates financial viability and return on investment for solar panel
 * installations in Iceland. Uses irradiance data to estimate production
 * and provides payback period and 25-year return projections.
 *
 * Key metrics:
 * - Annual production (kWh): Based on POA irradiance, system size, and efficiency
 * - Payback years: Installation cost / annual savings
 * - 25-year return: Total savings over system lifetime accounting for degradation
 * - Viability rating: excellent/good/marginal/poor based on payback period
 */

import type { IrradianceResult, SolarROIResult } from '../../types/index';
import { SOLAR_CONSTANTS } from '../constants';

/**
 * Default system configuration for solar ROI calculations.
 * These values can be overridden via SolarROIOptions.
 */
export const DEFAULT_SOLAR_CONFIG = {
  /**
   * Default system size in kilowatts.
   * 5kW is a typical residential installation in Iceland.
   */
  systemSizeKW: 5,

  /**
   * Panel efficiency (0-1). Represents the fraction of solar energy
   * converted to electricity. Modern panels are 18-22% efficient.
   * Default from SOLAR_CONSTANTS: 0.20 (20%)
   */
  panelEfficiency: SOLAR_CONSTANTS.panelEfficiency,

  /**
   * System losses (0-1). Accounts for inverter inefficiency, wiring losses,
   * soiling, shading, snow cover, and temperature derating.
   * Default from SOLAR_CONSTANTS: 0.14 (14%)
   */
  systemLosses: SOLAR_CONSTANTS.systemLosses,

  /**
   * Electricity price in EUR per kWh.
   * Iceland has relatively low electricity prices due to geothermal/hydro.
   * Default from SOLAR_CONSTANTS: 0.18 EUR/kWh
   */
  electricityPriceEUR: SOLAR_CONSTANTS.electricityPriceEUR,

  /**
   * Installation cost per kilowatt in EUR.
   * Includes panels, inverter, mounting, labor, and permits.
   * Default from SOLAR_CONSTANTS: 1500 EUR/kW
   */
  installCostPerKW: SOLAR_CONSTANTS.installCostPerKW,

  /**
   * Annual panel degradation rate (0-1).
   * Panels lose efficiency over time due to cell degradation.
   * Default from SOLAR_CONSTANTS: 0.005 (0.5% per year)
   */
  annualDegradation: SOLAR_CONSTANTS.annualDegradation,

  /**
   * Expected system lifetime in years.
   * Modern panels are warranted for 25 years.
   * Default from SOLAR_CONSTANTS: 25 years
   */
  systemLifeYears: SOLAR_CONSTANTS.systemLifeYears,
} as const;

/**
 * Viability rating thresholds based on payback years.
 * These define the boundaries for viability assessment.
 */
export const VIABILITY_THRESHOLDS = {
  /** Payback < 10 years = excellent */
  excellent: 10,
  /** Payback 10-15 years = good */
  good: 15,
  /** Payback 15-20 years = marginal */
  marginal: 20,
  /** Payback > 20 years = poor */
} as const;

/**
 * Options for customizing solar ROI calculations.
 */
export interface SolarROIOptions {
  /** System size in kilowatts (default: 5) */
  systemSizeKW?: number;
  /** Panel efficiency 0-1 (default: 0.20) */
  panelEfficiency?: number;
  /** System losses 0-1 (default: 0.14) */
  systemLosses?: number;
  /** Electricity price EUR/kWh (default: 0.18) */
  electricityPriceEUR?: number;
  /** Installation cost EUR/kW (default: 1500) */
  installCostPerKW?: number;
  /** Annual degradation rate 0-1 (default: 0.005) */
  annualDegradation?: number;
  /** System lifetime years (default: 25) */
  systemLifeYears?: number;
}

/**
 * Calculate the required panel area in square meters for a given system size.
 *
 * Formula: panelArea = systemSizeKW / efficiency
 *
 * Derivation: At peak irradiance (1 kW/m²), a panel with X% efficiency
 * produces X kW per m². So to get Y kW capacity, you need Y/X m².
 *
 * @param systemSizeKW - System capacity in kilowatts
 * @param panelEfficiency - Panel efficiency as decimal (0-1), e.g., 0.20 for 20%
 * @returns Panel area in square meters
 *
 * @example
 * // 5 kW system with 20% efficient panels
 * calculatePanelArea(5, 0.20) // returns 25 m²
 */
export function calculatePanelArea(
  systemSizeKW: number,
  panelEfficiency: number = DEFAULT_SOLAR_CONFIG.panelEfficiency
): number {
  if (panelEfficiency <= 0 || panelEfficiency > 1) {
    throw new Error('Panel efficiency must be between 0 and 1');
  }
  if (systemSizeKW <= 0) {
    throw new Error('System size must be positive');
  }

  // panelArea = systemSizeKW / efficiency
  // At 1 kW/m² peak irradiance, a 20% efficient panel produces 0.2 kW/m²
  // So for 5 kW capacity: 5 / 0.20 = 25 m²
  return systemSizeKW / panelEfficiency;
}

/**
 * Calculate annual energy production in kWh from solar panels.
 *
 * Formula: production = POA × area × efficiency × (1 - losses)
 *
 * Where:
 * - POA = Plane of Array irradiance (kWh/m²/year) - energy available on tilted panels
 * - area = Panel area in m²
 * - efficiency = Panel efficiency (0-1)
 * - losses = System losses (0-1) - inverter, wiring, soiling, temperature effects
 *
 * @param annualPOA - Annual Plane of Array irradiance in kWh/m²/year
 * @param panelAreaM2 - Total panel area in square meters
 * @param panelEfficiency - Panel efficiency as decimal (0-1)
 * @param systemLosses - System losses as decimal (0-1)
 * @returns Annual production in kWh
 *
 * @example
 * // 25 m² of panels, 1000 kWh/m²/year POA, 20% efficiency, 14% losses
 * calculateAnnualProduction(1000, 25, 0.20, 0.14)
 * // = 1000 × 25 × 0.20 × (1 - 0.14) = 4300 kWh
 */
export function calculateAnnualProduction(
  annualPOA: number,
  panelAreaM2: number,
  panelEfficiency: number = DEFAULT_SOLAR_CONFIG.panelEfficiency,
  systemLosses: number = DEFAULT_SOLAR_CONFIG.systemLosses
): number {
  if (annualPOA < 0) {
    throw new Error('Annual POA cannot be negative');
  }
  if (panelAreaM2 <= 0) {
    throw new Error('Panel area must be positive');
  }
  if (panelEfficiency <= 0 || panelEfficiency > 1) {
    throw new Error('Panel efficiency must be between 0 and 1');
  }
  if (systemLosses < 0 || systemLosses >= 1) {
    throw new Error('System losses must be between 0 and 1 (exclusive)');
  }

  // production = POA × area × efficiency × (1 - losses)
  const production = annualPOA * panelAreaM2 * panelEfficiency * (1 - systemLosses);

  // Round to 2 decimal places for clean output
  return Math.round(production * 100) / 100;
}
