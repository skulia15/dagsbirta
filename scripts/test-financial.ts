import {
  calculateAnnualSavings,
  calculatePaybackYears,
  calculateInstallationCost,
  calculate25YearReturn,
  calculatePanelArea,
  calculateAnnualProduction,
  DEFAULT_SOLAR_CONFIG,
} from '../src/lib/calculations/solar-roi';

console.log('=== T09-3 Financial Metrics Test ===\n');

// Iceland scenario: 5kW system
const systemSizeKW = 5;
const panelEfficiency = 0.20;
const systemLosses = 0.14;
const electricityPriceEUR = 0.18;
const installCostPerKW = 1500;
const annualPOA = 950; // kWh/m²/year - realistic for Iceland

console.log('System Configuration:');
console.log('  System size: ' + systemSizeKW + ' kW');
console.log('  Panel efficiency: ' + (panelEfficiency * 100) + '%');
console.log('  System losses: ' + (systemLosses * 100) + '%');
console.log('  Electricity price: ' + electricityPriceEUR + ' EUR/kWh');
console.log('  Install cost: ' + installCostPerKW + ' EUR/kW');
console.log('  Annual POA: ' + annualPOA + ' kWh/m²/year');
console.log('');

// Step 1: Calculate panel area
const panelAreaM2 = calculatePanelArea(systemSizeKW, panelEfficiency);
console.log('Panel area: ' + panelAreaM2 + ' m²');

// Step 2: Calculate annual production
const annualProductionKWh = calculateAnnualProduction(
  annualPOA,
  panelAreaM2,
  panelEfficiency,
  systemLosses
);
console.log('Annual production: ' + annualProductionKWh + ' kWh');

// Step 3: Calculate annual savings
const annualSavingsEUR = calculateAnnualSavings(annualProductionKWh, electricityPriceEUR);
console.log('Annual savings: ' + annualSavingsEUR + ' EUR');

// Step 4: Calculate installation cost
const installCostEUR = calculateInstallationCost(systemSizeKW, installCostPerKW);
console.log('Installation cost: ' + installCostEUR + ' EUR');

// Step 5: Calculate payback years
const paybackYears = calculatePaybackYears(installCostEUR, annualSavingsEUR);
console.log('Payback period: ' + paybackYears + ' years');

console.log('\n--- Acceptance Criteria Check ---');
console.log('Payback 8-15 years: ' + (paybackYears >= 8 && paybackYears <= 15 ? 'PASS ✓' : 'FAIL ✗') + ' (' + paybackYears + ' years)');

// Step 6: Calculate 25-year return with degradation
console.log('\n=== 25-Year Return with Degradation ===');
const lifetime = calculate25YearReturn(
  annualProductionKWh,
  electricityPriceEUR,
  0.005, // 0.5% annual degradation
  25
);

console.log('Total 25-year production: ' + lifetime.totalProductionKWh.toLocaleString() + ' kWh');
console.log('Total 25-year savings: ' + lifetime.totalSavingsEUR.toLocaleString() + ' EUR');
console.log('Final year production: ' + lifetime.finalYearProductionPercent + '% of Year 1');

console.log('\nYear-by-Year Breakdown (selected years):');
[1, 5, 10, 15, 20, 25].forEach(year => {
  const data = lifetime.yearlyBreakdown[year - 1];
  console.log('  Year ' + year + ': ' + data.productionKWh.toLocaleString() + ' kWh, ' + data.savingsEUR.toLocaleString() + ' EUR');
});

// Verify degradation calculation
console.log('\n--- Degradation Verification ---');
const expectedYear25Percent = Math.pow(0.995, 24) * 100;
console.log('Expected Year 25 percent: ' + expectedYear25Percent.toFixed(2) + '%');
console.log('Actual Year 25 percent: ' + lifetime.finalYearProductionPercent + '%');
console.log('Degradation calculation: ' + (Math.abs(expectedYear25Percent - lifetime.finalYearProductionPercent) < 0.1 ? 'PASS ✓' : 'FAIL ✗'));

// ROI calculation
const roi = ((lifetime.totalSavingsEUR - installCostEUR) / installCostEUR) * 100;
console.log('\n25-year ROI: ' + roi.toFixed(1) + '% (' + (roi > 100 ? 'More than doubled investment!' : 'Positive return') + ')');

// Test different POA values for sensitivity
console.log('\n=== Payback Sensitivity Analysis ===');
[750, 850, 950, 1000].forEach(poa => {
  const area = calculatePanelArea(5, 0.20);
  const prod = calculateAnnualProduction(poa, area, 0.20, 0.14);
  const savings = calculateAnnualSavings(prod, 0.18);
  const payback = calculatePaybackYears(7500, savings);
  console.log('  POA ' + poa + ': ' + prod.toLocaleString() + ' kWh, payback ' + payback + ' years');
});
