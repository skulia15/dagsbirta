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

/**
 * Calculate annual savings from solar production.
 *
 * Formula: annualSavings = annualProductionKWh × electricityPriceEUR
 *
 * This assumes all produced electricity offsets grid consumption at retail price.
 * In practice, savings may vary based on net metering policies and self-consumption rates.
 *
 * @param annualProductionKWh - Annual energy production in kWh
 * @param electricityPriceEUR - Electricity price in EUR per kWh
 * @returns Annual savings in EUR
 *
 * @example
 * // 4000 kWh/year at 0.18 EUR/kWh
 * calculateAnnualSavings(4000, 0.18) // returns 720 EUR
 */
export function calculateAnnualSavings(
  annualProductionKWh: number,
  electricityPriceEUR: number = DEFAULT_SOLAR_CONFIG.electricityPriceEUR
): number {
  if (annualProductionKWh < 0) {
    throw new Error('Annual production cannot be negative');
  }
  if (electricityPriceEUR <= 0) {
    throw new Error('Electricity price must be positive');
  }

  const savings = annualProductionKWh * electricityPriceEUR;

  // Round to 2 decimal places
  return Math.round(savings * 100) / 100;
}

/**
 * Calculate payback period in years.
 *
 * Formula: paybackYears = totalInstallationCost / annualSavingsEUR
 *
 * This is a simple payback calculation that doesn't account for:
 * - Time value of money (discount rate)
 * - Electricity price inflation
 * - Panel degradation (addressed in calculate25YearReturn)
 *
 * For Iceland with 5kW system:
 * - Cost: 5 × 1500 = 7500 EUR
 * - Production: ~4000 kWh/year
 * - Savings: 4000 × 0.18 = 720 EUR/year
 * - Payback: 7500 / 720 = 10.4 years
 *
 * @param totalInstallationCostEUR - Total system cost in EUR
 * @param annualSavingsEUR - Annual electricity savings in EUR
 * @returns Payback period in years
 *
 * @example
 * calculatePaybackYears(7500, 720) // returns 10.42 years
 */
export function calculatePaybackYears(
  totalInstallationCostEUR: number,
  annualSavingsEUR: number
): number {
  if (totalInstallationCostEUR < 0) {
    throw new Error('Installation cost cannot be negative');
  }
  if (annualSavingsEUR <= 0) {
    throw new Error('Annual savings must be positive');
  }

  const payback = totalInstallationCostEUR / annualSavingsEUR;

  // Round to 2 decimal places
  return Math.round(payback * 100) / 100;
}

/**
 * Calculate total installation cost.
 *
 * @param systemSizeKW - System size in kilowatts
 * @param installCostPerKW - Installation cost per kW in EUR
 * @returns Total installation cost in EUR
 */
export function calculateInstallationCost(
  systemSizeKW: number,
  installCostPerKW: number = DEFAULT_SOLAR_CONFIG.installCostPerKW
): number {
  if (systemSizeKW <= 0) {
    throw new Error('System size must be positive');
  }
  if (installCostPerKW <= 0) {
    throw new Error('Installation cost per kW must be positive');
  }

  return systemSizeKW * installCostPerKW;
}

/**
 * Calculate 25-year (or custom lifetime) return with annual degradation.
 *
 * Solar panels degrade over time, losing efficiency each year. Typical degradation
 * is 0.5% per year, meaning after 25 years panels produce about 88% of original.
 *
 * Formula: For each year n (0 to lifetime-1):
 *   yearProduction = year1Production × (1 - degradation)^n
 *   yearSavings = yearProduction × electricityPrice
 *   totalReturn = sum of all yearSavings
 *
 * The degradation follows exponential decay:
 * - Year 1: 100%
 * - Year 10: 95.5%
 * - Year 25: 88.2%
 *
 * @param year1ProductionKWh - First year production in kWh (before degradation)
 * @param electricityPriceEUR - Electricity price in EUR per kWh
 * @param annualDegradation - Annual degradation rate (0-1), e.g., 0.005 for 0.5%
 * @param systemLifeYears - System lifetime in years (default: 25)
 * @returns Object with totalSavingsEUR, totalProductionKWh, finalYearProductionPercent
 *
 * @example
 * // 4000 kWh first year, 0.18 EUR/kWh, 0.5% degradation, 25 years
 * calculate25YearReturn(4000, 0.18, 0.005, 25)
 * // Total production: ~92,800 kWh (not 100,000 due to degradation)
 * // Total savings: ~16,700 EUR
 */
/**
 * Calculate monthly production breakdown from monthly irradiance data.
 *
 * Uses the same formula as annual production but applied per-month:
 * monthlyProduction = monthlyPOA × panelArea × efficiency × (1 - losses)
 *
 * The seasonal pattern in production directly reflects the seasonal pattern
 * in POA irradiance - summer months have high POA and high production,
 * winter months have low POA and correspondingly low production.
 *
 * @param monthlyIrradiance - Array of monthly POA irradiance from IrradianceResult
 * @param panelAreaM2 - Total panel area in square meters
 * @param panelEfficiency - Panel efficiency as decimal (0-1)
 * @param systemLosses - System losses as decimal (0-1)
 * @returns Array of 12 monthly production values in kWh
 *
 * @example
 * // With 25 m² panels, 20% efficiency, 14% losses
 * calculateMonthlyProduction(monthlyIrradiance, 25, 0.20, 0.14)
 * // Returns: [{month: 1, kWh: 45.2}, {month: 2, kWh: 112.4}, ...]
 */
export function calculateMonthlyProduction(
  monthlyIrradiance: Array<{ month: number; ghi: number; poa: number }>,
  panelAreaM2: number,
  panelEfficiency: number = DEFAULT_SOLAR_CONFIG.panelEfficiency,
  systemLosses: number = DEFAULT_SOLAR_CONFIG.systemLosses
): Array<{ month: number; kWh: number }> {
  if (!monthlyIrradiance || monthlyIrradiance.length !== 12) {
    throw new Error('Monthly irradiance must contain exactly 12 months');
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

  // Calculate production for each month using the same formula as annual:
  // production = POA × area × efficiency × (1 - losses)
  return monthlyIrradiance.map((monthData) => {
    const monthlyProductionKWh =
      monthData.poa * panelAreaM2 * panelEfficiency * (1 - systemLosses);

    return {
      month: monthData.month,
      kWh: Math.round(monthlyProductionKWh * 100) / 100,
    };
  });
}

export function calculate25YearReturn(
  year1ProductionKWh: number,
  electricityPriceEUR: number = DEFAULT_SOLAR_CONFIG.electricityPriceEUR,
  annualDegradation: number = DEFAULT_SOLAR_CONFIG.annualDegradation,
  systemLifeYears: number = DEFAULT_SOLAR_CONFIG.systemLifeYears
): {
  totalSavingsEUR: number;
  totalProductionKWh: number;
  finalYearProductionPercent: number;
  yearlyBreakdown: Array<{ year: number; productionKWh: number; savingsEUR: number }>;
} {
  if (year1ProductionKWh < 0) {
    throw new Error('Year 1 production cannot be negative');
  }
  if (electricityPriceEUR <= 0) {
    throw new Error('Electricity price must be positive');
  }
  if (annualDegradation < 0 || annualDegradation >= 1) {
    throw new Error('Annual degradation must be between 0 and 1 (exclusive)');
  }
  if (systemLifeYears <= 0) {
    throw new Error('System life must be positive');
  }

  let totalProductionKWh = 0;
  let totalSavingsEUR = 0;
  const yearlyBreakdown: Array<{ year: number; productionKWh: number; savingsEUR: number }> = [];

  for (let year = 1; year <= systemLifeYears; year++) {
    // Production degrades each year: year1 × (1 - degradation)^(year-1)
    // Year 1 is 100%, Year 2 is 99.5%, etc.
    const degradationFactor = Math.pow(1 - annualDegradation, year - 1);
    const yearProductionKWh = year1ProductionKWh * degradationFactor;
    const yearSavingsEUR = yearProductionKWh * electricityPriceEUR;

    totalProductionKWh += yearProductionKWh;
    totalSavingsEUR += yearSavingsEUR;

    yearlyBreakdown.push({
      year,
      productionKWh: Math.round(yearProductionKWh * 100) / 100,
      savingsEUR: Math.round(yearSavingsEUR * 100) / 100,
    });
  }

  // Final year production as percentage of year 1
  const finalYearProductionPercent =
    Math.round(Math.pow(1 - annualDegradation, systemLifeYears - 1) * 10000) / 100;

  return {
    totalSavingsEUR: Math.round(totalSavingsEUR * 100) / 100,
    totalProductionKWh: Math.round(totalProductionKWh * 100) / 100,
    finalYearProductionPercent,
    yearlyBreakdown,
  };
}
