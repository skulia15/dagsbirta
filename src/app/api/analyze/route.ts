/**
 * Sunlight Analysis API Route for Dagsbirta
 *
 * Orchestrates all calculation modules to provide comprehensive
 * sunlight and solar analysis for locations in Iceland.
 *
 * Routes:
 *   POST /api/analyze - Analyze sunlight for a location
 *
 * Request body:
 *   - lat: number (latitude, must be within Iceland)
 *   - lng: number (longitude, must be within Iceland)
 *   - date?: string (ISO date for daily analysis, defaults to today)
 *   - includeAnnual?: boolean (include monthly/annual aggregations)
 *   - includeSolarROI?: boolean (include solar panel ROI calculations)
 *   - systemSizeKW?: number (solar system size for ROI, default 5kW)
 *   - tier?: 'free' | 'paid' (access tier, defaults to 'free')
 */

import { NextRequest, NextResponse } from 'next/server';

// Constants
import { ICELAND_BOUNDS, SOLAR_CONSTANTS, CALCULATION_CONFIG } from '@/lib/constants';

// Types
import type {
  HorizonProfile,
  SunPath,
  DailySunlight,
  AnnualSunlight,
  IrradianceResult,
  SolarROIResult,
} from '@/types/index';

// Calculation modules
import { getHorizonProfile } from '@/lib/calculations/horizon';
import { getSunPosition, getSunPath } from '@/lib/calculations/sun';
import { isSunVisible } from '@/lib/calculations/shadow';
import { getDailySunlight } from '@/lib/calculations/daily';
import { getMonthlySunlight, getAnnualSunlight } from '@/lib/calculations/monthly';
import { getIrradiance } from '@/lib/calculations/irradiance';
import { getSolarROI } from '@/lib/calculations/solar-roi';

// Request body interface
interface AnalyzeRequest {
  lat: number;
  lng: number;
  date?: string;
  includeAnnual?: boolean;
  includeSolarROI?: boolean;
  systemSizeKW?: number;
  tier?: 'free' | 'paid';
}

// Response interface
interface AnalyzeResponse {
  location: { lat: number; lng: number };
  horizonProfile?: HorizonProfile;
  sunPath?: SunPath;
  dailySunlight?: DailySunlight;
  annualSunlight?: AnnualSunlight;
  irradiance?: IrradianceResult;
  solarROI?: SolarROIResult;
  meta: {
    calculatedAt: string;
    processingTimeMs: number;
    tier: 'free' | 'paid';
  };
}

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Handle OPTIONS preflight requests for CORS
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Validate that a value is a finite number
 */
function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate that coordinates are valid numbers
 * Returns error message if invalid, null if valid
 */
function validateCoordinates(lat: unknown, lng: unknown): string | null {
  if (lat === undefined || lat === null) {
    return 'lat is required';
  }
  if (lng === undefined || lng === null) {
    return 'lng is required';
  }
  if (!isValidNumber(lat)) {
    return 'lat must be a valid number';
  }
  if (!isValidNumber(lng)) {
    return 'lng must be a valid number';
  }
  if (lat < -90 || lat > 90) {
    return 'lat must be between -90 and 90';
  }
  if (lng < -180 || lng > 180) {
    return 'lng must be between -180 and 180';
  }
  return null;
}

/**
 * Check if coordinates are within Iceland bounds
 */
function isWithinIceland(lat: number, lng: number): boolean {
  return (
    lat >= ICELAND_BOUNDS.south &&
    lat <= ICELAND_BOUNDS.north &&
    lng >= ICELAND_BOUNDS.west &&
    lng <= ICELAND_BOUNDS.east
  );
}

/**
 * Validate ISO date string
 * Returns error message if invalid, null if valid
 */
function validateDateString(dateStr: unknown): string | null {
  if (dateStr === undefined || dateStr === null) {
    return null; // date is optional
  }
  if (typeof dateStr !== 'string') {
    return 'date must be a string';
  }
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) {
    return 'date must be a valid ISO date string';
  }
  return null;
}

/**
 * POST /api/analyze
 *
 * Main analysis endpoint - orchestrates all calculation modules.
 * T10-2: Request validation implemented
 * T10-3 through T10-9: Additional features to be implemented
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Type guard for body
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Request body must be an object' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const requestBody = body as Record<string, unknown>;

  // Validate coordinates are valid numbers
  const coordError = validateCoordinates(requestBody.lat, requestBody.lng);
  if (coordError) {
    return NextResponse.json(
      { error: coordError },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const lat = requestBody.lat as number;
  const lng = requestBody.lng as number;

  // Validate coordinates are within Iceland (404 for valid coords outside Iceland)
  if (!isWithinIceland(lat, lng)) {
    return NextResponse.json(
      {
        error: 'Location is outside Iceland',
        bounds: ICELAND_BOUNDS,
        provided: { lat, lng },
      },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  // Validate date if provided
  const dateError = validateDateString(requestBody.date);
  if (dateError) {
    return NextResponse.json(
      { error: dateError },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Parse validated request
  const validatedRequest: AnalyzeRequest = {
    lat,
    lng,
    date: requestBody.date as string | undefined,
    includeAnnual: requestBody.includeAnnual === true,
    includeSolarROI: requestBody.includeSolarROI === true,
    systemSizeKW:
      typeof requestBody.systemSizeKW === 'number' ? requestBody.systemSizeKW : 5,
    tier: requestBody.tier === 'paid' ? 'paid' : 'free',
  };

  // Determine tier (default to 'free')
  const tier: 'free' | 'paid' = validatedRequest.tier ?? 'free';

  // Build response (further processing in T10-3 through T10-9)
  const response: AnalyzeResponse = {
    location: { lat: validatedRequest.lat, lng: validatedRequest.lng },
    meta: {
      calculatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
      tier,
    },
  };

  return NextResponse.json(response, {
    status: 200,
    headers: CORS_HEADERS,
  });
}
