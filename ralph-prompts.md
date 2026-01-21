# Dagsbirta - Ralph Wiggum Prompts
## Ready-to-Execute Task Prompts

Copy these prompts directly into Claude Code with `/ralph-loop`.

---

## PHASE 1: DATA FOUNDATION

### T01: DEM Tile Processor
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

### T02: DEM Tile Server
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

## PHASE 2: CALCULATION ENGINE

### T03: Horizon Calculator
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
- Point higher than surroundings: negative angles OK

TEST LOCATIONS:
- Reykjavík (64.1466, -21.9426): Should show Esja to north (~15-20° angle)
- Akureyri (65.6885, -18.0878): Valley with mountains east/west
- Flat coastal point: ~0° in direction of ocean

OUTPUT <promise>HORIZON_DONE</promise> when all tests pass.
" --max-iterations 30
```

### T04: Sun Position Engine
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

### T05: Shadow Intersection
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

## PHASE 3: AGGREGATION

### T06: Daily Sunlight Calculator
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
- Partial day: normal calculation

TESTS:
- Flat terrain summer solstice: ~21 hours
- Flat terrain winter solstice: ~4 hours
- Valley location: less than flat terrain

OUTPUT <promise>DAILY_DONE</promise> when tests pass.
" --max-iterations 20
```

### T07: Monthly Aggregator
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
- Cache horizon profile
- Parallel computation where possible
- Memoization

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

### T08: Irradiance Calculator
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
- Average solar constant at ground: 1000 W/m² (clear sky)
- Atmospheric factor for Iceland: 0.7-0.8
- Monthly GHI = sunlightHours × averageMonthlyIrradiance / 1000

POA (simplified):
POA ≈ GHI × (1 + 0.15 × sin(tilt - lat + 15°))

OPTIMAL TILT:
- Year-round optimal: latitude ± 5°

TESTS:
- Iceland annual GHI: 800-1000 kWh/m²/year
- POA with optimal tilt > GHI
- Summer irradiance > winter irradiance

OUTPUT <promise>IRRADIANCE_DONE</promise> when tests pass.
" --max-iterations 25
```

### T09: Solar Panel ROI
```
/ralph-loop "
TASK: Implement solar panel ROI calculator.

FILE: src/lib/calculations/solar-roi.ts

REQUIREMENTS:
1. getSolarROI(irradianceResult, options?) => SolarROIResult
2. Calculate annual production from POA irradiance
3. Calculate financial metrics
4. Provide viability assessment

CONSTANTS:
const DEFAULTS = {
  systemSizeKW: 5,
  panelEfficiency: 0.20,
  systemLosses: 0.14,
  installCostPerKW: 1500, // EUR
  electricityPrice: 0.18, // EUR/kWh Iceland
  degradation: 0.005,
  systemLife: 25,
};

CALCULATIONS:
panelAreaM2 = systemSizeKW / panelEfficiency
annualProductionKWh = POA * panelAreaM2 * efficiency * (1 - losses)
annualSavingsEUR = annualProductionKWh * electricityPrice
paybackYears = installCost / annualSavingsEUR

VIABILITY:
- isViable = paybackYears < 15

TESTS:
- 5kW system produces 3,500-4,500 kWh/year
- Payback 8-15 years for typical Iceland location
- Valley shows longer payback than sunny location

OUTPUT <promise>SOLAR_ROI_DONE</promise> when tests pass.
" --max-iterations 20
```

---

## PHASE 4: API

### T10: Analysis Endpoint
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

## PHASE 5: FRONTEND - VISUALIZATIONS

### T17: Sun Path Diagram
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
- Shadowed portions in gray

INTERACTIONS:
- Hover on path shows time + altitude
- Click to set time slider
- Responds to date changes

TESTS:
- Renders without errors
- Updates when date prop changes
- Sun position moves with time slider
- Horizon correctly clips sun path

OUTPUT <promise>SUNPATH_VIZ_DONE</promise> when tests pass.
" --max-iterations 30
```

### T18: Horizon Profile Chart
```
/ralph-loop "
TASK: Create horizon profile visualization.

FILE: src/components/visualizations/HorizonChart.tsx

REQUIREMENTS:
1. Linear chart showing 360° horizon
2. X-axis: azimuth (0-360°, labeled N/E/S/W)
3. Y-axis: elevation angle (0-45°)
4. Fill area below horizon line
5. Mark cardinal directions
6. Show sun position on chart

DESIGN:
- Width: full container
- Height: ~200px
- Gradient fill for terrain
- Sun icon at current position
- Dashed line at 0° (flat horizon reference)

INTERACTIONS:
- Hover shows exact azimuth/elevation
- Highlight sun's azimuth

TESTS:
- Renders with sample data
- Updates with new horizon profile
- Sun marker moves with time slider

OUTPUT <promise>HORIZON_VIZ_DONE</promise> when tests pass.
" --max-iterations 20
```

### T19: Monthly Sunlight Chart
```
/ralph-loop "
TASK: Create monthly sunlight bar chart.

FILE: src/components/visualizations/MonthlyChart.tsx

REQUIREMENTS:
1. Bar chart with 12 months
2. Show hours of sunlight per month
3. Stack or overlay theoretical vs actual
4. Highlight terrain reduction
5. Show annual total

DESIGN:
- Horizontal bars (months vertical)
- Yellow bars for actual sunlight
- Gray overlay for lost to terrain
- Summary stat at bottom

DATA:
- monthlySunlight: Array<{month, actualHours, theoreticalHours}>
- annualTotal: number

TESTS:
- Renders 12 bars
- Values match input data
- Tooltip shows exact hours
- Responsive layout

OUTPUT <promise>MONTHLY_VIZ_DONE</promise> when tests pass.
" --max-iterations 20
```

### T21: Solar Panel Results Card
```
/ralph-loop "
TASK: Create solar panel ROI results card.

FILE: src/components/results/SolarPanelCard.tsx

REQUIREMENTS:
1. Display key metrics from SolarROIResult
2. Visual indicators for viability
3. Monthly production chart
4. Payback timeline visualization

METRICS TO SHOW:
- System size (kW)
- Annual production (kWh)
- Annual savings (EUR)
- Payback period (years)
- 25-year return (EUR)

VIABILITY INDICATORS:
- Green check: payback < 12 years
- Yellow warning: payback 12-20 years
- Red X: payback > 20 years

INTERACTIVE:
- Slider to adjust system size
- Recalculates on change

TESTS:
- Renders all data correctly
- Viability indicator matches calculation
- System size slider works

OUTPUT <promise>SOLAR_CARD_DONE</promise> when tests pass.
" --max-iterations 25
```

---

## PHASE 6: MONETIZATION

### T22: Free/Paid Tier Logic
```
/ralph-loop "
TASK: Implement free vs paid tier gating.

FILE: src/lib/tiers.ts, src/components/common/PayWall.tsx

REQUIREMENTS:
1. Define tier limits
2. Check payment status from Stripe
3. Gate premium features behind paywall
4. Show upgrade prompts

FREE TIER:
- Today's date only
- Basic horizon (10° resolution)
- Daily sunlight summary
- No monthly/annual data
- No solar ROI
- No PDF report

PAID TIER:
- Any date
- Full horizon (1° resolution)
- Complete monthly + annual
- Solar ROI analysis
- PDF report download
- CSV export

IMPLEMENTATION:
- Store payment status in session/localStorage
- Check on API requests
- Return partial data for free tier
- PayWall component shows upgrade CTA

TESTS:
- Free user sees limited data
- Paid user sees full data
- PayWall renders correctly
- Upgrade button links to Stripe

OUTPUT <promise>TIERS_DONE</promise> when tests pass.
" --max-iterations 20
```

### T23: Stripe Integration
```
/ralph-loop "
TASK: Implement Stripe Checkout for payments.

FILES:
- src/app/api/checkout/route.ts
- src/app/api/webhook/route.ts
- src/lib/stripe/checkout.ts

REQUIREMENTS:
1. Create Stripe Checkout session
2. Handle successful payment webhook
3. Store payment status
4. Handle errors gracefully

ENDPOINTS:
POST /api/checkout
- Creates Checkout session
- Returns session URL
- Price: configurable (default €19.99)

POST /api/webhook
- Verifies Stripe signature
- Handles checkout.session.completed
- Updates user/session payment status

ENVIRONMENT VARIABLES:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_ID

TESTS:
- Checkout session creates successfully
- Webhook validates signature
- Payment status updates after success
- Error handling works

OUTPUT <promise>STRIPE_DONE</promise> when tests pass.
" --max-iterations 25
```

### T24: PDF Report Generator
```
/ralph-loop "
TASK: Implement PDF report generator.

FILE: src/lib/pdf/ReportGenerator.tsx

REQUIREMENTS:
1. Use @react-pdf/renderer
2. Include all analysis data
3. Professional design
4. Charts as images

SECTIONS:
1. Cover page (location, date, branding)
2. Executive summary
3. Location details + mini map
4. Sunlight analysis
   - Daily for selected date
   - Monthly breakdown chart
   - Annual summary
5. Horizon profile diagram
6. Solar panel analysis
   - Production estimates
   - Financial analysis
7. Methodology note
8. Disclaimer

DESIGN:
- A4 format
- Dagsbirta branding
- Clean, professional
- Charts pre-rendered as PNG

API:
GET /api/report?lat=X&lng=Y&date=X&locale=is
Returns: PDF download

TESTS:
- PDF generates without error
- All sections present
- File size < 2MB
- Works in PDF viewers

OUTPUT <promise>PDF_DONE</promise> when tests pass.
" --max-iterations 30
```

---

## PHASE 7: POLISH

### T25: Internationalization
```
/ralph-loop "
TASK: Implement i18n for English and Icelandic.

FILES:
- src/i18n/en.json
- src/i18n/is.json
- src/components/common/LanguageSwitch.tsx

REQUIREMENTS:
1. Use next-intl
2. All user-facing text in translation files
3. Language switcher component
4. Persist language preference
5. URL-based locale (/en/... /is/...)

TRANSLATIONS NEEDED:
- Navigation
- Form labels
- Results labels
- Error messages
- PDF content
- Landing page

TESTS:
- All text renders in both languages
- Language switch works
- Preference persists
- PDF generates in correct language

OUTPUT <promise>I18N_DONE</promise> when tests pass.
" --max-iterations 20
```

### T26: Landing Page
```
/ralph-loop "
TASK: Create landing page.

FILE: src/app/[locale]/page.tsx (or separate landing route)

REQUIREMENTS:
1. Hero section with value prop
2. How it works (3 steps)
3. Feature highlights
4. Sample analysis preview
5. Pricing section
6. FAQ
7. CTA button

DESIGN:
- Modern, clean
- Iceland imagery (subtle)
- Responsive
- Fast loading

COPY (EN):
- Hero: "Know Your Sunlight Before You Buy"
- Subhead: "Terrain-aware sunlight analysis for Icelandic properties"
- CTA: "Analyze a Location"

SEO:
- Meta title/description
- Open Graph tags
- Structured data (LocalBusiness)

TESTS:
- Renders on all screen sizes
- All links work
- CTA leads to app
- Lighthouse > 90

OUTPUT <promise>LANDING_DONE</promise> when tests pass.
" --max-iterations 25
```

---

## STRETCH GOALS

### T28: Shadow Overlay on Map
```
/ralph-loop "
TASK: Implement shadow overlay layer on map.

FILE: src/components/map/ShadowLayer.tsx

REQUIREMENTS:
1. Calculate shadow grid for visible area
2. Render as semi-transparent overlay
3. Update with time slider
4. Performance: smooth animation

APPROACH:
1. Grid-based calculation (100m cells)
2. For each cell, check if in shadow
3. Render as GeoJSON polygon
4. Update on time change

OPTIMIZATION:
- Only calculate visible area
- Debounce time slider
- Cache results for same time
- Reduce resolution when zoomed out

TESTS:
- Shadows on correct side of terrain
- Shadows move with time
- Acceptable performance on mobile

OUTPUT <promise>SHADOW_LAYER_DONE</promise> when working.
" --max-iterations 40
```

### T29: Day Animation
```
/ralph-loop "
TASK: Implement day timelapse animation.

FILE: src/components/controls/DayAnimation.tsx

REQUIREMENTS:
1. Play/pause button
2. Animate through entire day
3. Update all visualizations
4. Speed control (1x, 2x, 5x, 10x)
5. Progress indicator

IMPLEMENTATION:
1. Use requestAnimationFrame or setInterval
2. Increment time by configurable step
3. Trigger time slider update
4. All components react to time change

TESTS:
- Animation plays smoothly
- All visualizations update
- Pause works
- Speed control works

OUTPUT <promise>ANIMATION_DONE</promise> when tests pass.
" --max-iterations 20
```

---

## Usage Notes

### Running Ralph
```bash
# Start a task
/ralph-loop "TASK..." --max-iterations N

# Monitor progress
# Ralph will output progress and completion promises

# Cancel if stuck
/cancel-ralph
```

### Recommended Order
1. T01, T02 (Data foundation)
2. T03, T04, T05 (Core calculations) 
3. T06, T07, T08, T09 (Aggregations)
4. T10 (API)
5. T11-T21 (Frontend - consider interactive mode)
6. T22, T23, T24 (Monetization)
7. T25, T26, T27 (Polish)
8. T28, T29 (Stretch)

### When to Use Interactive Mode
Frontend components (T11-T21) often benefit from human feedback during development. Consider using regular Claude Code for these, with Ralph for the calculation-heavy backend tasks.