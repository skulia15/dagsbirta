/**
 * Monthly and Annual Sunlight Aggregator for Dagsbirta
 *
 * Aggregates daily sunlight calculations into monthly and annual summaries.
 * This enables long-term analysis for solar panel planning and seasonal
 * sunlight patterns at specific locations in Iceland.
 */

import type { MonthlySunlight, AnnualSunlight, HorizonProfile } from '../../types/index';
import { getDailySunlight } from './daily';
