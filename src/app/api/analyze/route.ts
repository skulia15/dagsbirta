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
    tierRestrictions?: {
      dateOverridden: boolean;
      annualDisabled: boolean;
      solarROIDisabled: boolean;
      horizonResolution: number;
    };
  };
}

// Standard error response interface
interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Create a standardized error response
 */
function createErrorResponse(
  error: string,
  code: string,
  status: number,
  details?: unknown
): NextResponse<ErrorResponse> {
  const body: ErrorResponse = { error, code };
  if (details !== undefined) {
    body.details = details;
  }
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
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
    return createErrorResponse(
      'Invalid JSON in request body',
      'INVALID_JSON',
      400
    );
  }

  // Type guard for body
  if (!body || typeof body !== 'object') {
    return createErrorResponse(
      'Request body must be an object',
      'INVALID_BODY',
      400
    );
  }

  const requestBody = body as Record<string, unknown>;

  // Validate coordinates are valid numbers
  const coordError = validateCoordinates(requestBody.lat, requestBody.lng);
  if (coordError) {
    return createErrorResponse(
      coordError,
      'INVALID_COORDINATES',
      400
    );
  }

  const lat = requestBody.lat as number;
  const lng = requestBody.lng as number;

  // Validate coordinates are within Iceland (404 for valid coords outside Iceland)
  if (!isWithinIceland(lat, lng)) {
    return createErrorResponse(
      'Location is outside Iceland',
      'LOCATION_NOT_FOUND',
      404,
      {
        bounds: ICELAND_BOUNDS,
        provided: { lat, lng },
      }
    );
  }

  // Validate date if provided
  const dateError = validateDateString(requestBody.date);
  if (dateError) {
    return createErrorResponse(
      dateError,
      'INVALID_DATE',
      400
    );
  }

  // Validate systemSizeKW if provided
  if (requestBody.systemSizeKW !== undefined) {
    if (!isValidNumber(requestBody.systemSizeKW)) {
      return createErrorResponse(
        'systemSizeKW must be a valid number',
        'INVALID_SYSTEM_SIZE',
        400
      );
    }
    if (requestBody.systemSizeKW <= 0 || requestBody.systemSizeKW > 100) {
      return createErrorResponse(
        'systemSizeKW must be between 0 and 100',
        'INVALID_SYSTEM_SIZE',
        400,
        { provided: requestBody.systemSizeKW, valid_range: '0 < systemSizeKW <= 100' }
      );
    }
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

  // T10-7: Implement tier logic
  // Free tier restrictions:
  //   - Today only (no custom dates)
  //   - 10° horizon resolution (vs 1° for paid)
  //   - No annual/ROI calculations (forced to false)
  // Paid tier: full access to all features

  // For free tier, force date to today (ignore provided date)
  const effectiveDate: Date = tier === 'free' ? new Date() : (
    validatedRequest.date ? new Date(validatedRequest.date) : new Date()
  );

  // For free tier, force annual and ROI flags to false
  const effectiveIncludeAnnual: boolean = tier === 'paid' && (validatedRequest.includeAnnual ?? false);
  const effectiveIncludeSolarROI: boolean = tier === 'paid' && (validatedRequest.includeSolarROI ?? false);

  // Wrap calculations in try/catch for unexpected errors
  try {
    // T10-3: Calculate horizon profile
    let horizonProfile: HorizonProfile;
    try {
      horizonProfile = await getHorizonProfile(
        validatedRequest.lat,
        validatedRequest.lng,
        {
          // For free tier, use lower resolution (10° instead of 1°)
          // Full resolution will be implemented in T10-7 (tier logic)
          angularResolution: tier === 'free' ? 10 : 1,
        }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return createErrorResponse(
        'Failed to compute horizon profile',
        'HORIZON_CALCULATION_ERROR',
        500,
        errorMessage
      );
    }

    // T10-4: Calculate sun path and daily sunlight
    // Use effectiveDate which respects tier restrictions
    const analysisDate = effectiveDate;

    // Get sun path for the day
    const sunPath = getSunPath(
      validatedRequest.lat,
      validatedRequest.lng,
      analysisDate
    );

    // Calculate daily sunlight accounting for terrain
    const dailySunlight = getDailySunlight(
      validatedRequest.lat,
      validatedRequest.lng,
      analysisDate,
      horizonProfile
    );

    // T10-5: Add monthly/annual calculations if includeAnnual flag is set
    // Note: Tier restrictions enforced via effectiveIncludeAnnual (free tier always false)
    let annualSunlight: AnnualSunlight | undefined;
    let irradiance: IrradianceResult | undefined;

    if (effectiveIncludeAnnual) {
      // Get the year from the analysis date
      const year = analysisDate.getFullYear();

      // Calculate annual sunlight (aggregates monthly data)
      annualSunlight = getAnnualSunlight(
        validatedRequest.lat,
        validatedRequest.lng,
        horizonProfile,
        year
      );

      // Calculate irradiance from annual sunlight data
      irradiance = getIrradiance(
        validatedRequest.lat,
        validatedRequest.lng,
        annualSunlight
      );
    }

    // T10-6: Add solar ROI calculations if includeSolarROI flag is set
    // Note: Solar ROI requires irradiance data, which requires includeAnnual to be true
    // Note: Tier restrictions enforced via effectiveIncludeSolarROI (free tier always false)
    let solarROI: SolarROIResult | undefined;

    if (effectiveIncludeSolarROI && irradiance) {
      solarROI = getSolarROI(irradiance, {
        systemSizeKW: validatedRequest.systemSizeKW,
      });
    }

    // Build response (further processing in T10-7 through T10-9)
    // T10-7: Include tier restriction details for free tier
    const tierRestrictions = tier === 'free' ? {
      dateOverridden: validatedRequest.date !== undefined,  // true if user provided a date but it was ignored
      annualDisabled: validatedRequest.includeAnnual === true,  // true if user requested annual but was denied
      solarROIDisabled: validatedRequest.includeSolarROI === true,  // true if user requested ROI but was denied
      horizonResolution: 10,  // free tier uses 10° resolution
    } : undefined;

    const response: AnalyzeResponse = {
      location: { lat: validatedRequest.lat, lng: validatedRequest.lng },
      horizonProfile,
      sunPath,
      dailySunlight,
      annualSunlight,
      irradiance,
      solarROI,
      meta: {
        calculatedAt: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime,
        tier,
        tierRestrictions,
      },
    };

    return NextResponse.json(response, {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    // Catch any unexpected errors during calculation
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(
      'Internal server error during analysis',
      'INTERNAL_ERROR',
      500,
      errorMessage
    );
  }
}
