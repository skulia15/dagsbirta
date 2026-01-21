# Dagsbirta - Ralph Wiggum Execution Plan
## Optimized for Autonomous AI Development

---

## Pre-Flight Checklist (Manual - Do First)

Before running any Ralph loops, complete these manually:

```bash
[ ] 1. Create project directory
    mkdir dagsbirta && cd dagsbirta
    
[ ] 2. Initialize Next.js project
    npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir
    
[ ] 3. Install core dependencies
    npm install suncalc maplibre-gl recharts @react-pdf/renderer next-intl geotiff
    npm install -D @types/geotiff
    
[ ] 4. Download ÍslandsDEM data
    # Visit https://dem.lmi.is/mapview/?application=DEM
    # Download 10m resolution tiles for Iceland
    # Place in /data/dem/raw/
    
[ ] 5. Set up environment variables
    # .env.local
    NEXT_PUBLIC_MAPLIBRE_STYLE=https://tiles.openfreemap.org/styles/liberty
    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    
[ ] 6. Create Stripe account (if not exists)
    # https://dashboard.stripe.com/register
    
[ ] 7. Set up project structure
    mkdir -p src/lib/calculations
    mkdir -p src/lib/tiles  
    mkdir -p src/lib/pdf
    mkdir -p src/components/map
    mkdir -p src/components/controls
    mkdir -p src/components/visualizations
    mkdir -p src/components/results
    mkdir -p src/i18n
    mkdir -p data/dem/raw
    mkdir -p data/dem/tiles
```

---

## Execution Phases

### Phase 1: Data Foundation (Day 1-2)
**Run sequentially - T02 depends on T01**

#### T01: DEM Tile Processor
```bash
/ralph-loop "
TASK: Create DEM tile processor for ÍslandsDEM.

CONTEXT: Raw GeoTIFF files are in /data/dem/raw/. Need to convert to web-optimized tiles.

REQUIREMENTS:
1. Read GeoTIFF files using 'geotiff' npm package
2. Convert to Web Mercator (EPSG:3857) 
3. Generate tiles at zoom levels 10-14 (Iceland detail levels)
4. Output as PNG with elevation encoded: elevation = R*256 + G + B/256 - 32768
5. Save to /data/dem/tiles/{z}/{x}/{y}.png
6. Create /data/dem/tile-index.json with bounds and metadata

IMPLEMENTATION:
- Create script at scripts/process-dem.ts
- Use sharp for image processing
- Process in chunks to manage memory

TESTS:
- Run: npx ts-node scripts/process-dem.ts
- Verify tiles exist for Reykjavík area (zoom 12)
- Spot check elevation values match source

OUTPUT <promise>T01_TILES_DONE</promise> when complete.
" --max-iterations 30
```

#### T02: Tile API Route
```bash
/ralph-loop "
TASK: Create Next.js API route to serve DEM tiles.

DEPENDS ON: T01 complete (tiles exist in /data/dem/tiles/)

FILE: src/app/api/tiles/[z]/[x]/[y]/route.ts

REQUIREMENTS:
1. Serve PNG tiles from /data/dem/tiles/
2. Return 404 for missing tiles (ocean areas)
3. Set cache headers: Cache-Control: public, max-age=31536000, immutable
4. Handle CORS

IMPLEMENTATION:
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { z: string; x: string; y: string } }
) {
  // Implementation here
}

TESTS:
- GET /api/tiles/12/1135/618 returns PNG (Reykjavík area)
- GET /api/tiles/12/0/0 returns 404
- Response has correct cache headers

OUTPUT <promise>T02_TILE_API_DONE</promise> when tests pass.
" --max-iterations 15
```

---

### Phase 2: Calculation Engine (Day 3-5)
**T03, T04 can run in parallel. T05 depends on both.**

#### T03: Horizon Calculator
```bash
/ralph-loop "
TASK: Implement terrain horizon calculator.

FILE: src/lib/calculations/horizon.ts

TYPE DEFINITIONS:
interface HorizonPoint {
  azimuth: number;        // 0-360 degrees, 0=North
  elevationAngle: number; // degrees above horizontal
  distance: number;       // km to horizon point
}

interface HorizonProfile {
  location: { lat: number; lng: number; elevation: number };
  profile: HorizonPoint[];
  computedAt: Date;
}

REQUIREMENTS:
1. Export: getHorizonProfile(lat: number, lng: number, options?: { radiusKm?: number; resolution?: number }) => Promise<HorizonProfile>
2. Load DEM tile data for area around point
3. For each azimuth (0-359 at resolution intervals, default 1°):
   - Trace ray outward up to radiusKm (default 30km)
   - Sample elevation every 100m
   - Calculate angle: Math.atan2(elevation - viewerElevation, distance)
   - Track maximum angle
4. Return sorted profile array

HELPER FUNCTIONS NEEDED:
- getTileForCoordinate(lat, lng, zoom) => {x, y, z}
- getElevationAtPoint(lat, lng) => number
- traceRay(origin, azimuth, maxDistance) => {maxAngle, distance}

EDGE CASES:
- Ocean (no tile): return 0° elevation
- Viewer on peak: may have negative angles (looking down)
- Iceland bounds check: 63.3-66.5°N, -24.5 to -13.5°W

TESTS:
- Reykjavík (64.1466, -21.9426): Esja shows ~15-20° to north
- Coastal point: ~0° toward ocean
- Performance: < 2 seconds for 1° resolution, 30km radius

OUTPUT <promise>T03_HORIZON_DONE</promise> when all tests pass.
" --max-iterations 35
```

#### T04: Sun Position Engine
```bash
/ralph-loop "
TASK: Implement sun position calculations using SunCalc.

FILE: src/lib/calculations/sun.ts

REQUIREMENTS:
1. npm package 'suncalc' is already installed
2. Export getSunPosition(lat, lng, date) => SunPosition
3. Export getSunPath(lat, lng, date, intervalMinutes?) => SunPath

TYPE DEFINITIONS:
interface SunPosition {
  altitude: number;   // degrees above horizon
  azimuth: number;    // degrees from north
  date: Date;
}

interface SunPath {
  date: Date;
  positions: SunPosition[];
  sunrise: Date | null;    // null if midnight sun or polar night
  sunset: Date | null;
  solarNoon: Date;
  dayLengthHours: number;
  isMidnightSun: boolean;
  isPolarNight: boolean;
}

IMPLEMENTATION:
import SunCalc from 'suncalc';

// SunCalc returns azimuth in radians from south, convert to degrees from north
// SunCalc returns altitude in radians, convert to degrees

ICELAND EDGE CASES (64-66°N):
- Summer solstice: ~21 hours daylight, sun barely sets
- Winter solstice: ~4 hours daylight
- Above Arctic Circle (66°N): true midnight sun/polar night possible
- Flag these conditions in response

TESTS:
- Summer solstice Reykjavík (June 21): dayLength > 20 hours
- Winter solstice Reykjavík (Dec 21): dayLength < 5 hours
- Solar noon altitude summer: ~47-50°
- Solar noon altitude winter: ~3-6°

OUTPUT <promise>T04_SUN_DONE</promise> when tests pass.
" --max-iterations 15
```

#### T05: Shadow Intersection
```bash
/ralph-loop "
TASK: Calculate if sun is visible given horizon profile.

FILE: src/lib/calculations/shadow.ts

DEPENDS ON: T03 (HorizonProfile type), T04 (SunPosition type)

REQUIREMENTS:
1. Export isSunVisible(horizonProfile, sunPosition) => ShadowResult
2. Interpolate horizon at sun's azimuth
3. Compare sun altitude to horizon altitude

TYPE DEFINITION:
interface ShadowResult {
  isVisible: boolean;
  sunAltitude: number;
  horizonAltitude: number;
  margin: number;  // degrees above/below horizon
}

IMPLEMENTATION:
function getHorizonAtAzimuth(profile: HorizonPoint[], azimuth: number): number {
  // Find two nearest points and interpolate
  // Handle wraparound at 0/360
}

function isSunVisible(horizon: HorizonProfile, sun: SunPosition): ShadowResult {
  const horizonAlt = getHorizonAtAzimuth(horizon.profile, sun.azimuth);
  const margin = sun.altitude - horizonAlt;
  return {
    isVisible: margin > 0.25,  // 0.25° accounts for solar disc
    sunAltitude: sun.altitude,
    horizonAltitude: horizonAlt,
    margin
  };
}

TESTS:
- Sun at 30°, horizon at 10° → visible, margin = 20
- Sun at 5°, horizon at 10° → not visible, margin = -5
- Azimuth interpolation works across 0/360 boundary

OUTPUT <promise>T05_SHADOW_DONE</promise> when tests pass.
" --max-iterations 15
```

---

### Phase 3: Aggregation (Day 5-6)
**Run sequentially**

#### T06: Daily Sunlight Calculator
```bash
/ralph-loop "
TASK: Calculate total sunlight hours for a single day.

FILE: src/lib/calculations/daily.ts

DEPENDS ON: T03, T04, T05

REQUIREMENTS:
1. Export getDailySunlight(lat, lng, date, horizonProfile) => DailySunlight
2. Get sun path for the day (5-minute intervals)
3. Check visibility at each point
4. Sum visible intervals

TYPE DEFINITION:
interface DailySunlight {
  date: Date;
  location: { lat: number; lng: number };
  totalHours: number;
  theoreticalHours: number;  // without terrain
  reductionHours: number;
  reductionPercent: number;
  terrainSunrise: Date | null;   // when sun clears terrain
  terrainSunset: Date | null;    // when sun goes behind terrain
  astronomicalSunrise: Date | null;
  astronomicalSunset: Date | null;
  intervals: Array<{
    time: Date;
    isVisible: boolean;
    sunAltitude: number;
  }>;
}

CALCULATION:
- Sample every 5 minutes (288 samples per day)
- Each visible interval = 5/60 = 0.0833 hours
- totalHours = visibleCount * 0.0833

TESTS:
- Flat terrain (all 0° horizon): totalHours ≈ theoreticalHours
- Summer day: more hours than winter
- Valley location: fewer hours than flat

OUTPUT <promise>T06_DAILY_DONE</promise> when tests pass.
" --max-iterations 20
```

#### T07: Monthly Aggregator
```bash
/ralph-loop "
TASK: Calculate monthly and annual sunlight summaries.

FILE: src/lib/calculations/monthly.ts

DEPENDS ON: T06

REQUIREMENTS:
1. Export getMonthlySunlight(lat, lng, horizonProfile, month, year) => MonthlySunlight
2. Export getAnnualSunlight(lat, lng, horizonProfile, year) => AnnualSunlight
3. Sample 4 days per month: 1st, 8th, 15th, 22nd
4. Average and extrapolate

TYPE DEFINITIONS:
interface MonthlySunlight {
  month: number;  // 1-12
  monthName: string;
  year: number;
  averageDailyHours: number;
  totalHours: number;
  theoreticalHours: number;
  reductionPercent: number;
}

interface AnnualSunlight {
  year: number;
  months: MonthlySunlight[];
  totalHours: number;
  averageDailyHours: number;
  theoreticalTotalHours: number;
  reductionPercent: number;
}

TESTS:
- June average > December average
- Annual total: 1400-1800 hours (Iceland range)
- All 12 months present

OUTPUT <promise>T07_MONTHLY_DONE</promise> when tests pass.
" --max-iterations 20
```

#### T08: Irradiance Calculator
```bash
/ralph-loop "
TASK: Convert sunlight hours to solar energy potential.

FILE: src/lib/calculations/irradiance.ts

DEPENDS ON: T07

REQUIREMENTS:
1. Export getIrradiance(lat, lng, annualSunlight, options?) => IrradianceResult
2. Calculate GHI (Global Horizontal Irradiance)
3. Calculate POA (Plane of Array) for tilted panels
4. Find optimal tilt angle

CONSTANTS:
const SOLAR_CONSTANT = 1361;  // W/m² outside atmosphere
const CLEAR_SKY_FACTOR = 0.75; // atmospheric losses
const ICELAND_CLOUD_FACTOR = 0.45; // Iceland is cloudy

FORMULAS:
// Average irradiance during sunlight hours depends on sun altitude
// Higher sun = more direct = more W/m²
// Iceland summer noon: ~800 W/m²
// Iceland winter noon: ~200 W/m²

// Monthly GHI = sunlightHours * averageIrradiance * cloudFactor
// POA = GHI * tiltBoost (typically 1.1-1.3 for optimal tilt)

TYPE DEFINITION:
interface IrradianceResult {
  annualGHI: number;        // kWh/m²/year
  annualPOA: number;        // kWh/m²/year at optimal tilt
  optimalTiltAngle: number; // degrees
  monthlyIrradiance: Array<{
    month: number;
    ghi: number;
    poa: number;
  }>;
}

EXPECTED VALUES (Iceland):
- Annual GHI: 700-900 kWh/m²/year
- Annual POA (tilted): 800-1000 kWh/m²/year
- Optimal tilt: ~60-65° (close to latitude)

OUTPUT <promise>T08_IRRADIANCE_DONE</promise> when tests pass.
" --max-iterations 25
```

#### T09: Solar Panel ROI
```bash
/ralph-loop "
TASK: Calculate solar panel system economics.

FILE: src/lib/calculations/solar-roi.ts

DEPENDS ON: T08

REQUIREMENTS:
1. Export getSolarROI(irradianceResult, options?) => SolarROIResult
2. Calculate annual production
3. Calculate financial returns
4. Assess viability

CONSTANTS:
const DEFAULTS = {
  systemSizeKW: 5,
  panelEfficiency: 0.20,      // 20%
  systemLosses: 0.14,         // inverter, wiring, etc.
  installCostPerKW: 1500,     // EUR
  electricityPrice: 0.18,     // EUR/kWh Iceland
  annualDegradation: 0.005,   // 0.5% per year
  systemLifeYears: 25,
};

FORMULAS:
panelAreaM2 = systemSizeKW * 1000 / (panelEfficiency * 1000) = systemSizeKW / panelEfficiency
annualProductionKWh = POA * panelAreaM2 * panelEfficiency * (1 - systemLosses)
annualSavingsEUR = annualProductionKWh * electricityPrice
paybackYears = (systemSizeKW * installCostPerKW) / annualSavingsEUR

// 25-year return with degradation
totalReturn = sum of (annualSavings * (1 - degradation)^year) for year 1-25

TYPE DEFINITION:
interface SolarROIResult {
  systemSizeKW: number;
  panelAreaM2: number;
  annualProductionKWh: number;
  monthlyProduction: Array<{ month: number; kWh: number }>;
  annualSavingsEUR: number;
  installCostEUR: number;
  paybackYears: number;
  return25Year: number;
  roiPercent: number;
  isViable: boolean;      // payback < 15 years
  viabilityRating: 'excellent' | 'good' | 'marginal' | 'poor';
}

TESTS:
- 5kW system: 3,500-4,500 kWh/year production
- Payback: 8-15 years typical
- Valley location: longer payback than sunny location

OUTPUT <promise>T09_SOLAR_ROI_DONE</promise> when tests pass.
" --max-iterations 20
```

---

### Phase 4: API Layer (Day 6-7)

#### T10: Main Analysis Endpoint
```bash
/ralph-loop "
TASK: Create the main analysis API endpoint.

FILE: src/app/api/analyze/route.ts

DEPENDS ON: T03-T09 (all calculation modules)

REQUIREMENTS:
1. POST /api/analyze
2. Orchestrate all calculations
3. Return comprehensive response
4. Support free/paid tiers

REQUEST BODY:
{
  lat: number;
  lng: number;
  date?: string;          // ISO date, default today
  includeAnnual?: boolean; // requires paid tier
  includeSolarROI?: boolean; // requires paid tier
  systemSizeKW?: number;   // for solar calc
  tier?: 'free' | 'paid';  // from auth/payment check
}

RESPONSE:
{
  location: { lat, lng, elevation, address? },
  horizonProfile: HorizonProfile,
  sunPath: SunPath,
  dailySunlight: DailySunlight,
  // Paid tier only:
  monthlySunlight?: MonthlySunlight[],
  annualSunlight?: AnnualSunlight,
  irradiance?: IrradianceResult,
  solarROI?: SolarROIResult,
  meta: {
    calculatedAt: string,
    processingTimeMs: number,
    tier: 'free' | 'paid'
  }
}

VALIDATION:
- Coordinates within Iceland bounds
- Date is valid ISO string
- Return 400 for invalid input

FREE TIER LIMITS:
- horizonProfile resolution: 10° (not 1°)
- Only today's date
- No annual/monthly
- No solar ROI

CACHING:
- Cache horizon profile for 24 hours (expensive to compute)
- Key: lat/lng rounded to 4 decimals

TESTS:
- Valid request returns complete response
- Invalid coordinates return 400
- Free tier excludes premium fields
- Response time < 5000ms

OUTPUT <promise>T10_API_DONE</promise> when tests pass.
" --max-iterations 30
```

---

### Phase 5-7: Frontend (Day 8-14)
**Better done interactively - design decisions needed**

See RALPH_PROMPTS.md for T11-T21 prompts. These are less suited for fully autonomous execution due to UI/UX decisions.

Recommended approach:
1. Run T11 (Map) and T12 (Address Search) with Ralph
2. Do T13-T16 (Controls) interactively 
3. Run T17-T19 (Charts) with Ralph
4. Do T20-T21 (Dashboard) interactively

---

### Phase 8: Monetization (Day 15-17)

#### T22: Tier Logic
```bash
/ralph-loop "
TASK: Implement free vs paid tier gating.

FILES:
- src/lib/tiers.ts
- src/components/PayWall.tsx

REQUIREMENTS:
1. Check payment status
2. Gate premium features
3. Show upgrade prompts

TIER DEFINITIONS:
const FREE_TIER = {
  horizonResolution: 10,     // degrees
  dateAccess: 'today',       // only current date
  includeMonthly: false,
  includeAnnual: false,
  includeSolarROI: false,
  includePDF: false,
};

const PAID_TIER = {
  horizonResolution: 1,
  dateAccess: 'any',
  includeMonthly: true,
  includeAnnual: true,
  includeSolarROI: true,
  includePDF: true,
};

IMPLEMENTATION:
- Store payment status in localStorage after Stripe success
- Check on page load and API requests
- PayWall component shows when accessing premium feature

OUTPUT <promise>T22_TIERS_DONE</promise> when tests pass.
" --max-iterations 15
```

#### T23: Stripe Integration
```bash
/ralph-loop "
TASK: Implement Stripe Checkout.

FILES:
- src/app/api/checkout/route.ts
- src/app/api/webhook/route.ts
- src/lib/stripe.ts

REQUIREMENTS:
1. Create Checkout session
2. Handle webhook for completed payment
3. Update user payment status

CHECKOUT ENDPOINT (POST /api/checkout):
- Create Stripe Checkout session
- Return session URL
- Include lat/lng as metadata

WEBHOOK ENDPOINT (POST /api/webhook):
- Verify Stripe signature
- Handle checkout.session.completed
- Extract location from metadata
- Generate and store report access token

ENV VARS NEEDED:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

TESTS:
- Checkout creates valid session
- Webhook validates signature
- Invalid signature returns 400

OUTPUT <promise>T23_STRIPE_DONE</promise> when tests pass.
" --max-iterations 25
```

#### T24: PDF Report
```bash
/ralph-loop "
TASK: Generate PDF report.

FILES:
- src/lib/pdf/ReportDocument.tsx
- src/app/api/report/route.ts

REQUIREMENTS:
1. Use @react-pdf/renderer
2. Include all analysis data
3. Professional layout

PDF SECTIONS:
1. Header with logo, date, location
2. Executive Summary
   - Location name/coords
   - Annual sunlight hours
   - Solar panel viability rating
3. Sunlight Analysis
   - Monthly hours chart (as image)
   - Daily pattern description
4. Horizon Profile (as image)
5. Solar Panel Analysis
   - System recommendation
   - Production estimate
   - Financial breakdown
6. Methodology note
7. Disclaimer

API ENDPOINT:
GET /api/report?lat=X&lng=Y&token=X
- Verify payment token
- Generate PDF
- Return as download

TESTS:
- PDF generates without error
- All sections present
- File size < 2MB

OUTPUT <promise>T24_PDF_DONE</promise> when tests pass.
" --max-iterations 30
```

---

### Phase 9: Polish (Day 18-21)

#### T25: i18n
```bash
/ralph-loop "
TASK: Implement internationalization.

FILES:
- src/i18n/en.json
- src/i18n/is.json
- src/middleware.ts
- src/components/LanguageSwitch.tsx

REQUIREMENTS:
1. Use next-intl
2. Support /en and /is routes
3. All UI text translated

KEY TRANSLATIONS:
{
  "app.title": "Dagsbirta" / "Dagsbirta",
  "app.tagline": "Know your sunlight" / "Þekktu sólskinið þitt",
  "search.placeholder": "Enter address..." / "Sláðu inn heimilisfang...",
  "results.sunlightHours": "Hours of sunlight" / "Sólskinsstundir",
  "results.monthlyBreakdown": "Monthly breakdown" / "Mánaðarleg sundurliðun",
  "solar.title": "Solar Panel Analysis" / "Sólarsellsgreining",
  "solar.payback": "Payback period" / "Endurgreiðslutími",
  "cta.upgrade": "Get Full Report" / "Fáðu fulla skýrslu",
  // ... more
}

TESTS:
- /en route shows English
- /is route shows Icelandic
- Language switch works
- All visible text translated

OUTPUT <promise>T25_I18N_DONE</promise> when tests pass.
" --max-iterations 20
```

---

## Execution Commands Summary

Run these in order (copy-paste ready):

```bash
# Phase 1: Data Foundation
/ralph-loop "T01..." --max-iterations 30  # DEM Processor
/ralph-loop "T02..." --max-iterations 15  # Tile API

# Phase 2: Calculation Engine (T03/T04 can run parallel)
/ralph-loop "T03..." --max-iterations 35  # Horizon
/ralph-loop "T04..." --max-iterations 15  # Sun
/ralph-loop "T05..." --max-iterations 15  # Shadow

# Phase 3: Aggregation
/ralph-loop "T06..." --max-iterations 20  # Daily
/ralph-loop "T07..." --max-iterations 20  # Monthly
/ralph-loop "T08..." --max-iterations 25  # Irradiance
/ralph-loop "T09..." --max-iterations 20  # Solar ROI

# Phase 4: API
/ralph-loop "T10..." --max-iterations 30  # Main Endpoint

# Phase 5-7: Frontend (mix of Ralph + interactive)
# See RALPH_PROMPTS.md

# Phase 8: Monetization
/ralph-loop "T22..." --max-iterations 15  # Tiers
/ralph-loop "T23..." --max-iterations 25  # Stripe
/ralph-loop "T24..." --max-iterations 30  # PDF

# Phase 9: Polish
/ralph-loop "T25..." --max-iterations 20  # i18n
```

---

## Progress Tracking

Copy this checklist to track completion:

```
PHASE 1: DATA FOUNDATION
[ ] T01: DEM Tile Processor      - <promise>T01_TILES_DONE</promise>
[ ] T02: Tile API Route          - <promise>T02_TILE_API_DONE</promise>

PHASE 2: CALCULATION ENGINE
[ ] T03: Horizon Calculator      - <promise>T03_HORIZON_DONE</promise>
[ ] T04: Sun Position Engine     - <promise>T04_SUN_DONE</promise>
[ ] T05: Shadow Intersection     - <promise>T05_SHADOW_DONE</promise>

PHASE 3: AGGREGATION
[ ] T06: Daily Sunlight          - <promise>T06_DAILY_DONE</promise>
[ ] T07: Monthly Aggregator      - <promise>T07_MONTHLY_DONE</promise>
[ ] T08: Irradiance Calculator   - <promise>T08_IRRADIANCE_DONE</promise>
[ ] T09: Solar Panel ROI         - <promise>T09_SOLAR_ROI_DONE</promise>

PHASE 4: API
[ ] T10: Analysis Endpoint       - <promise>T10_API_DONE</promise>

PHASE 5-7: FRONTEND
[ ] T11: Map Component           - <promise>T11_MAP_DONE</promise>
[ ] T12: Address Search          - <promise>T12_ADDRESS_DONE</promise>
[ ] T13: Location Picker         - <promise>T13_PICKER_DONE</promise>
[ ] T14: Time Slider             - <promise>T14_TIME_DONE</promise>
[ ] T15: Date Picker             - <promise>T15_DATE_DONE</promise>
[ ] T16: Control Panel           - <promise>T16_CONTROLS_DONE</promise>
[ ] T17: Sun Path Diagram        - <promise>T17_SUNPATH_DONE</promise>
[ ] T18: Horizon Chart           - <promise>T18_HORIZON_VIZ_DONE</promise>
[ ] T19: Monthly Chart           - <promise>T19_MONTHLY_VIZ_DONE</promise>
[ ] T20: Daily Timeline          - <promise>T20_TIMELINE_DONE</promise>
[ ] T21: Solar Panel Card        - <promise>T21_SOLAR_CARD_DONE</promise>

PHASE 8: MONETIZATION
[ ] T22: Tier Logic              - <promise>T22_TIERS_DONE</promise>
[ ] T23: Stripe Integration      - <promise>T23_STRIPE_DONE</promise>
[ ] T24: PDF Report              - <promise>T24_PDF_DONE</promise>

PHASE 9: POLISH
[ ] T25: i18n                    - <promise>T25_I18N_DONE</promise>
[ ] T26: Landing Page            - <promise>T26_LANDING_DONE</promise>
[ ] T27: Responsive Design       - <promise>T27_RESPONSIVE_DONE</promise>
```

---

## Troubleshooting

If a task gets stuck:

1. **Check max-iterations**: Increase if task is complex
2. **Check dependencies**: Ensure prior tasks completed
3. **Cancel and retry**: `/cancel-ralph` then re-run with refined prompt
4. **Add guardrails**: Include "if stuck after 15 iterations, document blockers"

Common issues:
- **DEM loading fails**: Check file paths, tile format
- **Sun calculations wrong**: Verify SunCalc azimuth conversion (radians to degrees, south to north)
- **API timeout**: Add caching, reduce horizon resolution for testing
