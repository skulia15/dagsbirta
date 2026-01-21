# Dagsbirta / Ljósvaki
## Iceland Property Sunlight Analysis Platform

**Complete Product Specification & Ralph Wiggum Task Breakdown**

---

## Executive Summary

### Product Vision
A web application that helps property buyers in Iceland understand sunlight conditions at any location, accounting for terrain shadows, and evaluate solar panel viability.

### Names Under Consideration
- **Dagsbirta** ("Daylight") - Descriptive, professional
- **Ljósvaki** ("Light watcher") - Poetic, unique

### Core Value Proposition
> "Know your sunlight before you buy. Dagsbirta analyzes terrain shadows for any Icelandic address and shows you exactly how much sunlight you'll get—month by month, hour by hour—plus whether solar panels make financial sense."

### Target Market
- Icelandic home buyers
- Foreign property investors
- Real estate agents (B2B potential)

### Business Model
- Freemium: Limited analysis free, full report paid
- Price: TBD (€15-30 suggested range)

---

## Feature Specification

### MVP Features (3-Week Target)

#### Tier 1: Core Calculation Engine
| Feature | Description | Priority |
|---------|-------------|----------|
| Horizon Calculation | 360° terrain scan from DEM | P0 |
| Sun Position Engine | SunCalc integration for any date/time | P0 |
| Shadow Intersection | Compare sun altitude vs horizon | P0 |
| Monthly Aggregation | Calculate hours per month | P0 |
| Annual Summary | Total yearly sunlight hours | P0 |

#### Tier 2: User Interface
| Feature | Description | Priority |
|---------|-------------|----------|
| Map Interface | MapLibre GL with Iceland focus | P0 |
| Address Search | Staðfangaskrá API integration | P0 |
| Point Selection | Click to analyze any location | P0 |
| Time Slider | Drag to change time of day | P0 |
| Date Picker | Select any date for analysis | P0 |
| i18n | English + Icelandic | P0 |

#### Tier 3: Visualizations
| Feature | Description | Priority |
|---------|-------------|----------|
| Sun Path Diagram | SVG arc showing sun trajectory | P0 |
| Monthly Hours Chart | Bar chart of sunlight per month | P0 |
| Horizon Profile | 360° terrain silhouette | P0 |
| Daily Timeline | Hour-by-hour sun/shadow indicator | P1 |
| Shadow Overlay (2D) | Map layer showing shaded areas | P1 (stretch) |

#### Tier 4: Solar Panel Analysis
| Feature | Description | Priority |
|---------|-------------|----------|
| Irradiance Calculation | kWh/m²/year based on sunlight hours | P0 |
| Panel Output Estimate | kWh/year for typical panel sizes | P0 |
| Optimal Tilt Angle | Best panel angle for location | P1 |
| ROI Calculator | Years to payback at Iceland electricity prices | P1 |
| Monthly Production | kWh estimate per month | P1 |

#### Tier 5: Monetization
| Feature | Description | Priority |
|---------|-------------|----------|
| Free Tier Limits | Today only, partial data | P0 |
| Stripe Checkout | One-time payment | P0 |
| PDF Report | Downloadable analysis | P0 |
| CSV Export | Raw data download | P1 |

### V2 Features (Post-Launch)
- 3D terrain visualization with Three.js
- Shadow animation through day
- Building shadow integration (OSM)
- Property comparison mode
- B2B API / embeddable widget
- Weather-adjusted estimates

---

## Technical Architecture

### Stack
| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Maps | MapLibre GL JS |
| Charts | Recharts |
| Sun Math | SunCalc library |
| DEM Processing | GeoTIFF.js |
| PDF | @react-pdf/renderer |
| i18n | next-intl |
| Payments | Stripe Checkout |
| Hosting | Vercel |
| Database | Supabase (optional for analytics) |

### Data Sources
| Data | Source | License |
|------|--------|---------|
| Elevation (DEM) | ÍslandsDEM 10m | CC BY 4.0 |
| Addresses | Staðfangaskrá API | Free |
| Map Tiles | OpenFreeMap | Free |
| Sun Position | SunCalc library | BSD |

### Key Constants (Iceland)
```javascript
const ICELAND_BOUNDS = {
  north: 66.5,
  south: 63.3,
  west: -24.5,
  east: -13.5
};

const ICELAND_ELECTRICITY_PRICE = 0.18; // EUR/kWh (2024)
const TYPICAL_PANEL_EFFICIENCY = 0.20; // 20%
const SYSTEM_LOSSES = 0.14; // 14% (inverter, wiring, etc.)
const PANEL_DEGRADATION = 0.005; // 0.5% per year
const TYPICAL_INSTALL_COST_PER_KW = 1500; // EUR
```

---

## Ralph Wiggum Task Breakdown

### Philosophy
Each task is designed to be:
- **Self-contained**: Clear inputs and outputs
- **Testable**: Specific success criteria
- **Iterative**: Can improve through multiple loops
- **Time-bounded**: Max iterations prevent runaway

### Task Dependency Graph

```
PHASE 1: DATA FOUNDATION
├── T01: DEM Tile Processor
└── T02: DEM Tile Server/CDN Setup

PHASE 2: CALCULATION ENGINE
├── T03: Horizon Calculator ──────────┐
├── T04: Sun Position Engine          │
└── T05: Shadow Intersection ─────────┴── depends on T03, T04

PHASE 3: AGGREGATION & ANALYSIS
├── T06: Daily Sunlight Calculator ───── depends on T05
├── T07: Monthly Aggregator ──────────── depends on T06
├── T08: Irradiance Calculator ───────── depends on T07
└── T09: Solar Panel ROI Engine ──────── depends on T08

PHASE 4: API LAYER
└── T10: Analysis API Endpoint ───────── depends on T05-T09

PHASE 5: FRONTEND - MAP & INPUT
├── T11: Map Component
├── T12: Address Search
└── T13: Location Picker

PHASE 6: FRONTEND - CONTROLS
├── T14: Time Slider
├── T15: Date Picker
└── T16: Control Panel Layout

PHASE 7: FRONTEND - VISUALIZATIONS
├── T17: Sun Path Diagram
├── T18: Horizon Profile Chart
├── T19: Monthly Hours Chart
├── T20: Daily Timeline
└── T21: Solar Panel Results Card

PHASE 8: MONETIZATION
├── T22: Free/Paid Tier Logic
├── T23: Stripe Integration
└── T24: PDF Report Generator

PHASE 9: POLISH
├── T25: i18n (EN/IS)
├── T26: Landing Page
└── T27: Responsive Design

PHASE 10: STRETCH
├── T28: Shadow Overlay on Map
└── T29: Day Animation
```

---

## Detailed Task Specifications

### PHASE 1: DATA FOUNDATION

#### T01: DEM Tile Processor
**Goal**: Convert ÍslandsDEM GeoTIFF into web-optimized tiles

**Input**:
- Raw ÍslandsDEM 10m GeoTIFF files
- Target tile size: 256x256 or 512x512 pixels

**Output**:
- Directory of PNG/WebP elevation tiles
- Tile index JSON with bounds
- Tile naming convention: `{z}/{x}/{y}.png`

**Success Criteria**:
- [ ] All of Iceland covered
- [ ] Tiles load in < 100ms
- [ ] Total size < 500MB
- [ ] Elevation values preserved accurately (±1m)

**Ralph Prompt**:
```
/ralph-loop "
TASK: Create DEM tile processor for ÍslandsDEM.

REQUIREMENTS:
1. Read GeoTIFF files from /data/dem/raw/
2. Convert to Web Mercator (EPSG:3857)
3. Generate tiles at zoom levels 8-14
4. Output as PNG with elevation encoded in RGB
5. Create tile index JSON: {zoom, x, y, bounds, minElevation, maxElevation}
6. Use sharp or gdal for processing

ENCODING: elevation = R*256 + G + B/256 - 32768 (meters)

TESTS:
- Reykjavík tile contains Esja (~914m peak)
- Coastal tiles have elevation ~0 near shore
- All tiles within Iceland bounds have valid data

OUTPUT <promise>TILES_DONE</promise> when complete.
" --max-iterations 30
```

---

#### T02: DEM Tile Server Setup
**Goal**: Serve DEM tiles efficiently

**Input**: Tiles from T01

**Output**:
- Tiles hosted on CDN (Cloudflare R2 or similar)
- API endpoint: `GET /tiles/dem/{z}/{x}/{y}.png`

**Success Criteria**:
- [ ] Tiles accessible via HTTP
- [ ] CORS configured
- [ ] Cache headers set (1 year)
- [ ] Fallback for missing tiles

**Ralph Prompt**:
```
/ralph-loop "
TASK: Set up DEM tile hosting.

REQUIREMENTS:
1. Upload tiles to Cloudflare R2 (or configure for local dev)
2. Create Next.js API route as fallback/proxy
3. Configure CORS for client access
4. Add cache-control headers (immutable, max-age=31536000)
5. Handle 404 for ocean tiles gracefully

TEST:
- Fetch tile for Reykjavík center returns valid image
- Invalid coordinates return appropriate error
- Response time < 200ms

OUTPUT <promise>TILE_SERVER_DONE</promise> when passing.
" --max-iterations 15
```

---

### PHASE 2: CALCULATION ENGINE

#### T03: Horizon Calculator
**Goal**: Calculate terrain horizon profile from any point

**Input**:
```typescript
interface HorizonInput {
  lat: number;      // Latitude in degrees
  lng: number;      // Longitude in degrees
  radiusKm: number; // Search radius (default: 50km)
  resolution: number; // Degrees between samples (default: 1)
}
```

**Output**:
```typescript
interface HorizonProfile {
  location: { lat: number; lng: number; elevation: number };
  profile: Array<{
    azimuth: number;      // 0-360 degrees (0=North, 90=East)
    elevationAngle: number; // Degrees above horizontal
    distance: number;     // Distance to horizon point in km
    peakElevation: number; // Absolute elevation of blocking terrain
  }>;
}
```

**Algorithm**:
1. Load DEM tiles covering radius around point
2. For each azimuth (0-359° at resolution intervals):
   - Trace ray from point outward
   - Sample elevation at intervals along ray
   - Calculate angle from point to each sample
   - Keep maximum angle encountered
3. Return array of {azimuth, maxElevationAngle}

**Success Criteria**:
- [ ] Flat terrain (ocean) returns ~0° for all directions
- [ ] Known valley location shows high angles toward mountains
- [ ] Performance: < 500ms for 1° resolution, 50km radius
- [ ] Handles edge cases: point on mountain top, coastal points

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement terrain horizon calculator.

FILE: src/lib/calculations/horizon.ts

REQUIREMENTS:
1. Function signature: getHorizonProfile(lat, lng, options?) => HorizonProfile
2. Load DEM tiles for area (use tile loader from T02)
3. For each azimuth 0-359 at 1° intervals:
   - Trace ray outward up to 50km
   - Sample terrain elevation every 100m along ray
   - Calculate elevation angle: atan2(terrainHeight - viewerHeight, distance)
   - Track maximum angle encountered
4. Return sorted array by azimuth

EDGE CASES:
- Ocean: return 0° elevation angle
- Missing DEM data: interpolate or use 0
- Point higher than surroundings: negative angles OK (means you can see below horizon)

TEST LOCATIONS:
- Reykjavík (64.1466, -21.9426): Should show Esja to north (~15-20° angle)
- Akureyri (65.6885, -18.0878): Valley with mountains east/west
- Flat coastal point: ~0° in direction of ocean

OUTPUT <promise>HORIZON_DONE</promise> when all tests pass.
" --max-iterations 30
```

---

#### T04: Sun Position Engine
**Goal**: Calculate sun position for any location, date, and time

**Input**:
```typescript
interface SunPositionInput {
  lat: number;
  lng: number;
  date: Date;
}
```

**Output**:
```typescript
interface SunPosition {
  altitude: number;  // Degrees above horizon (-90 to 90)
  azimuth: number;   // Degrees from north (0-360)
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
  dayLength: number; // Hours
}

interface SunPath {
  date: Date;
  positions: Array<{
    time: Date;
    altitude: number;
    azimuth: number;
  }>;
  sunrise: Date;
  sunset: Date;
}
```

**Success Criteria**:
- [ ] Uses SunCalc library correctly
- [ ] Handles polar edge cases (midnight sun, polar night)
- [ ] Returns positions at configurable intervals (default 5 min)
- [ ] Matches known astronomical data within 0.5°

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement sun position engine using SunCalc.

FILE: src/lib/calculations/sun.ts

REQUIREMENTS:
1. Install and use 'suncalc' npm package
2. getSunPosition(lat, lng, date) => SunPosition
3. getSunPath(lat, lng, date, intervalMinutes=5) => SunPath
4. Handle Iceland's extreme latitudes (63-66°N)

POLAR EDGE CASES:
- Midnight sun (June): sun never sets, altitude always > 0
- Polar twilight (December): sun may not rise above horizon
- Return appropriate flags: isMidnightSun, isPolarNight

TESTS (use known astronomical data):
- Summer solstice Reykjavík: sunrise ~02:55, sunset ~00:03 (next day)
- Winter solstice Reykjavík: sunrise ~11:22, sunset ~15:29
- Solar noon altitude summer: ~50°
- Solar noon altitude winter: ~3°

OUTPUT <promise>SUN_DONE</promise> when tests pass.
" --max-iterations 15
```

---

#### T05: Shadow Intersection Calculator
**Goal**: Determine if sun is blocked by terrain at any given moment

**Input**:
```typescript
interface ShadowInput {
  horizonProfile: HorizonProfile;
  sunPosition: SunPosition;
}
```

**Output**:
```typescript
interface ShadowResult {
  isInShadow: boolean;
  sunAltitude: number;
  horizonAltitude: number; // Terrain angle in sun's direction
  shadowMargin: number;    // How far below/above horizon (degrees)
}
```

**Algorithm**:
1. Get sun azimuth
2. Look up horizon elevation at that azimuth (interpolate between samples)
3. Compare: if sunAltitude > horizonAltitude → sun visible
4. Return result with margin

**Success Criteria**:
- [ ] Correctly identifies shadow when sun is behind terrain
- [ ] Correctly identifies sunlight when sun is above terrain
- [ ] Interpolates horizon between sample points smoothly
- [ ] Handles edge cases (sun at exactly horizon level)

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement shadow intersection calculator.

FILE: src/lib/calculations/shadow.ts

REQUIREMENTS:
1. Function: isSunVisible(horizonProfile, sunPosition) => ShadowResult
2. Interpolate horizon elevation at sun's azimuth
3. Use linear interpolation between horizon samples
4. Sun visible if: sunAltitude > horizonElevation + margin
5. Margin accounts for solar disc radius (~0.25°)

HELPER: getHorizonAtAzimuth(profile, azimuth) => number
- Interpolate between nearest two horizon samples
- Handle wrap-around at 0/360°

TESTS:
- Sun at 30° altitude, horizon at 10° → visible
- Sun at 5° altitude, horizon at 10° → shadow
- Sun at 10.2° altitude, horizon at 10° → barely visible

OUTPUT <promise>SHADOW_DONE</promise> when tests pass.
" --max-iterations 15
```

---

### PHASE 3: AGGREGATION & ANALYSIS

#### T06: Daily Sunlight Calculator
**Goal**: Calculate total hours of sunlight for a specific day

**Input**:
```typescript
interface DailySunlightInput {
  lat: number;
  lng: number;
  date: Date;
  horizonProfile: HorizonProfile;
  intervalMinutes?: number; // Default: 5
}
```

**Output**:
```typescript
interface DailySunlight {
  date: Date;
  totalHours: number;
  theoreticalHours: number; // Without terrain
  reductionHours: number;   // Lost to terrain
  reductionPercent: number;
  sunrise: Date;            // Actual (terrain-adjusted)
  sunset: Date;             // Actual (terrain-adjusted)
  astronomicalSunrise: Date;
  astronomicalSunset: Date;
  intervals: Array<{
    time: Date;
    isVisible: boolean;
    sunAltitude: number;
    horizonAltitude: number;
  }>;
}
```

**Algorithm**:
1. Get sun path for the day (every 5 minutes)
2. For each position, check if sun is visible (T05)
3. Sum visible intervals
4. Find actual sunrise/sunset (first/last visible moments)

**Success Criteria**:
- [ ] Matches theoretical day length for flat terrain
- [ ] Shows reduction for valley locations
- [ ] Handles midnight sun correctly
- [ ] Handles polar night correctly

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement daily sunlight calculator.

FILE: src/lib/calculations/daily.ts

REQUIREMENTS:
1. getDailySunlight(lat, lng, date, horizonProfile) => DailySunlight
2. Sample sun position every 5 minutes through the day
3. Check visibility at each sample using shadow calculator
4. Sum visible intervals (each 5-min interval = 5/60 hours)
5. Track terrain-adjusted sunrise/sunset

CALCULATIONS:
- totalHours = count of visible intervals × intervalMinutes / 60
- reductionHours = theoreticalHours - totalHours
- reductionPercent = reductionHours / theoreticalHours × 100

EDGE CASES:
- Midnight sun: iterate full 24 hours
- Polar night: return 0 hours, flag isPolarNight
- Partial day (sun rises but sets same day): normal calculation

TESTS:
- Flat terrain summer solstice: ~21 hours
- Flat terrain winter solstice: ~4 hours
- Valley location: less than flat terrain

OUTPUT <promise>DAILY_DONE</promise> when tests pass.
" --max-iterations 20
```

---

#### T07: Monthly Aggregator
**Goal**: Calculate average/total sunlight for each month

**Input**:
```typescript
interface MonthlyInput {
  lat: number;
  lng: number;
  horizonProfile: HorizonProfile;
  year?: number; // Default: current year
}
```

**Output**:
```typescript
interface MonthlySunlight {
  month: number; // 1-12
  name: string;  // "January", etc.
  averageDailyHours: number;
  totalHours: number;
  theoreticalHours: number;
  reductionPercent: number;
  sampleDays: number; // How many days sampled
}

interface AnnualSunlight {
  year: number;
  months: MonthlySunlight[];
  totalHours: number;
  theoreticalHours: number;
  averageDailyHours: number;
  reductionPercent: number;
}
```

**Algorithm**:
1. For each month, sample representative days (1st, 15th, or weekly)
2. Calculate daily sunlight for each sample
3. Interpolate/average for full month
4. Sum for annual total

**Success Criteria**:
- [ ] 12 months of data
- [ ] Reasonable values for Iceland (much more in summer)
- [ ] Performance: < 5 seconds for full year
- [ ] Matches general Iceland sunlight patterns

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement monthly and annual sunlight aggregator.

FILE: src/lib/calculations/monthly.ts

REQUIREMENTS:
1. getMonthlySunlight(lat, lng, horizonProfile, month, year) => MonthlySunlight
2. getAnnualSunlight(lat, lng, horizonProfile, year) => AnnualSunlight
3. Sample 4 days per month (1st, 8th, 15th, 22nd)
4. Average samples for monthly estimate
5. Multiply by days in month for total

OPTIMIZATION:
- Cache horizon profile (expensive to compute)
- Parallel computation of sample days where possible
- Consider memoization

EXPECTED RANGES (Iceland, flat terrain):
- January: ~5-6 hours/day average
- June: ~20-21 hours/day average
- Annual total: ~1,600-1,800 hours

TESTS:
- June has more hours than December
- Annual total within expected range
- Terrain reduction shows in results

OUTPUT <promise>MONTHLY_DONE</promise> when tests pass.
" --max-iterations 20
```

---

#### T08: Irradiance Calculator
**Goal**: Convert sunlight hours to solar energy potential

**Input**:
```typescript
interface IrradianceInput {
  lat: number;
  lng: number;
  annualSunlight: AnnualSunlight;
  panelTilt?: number;    // Degrees, default: latitude
  panelAzimuth?: number; // Default: 180 (south)
}
```

**Output**:
```typescript
interface IrradianceResult {
  annualGHI: number;           // kWh/m²/year (Global Horizontal)
  annualPOA: number;           // kWh/m²/year (Plane of Array - tilted)
  monthlyIrradiance: Array<{
    month: number;
    ghi: number;
    poa: number;
    sunlightHours: number;
  }>;
  optimalTilt: number;
  optimalAzimuth: number;
}
```

**Formulas**:
```
GHI ≈ sunlightHours × averageIrradiance × atmosphericFactor

For Iceland (64°N):
- Peak irradiance: ~800-900 W/m² (lower due to atmosphere)
- Average during sunlight: ~400-500 W/m²
- Annual GHI: ~800-1000 kWh/m²/year

POA = GHI × tiltFactor
- Optimal tilt ≈ latitude (64° for Iceland)
- Tilt factor for optimal: ~1.15-1.25
```

**Success Criteria**:
- [ ] GHI within expected range for Iceland
- [ ] Tilted panel shows higher values than horizontal
- [ ] Monthly variation matches daylight patterns
- [ ] Accounts for terrain reduction

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement solar irradiance calculator.

FILE: src/lib/calculations/irradiance.ts

REQUIREMENTS:
1. getIrradiance(lat, lng, annualSunlight, options?) => IrradianceResult
2. Calculate GHI from sunlight hours
3. Calculate POA (plane of array) for tilted panels
4. Find optimal tilt angle

FORMULAS:
- Average solar constant at ground: 1000 W/m² (clear sky, sun overhead)
- Atmospheric factor for Iceland: 0.7-0.8 (low sun angle, atmosphere)
- Air mass correction: AM = 1/cos(zenithAngle)
- Monthly average irradiance ≈ peakIrradiance × cos(averageZenithAngle)

GHI CALCULATION:
monthlyGHI = sunlightHours × averageMonthlyIrradiance (W/m²) / 1000

POA CALCULATION (simplified Hay-Davies):
POA = DNI × cos(incidenceAngle) + DHI × (1+cos(tilt))/2 + GHI × albedo × (1-cos(tilt))/2

For MVP, use simpler approximation:
POA ≈ GHI × (1 + 0.15 × sin(tilt - lat + 15°))

OPTIMAL TILT:
- Summer optimal: lat - 15°
- Winter optimal: lat + 15°
- Year-round optimal: lat ± 5°

TESTS:
- Iceland annual GHI: 800-1000 kWh/m²/year
- POA with optimal tilt > GHI
- Summer irradiance > winter irradiance

OUTPUT <promise>IRRADIANCE_DONE</promise> when tests pass.
" --max-iterations 25
```

---

#### T09: Solar Panel ROI Engine
**Goal**: Calculate solar panel system economics

**Input**:
```typescript
interface SolarROIInput {
  irradianceResult: IrradianceResult;
  systemSizeKW: number;        // Default: 5kW
  panelEfficiency: number;     // Default: 0.20 (20%)
  systemLosses: number;        // Default: 0.14 (14%)
  installCostPerKW: number;    // Default: €1500
  electricityPricePerKWh: number; // Default: €0.18 (Iceland)
  annualDegradation: number;   // Default: 0.005 (0.5%)
  systemLifeYears: number;     // Default: 25
}
```

**Output**:
```typescript
interface SolarROIResult {
  systemSizeKW: number;
  panelAreaM2: number;
  annualProductionKWh: number;
  monthlyProduction: Array<{
    month: number;
    productionKWh: number;
  }>;
  annualSavingsEUR: number;
  totalInstallCost: number;
  paybackYears: number;
  roi25Year: number;          // Total return over 25 years
  roiPercent: number;         // Percentage return
  co2OffsetKg: number;        // Annual CO2 savings
  isViable: boolean;          // Payback < 15 years
  viabilityReason: string;
}
```

**Formulas**:
```
annualProduction = POA × systemSizeKW × panelEfficiency × (1 - systemLosses)
                 = POA (kWh/m²) × panelArea (m²) × efficiency × (1 - losses)

panelArea = systemSizeKW / (efficiency × 1000 W/m² STC)
          = 5kW / (0.20 × 1000) = 25 m²

annualSavings = annualProduction × electricityPrice

paybackYears = installCost / annualSavings

roi25Year = (annualSavings × 25 × degradationFactor) - installCost
```

**Success Criteria**:
- [ ] Reasonable production estimates for Iceland
- [ ] Payback typically 10-20 years (Iceland electricity is cheap)
- [ ] Monthly breakdown follows seasonal pattern
- [ ] Includes degradation over system life

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement solar panel ROI calculator.

FILE: src/lib/calculations/solar-roi.ts

REQUIREMENTS:
1. getSolarROI(irradianceResult, options?) => SolarROIResult
2. Calculate annual production from POA irradiance
3. Calculate financial metrics
4. Provide viability assessment

CONSTANTS (configurable):
const DEFAULTS = {
  systemSizeKW: 5,
  panelEfficiency: 0.20,
  systemLosses: 0.14,
  installCostPerKW: 1500, // EUR
  electricityPrice: 0.18, // EUR/kWh (Iceland average)
  degradation: 0.005,     // 0.5% per year
  systemLife: 25,         // years
  co2PerKWh: 0.0,         // Iceland grid is already clean!
};

CALCULATIONS:
panelAreaM2 = systemSizeKW / (panelEfficiency * 1000) * 1000
            = systemSizeKW / panelEfficiency

annualProductionKWh = irradiance.annualPOA * panelAreaM2 * panelEfficiency * (1 - systemLosses)

For 5kW system in Iceland (~900 kWh/m²/year POA):
- Panel area: 25 m²
- Production: 900 * 25 * 0.20 * 0.86 ≈ 3,870 kWh/year

annualSavingsEUR = annualProductionKWh * electricityPrice
                 = 3870 * 0.18 ≈ €697/year

paybackYears = (systemSizeKW * installCostPerKW) / annualSavingsEUR
             = 7500 / 697 ≈ 10.8 years

VIABILITY:
- isViable = paybackYears < 15
- Note: Iceland electricity is mostly renewable, so CO2 benefit is minimal

TESTS:
- 5kW system produces 3,500-4,500 kWh/year
- Payback 8-15 years for typical Iceland location
- Valley location shows longer payback than sunny location

OUTPUT <promise>SOLAR_ROI_DONE</promise> when tests pass.
" --max-iterations 20
```

---

### PHASE 4: API LAYER

#### T10: Analysis API Endpoint
**Goal**: Single endpoint that orchestrates all calculations

**Endpoint**: `POST /api/analyze`

**Request**:
```typescript
interface AnalyzeRequest {
  lat: number;
  lng: number;
  date?: string;        // ISO date, default: today
  includeAnnual?: boolean;
  includeSolarROI?: boolean;
  systemSizeKW?: number;
}
```

**Response**:
```typescript
interface AnalyzeResponse {
  location: {
    lat: number;
    lng: number;
    elevation: number;
    address?: string;
  };
  horizonProfile: HorizonProfile;
  sunPath: SunPath;
  dailySunlight: DailySunlight;
  monthlySunlight?: MonthlySunlight[];
  annualSunlight?: AnnualSunlight;
  irradiance?: IrradianceResult;
  solarROI?: SolarROIResult;
  meta: {
    calculatedAt: string;
    processingTimeMs: number;
    tier: 'free' | 'paid';
  };
}
```

**Success Criteria**:
- [ ] Returns complete analysis in < 5 seconds
- [ ] Validates coordinates are within Iceland
- [ ] Handles errors gracefully
- [ ] Supports partial response (free tier)

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement main analysis API endpoint.

FILE: src/app/api/analyze/route.ts

REQUIREMENTS:
1. POST /api/analyze
2. Validate input coordinates within Iceland bounds
3. Orchestrate calculations:
   a. Load/compute horizon profile
   b. Calculate sun path for date
   c. Calculate daily sunlight
   d. If requested: monthly, annual, irradiance, ROI
4. Return comprehensive response
5. Track processing time

VALIDATION:
- lat: 63.3 to 66.5
- lng: -24.5 to -13.5
- date: valid ISO date or null

ERROR HANDLING:
- 400: Invalid coordinates or parameters
- 404: Location outside Iceland
- 500: Calculation error

FREE TIER LIMITS:
- No annual data
- No solar ROI
- Limited horizon resolution (10° instead of 1°)

CACHING:
- Cache horizon profile by lat/lng (rounded to 4 decimals)
- Cache TTL: 24 hours

TESTS:
- Valid Reykjavík coordinates return full response
- Invalid coordinates return 400
- Response time < 5000ms

OUTPUT <promise>API_DONE</promise> when tests pass.
" --max-iterations 25
```

---

### PHASE 5-9: FRONTEND TASKS

*[Frontend tasks follow similar pattern - I'll include key ones]*

#### T17: Sun Path Diagram
**Goal**: SVG visualization of sun's path across sky

**Ralph Prompt**:
```
/ralph-loop "
TASK: Create interactive sun path diagram component.

FILE: src/components/visualizations/SunPathDiagram.tsx

REQUIREMENTS:
1. SVG-based polar diagram
2. Show sun's arc for selected date
3. Mark sunrise, solar noon, sunset
4. Show current sun position (animated dot)
5. Overlay horizon profile
6. Highlight visible vs shadowed portions

DESIGN:
- Circular diagram (like a compass)
- North at top
- Concentric circles for altitude (0°, 30°, 60°, 90°)
- Sun path as yellow/orange arc
- Horizon as filled area from center
- Shadowed portions of sun path in gray

INTERACTIONS:
- Hover on path shows time + altitude
- Click to set time slider
- Responds to date changes

LIBRARIES:
- D3.js for SVG generation OR
- Pure React with SVG elements

TESTS:
- Renders without errors
- Updates when date prop changes
- Sun position moves with time slider
- Horizon correctly clips sun path

OUTPUT <promise>SUNPATH_VIZ_DONE</promise> when tests pass.
" --max-iterations 30
```

---

#### T21: Solar Panel Results Card
**Goal**: Display solar panel analysis results

**Ralph Prompt**:
```
/ralph-loop "
TASK: Create solar panel ROI results card.

FILE: src/components/results/SolarPanelCard.tsx

REQUIREMENTS:
1. Display key metrics from SolarROIResult
2. Visual indicators for viability
3. Monthly production chart
4. Payback timeline visualization

LAYOUT:
┌─────────────────────────────────────────┐
│ ☀️ Solar Panel Analysis                 │
├─────────────────────────────────────────┤
│ System Size: 5 kW                       │
│ Annual Production: 3,870 kWh           │
│                                         │
│ [Monthly Production Bar Chart]          │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Annual Savings    €697              │ │
│ │ Payback Period    10.8 years        │ │
│ │ 25-Year Return    €9,925            │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [✓] Viable Investment                   │
│ Payback within system lifetime          │
└─────────────────────────────────────────┘

VIABILITY INDICATORS:
- Green check: payback < 12 years
- Yellow warning: payback 12-20 years
- Red X: payback > 20 years

INTERACTIVE:
- Slider to adjust system size
- Recalculates on change
- Tooltip explanations

TESTS:
- Renders all data correctly
- Viability indicator matches calculation
- System size slider triggers recalculation

OUTPUT <promise>SOLAR_CARD_DONE</promise> when tests pass.
" --max-iterations 25
```

---

#### T24: PDF Report Generator
**Goal**: Generate downloadable PDF report

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement PDF report generator.

FILE: src/lib/pdf/ReportGenerator.tsx

REQUIREMENTS:
1. Use @react-pdf/renderer
2. Include all analysis data
3. Professional design with branding
4. Charts rendered as images

REPORT SECTIONS:
1. Cover page with location + date
2. Executive summary (key findings)
3. Location details + map thumbnail
4. Sunlight analysis
   - Daily sunlight for selected date
   - Monthly breakdown chart
   - Annual summary
5. Horizon profile diagram
6. Solar panel analysis (if paid)
   - System recommendation
   - Production estimates
   - Financial analysis
7. Methodology note
8. Disclaimer

DESIGN:
- A4 format
- Dagsbirta branding (logo, colors)
- Clean, professional layout
- Charts as PNG images (pre-rendered)

LOCALIZATION:
- Support EN and IS
- All text from i18n

API:
GET /api/report?lat=X&lng=Y&date=X&locale=is
Returns: PDF file download

TESTS:
- PDF generates without error
- Contains all sections
- File size < 2MB
- Renders correctly in PDF viewers

OUTPUT <promise>PDF_DONE</promise> when tests pass.
" --max-iterations 30
```

---

### PHASE 10: STRETCH GOALS

#### T28: Shadow Overlay on Map
**Goal**: Show terrain shadows directly on the map

**Ralph Prompt**:
```
/ralph-loop "
TASK: Implement shadow overlay layer on map.

FILE: src/components/map/ShadowLayer.tsx

REQUIREMENTS:
1. WebGL shader for shadow calculation
2. Real-time update with time slider
3. Performance: 60fps on modern devices

APPROACH:
1. Load DEM as texture
2. In fragment shader:
   - Get elevation at pixel
   - Calculate if sun ray hits terrain before reaching pixel
   - Color shadow areas with semi-transparent overlay

SIMPLIFIED APPROACH (if WebGL too complex):
1. Pre-calculate shadow grid for current time
2. Render as GeoJSON polygon layer
3. Update every second while sliding

FALLBACK:
- If performance issues, reduce resolution
- Show shadow at 100m grid instead of per-pixel

TESTS:
- Shadows appear on correct side of terrain
- Shadows move with time slider
- Performance acceptable on mobile

OUTPUT <promise>SHADOW_LAYER_DONE</promise> when working.
" --max-iterations 40
```

---

## Task Execution Order

### Week 1 (Foundation + Core)
| Day | Tasks | Parallel? |
|-----|-------|-----------|
| 1 | T01: DEM Tile Processor | No |
| 2 | T02: Tile Server, T04: Sun Engine | Yes |
| 3 | T03: Horizon Calculator | No |
| 4 | T05: Shadow Intersection | No |
| 5 | T06: Daily Calculator | No |
| 6 | T07: Monthly Aggregator, T08: Irradiance | Yes |
| 7 | T09: Solar ROI, T10: API | Yes |

### Week 2 (Frontend)
| Day | Tasks | Parallel? |
|-----|-------|-----------|
| 8 | T11: Map, T12: Address Search | Yes |
| 9 | T13: Location Picker, T14: Time Slider | Yes |
| 10 | T15: Date Picker, T16: Control Panel | Yes |
| 11 | T17: Sun Path Diagram | No |
| 12 | T18: Horizon Chart, T19: Monthly Chart | Yes |
| 13 | T20: Daily Timeline, T21: Solar Card | Yes |
| 14 | Integration + Bug fixes | No |

### Week 3 (Monetization + Polish)
| Day | Tasks | Parallel? |
|-----|-------|-----------|
| 15 | T22: Free/Paid Logic | No |
| 16 | T23: Stripe Integration | No |
| 17 | T24: PDF Report | No |
| 18 | T25: i18n (EN/IS) | No |
| 19 | T26: Landing Page | No |
| 20 | T27: Responsive Design | No |
| 21 | Testing + Launch | No |

---

## File Structure

```
dagsbirta/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Main app
│   │   ├── layout.tsx               # Root layout
│   │   ├── [locale]/                # i18n routes
│   │   │   ├── page.tsx
│   │   │   └── layout.tsx
│   │   └── api/
│   │       ├── analyze/
│   │       │   └── route.ts         # T10
│   │       ├── report/
│   │       │   └── route.ts         # T24
│   │       ├── tiles/
│   │       │   └── [z]/[x]/[y]/route.ts  # T02
│   │       └── checkout/
│   │           └── route.ts         # T23
│   │
│   ├── components/
│   │   ├── map/
│   │   │   ├── MapContainer.tsx     # T11
│   │   │   ├── AddressSearch.tsx    # T12
│   │   │   ├── LocationPicker.tsx   # T13
│   │   │   └── ShadowLayer.tsx      # T28
│   │   │
│   │   ├── controls/
│   │   │   ├── TimeSlider.tsx       # T14
│   │   │   ├── DatePicker.tsx       # T15
│   │   │   └── ControlPanel.tsx     # T16
│   │   │
│   │   ├── visualizations/
│   │   │   ├── SunPathDiagram.tsx   # T17
│   │   │   ├── HorizonChart.tsx     # T18
│   │   │   ├── MonthlyChart.tsx     # T19
│   │   │   └── DailyTimeline.tsx    # T20
│   │   │
│   │   ├── results/
│   │   │   ├── ResultsDashboard.tsx
│   │   │   ├── SunlightSummary.tsx
│   │   │   └── SolarPanelCard.tsx   # T21
│   │   │
│   │   └── common/
│   │       ├── PayWall.tsx          # T22
│   │       └── LanguageSwitch.tsx   # T25
│   │
│   ├── lib/
│   │   ├── calculations/
│   │   │   ├── horizon.ts           # T03
│   │   │   ├── sun.ts               # T04
│   │   │   ├── shadow.ts            # T05
│   │   │   ├── daily.ts             # T06
│   │   │   ├── monthly.ts           # T07
│   │   │   ├── irradiance.ts        # T08
│   │   │   └── solar-roi.ts         # T09
│   │   │
│   │   ├── tiles/
│   │   │   ├── loader.ts            # T02
│   │   │   └── processor.ts         # T01
│   │   │
│   │   ├── pdf/
│   │   │   └── ReportGenerator.tsx  # T24
│   │   │
│   │   └── stripe/
│   │       └── checkout.ts          # T23
│   │
│   ├── i18n/
│   │   ├── en.json                  # T25
│   │   └── is.json                  # T25
│   │
│   └── types/
│       └── index.ts                 # All TypeScript interfaces
│
├── public/
│   └── tiles/                       # DEM tiles (or CDN)
│
├── scripts/
│   └── process-dem.ts               # T01 CLI
│
└── tests/
    ├── calculations/
    │   ├── horizon.test.ts
    │   ├── sun.test.ts
    │   └── ...
    └── api/
        └── analyze.test.ts
```

---

## Quick Reference: Ralph Commands

```bash
# Phase 1: Data
/ralph-loop "T01..." --max-iterations 30  # DEM Processor
/ralph-loop "T02..." --max-iterations 15  # Tile Server

# Phase 2: Calculation Engine
/ralph-loop "T03..." --max-iterations 30  # Horizon
/ralph-loop "T04..." --max-iterations 15  # Sun
/ralph-loop "T05..." --max-iterations 15  # Shadow

# Phase 3: Aggregation
/ralph-loop "T06..." --max-iterations 20  # Daily
/ralph-loop "T07..." --max-iterations 20  # Monthly
/ralph-loop "T08..." --max-iterations 25  # Irradiance
/ralph-loop "T09..." --max-iterations 20  # Solar ROI

# Phase 4: API
/ralph-loop "T10..." --max-iterations 25  # API Endpoint

# Phase 5+: Frontend (better done interactively)
# Use standard Claude Code for UI tasks
```

---

## Success Metrics

### Technical
- [ ] All calculations complete in < 5 seconds
- [ ] 95%+ test coverage on calculation modules
- [ ] Works on mobile devices
- [ ] Lighthouse score > 90

### Product
- [ ] Address search works for all Iceland
- [ ] Results match manual verification
- [ ] PDF report is professional quality
- [ ] Payment flow completes successfully

### Launch
- [ ] Landing page live
- [ ] 10 beta testers validated results
- [ ] No critical bugs
- [ ] Stripe webhook configured

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Author: Claude + Skúli*
