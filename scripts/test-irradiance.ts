import { getIrradiance, calculateOptimalTilt, calculateGHI, calculatePOA } from '../src/lib/calculations/irradiance';
import type { AnnualSunlight, MonthlySunlight } from '../src/types/index';

// Create sample Reykjavík annual sunlight data (based on previous tests)
// These are realistic values from T07 monthly aggregation tests
function createSampleAnnualSunlight(): AnnualSunlight {
  // Approximate monthly values for Reykjavík (64.1°N)
  const monthlyData: Array<{ month: number; name: string; avgHours: number }> = [
    { month: 1, name: 'January', avgHours: 4.5 },
    { month: 2, name: 'February', avgHours: 7.0 },
    { month: 3, name: 'March', avgHours: 10.5 },
    { month: 4, name: 'April', avgHours: 14.0 },
    { month: 5, name: 'May', avgHours: 17.5 },
    { month: 6, name: 'June', avgHours: 20.0 },  // Longest days
    { month: 7, name: 'July', avgHours: 19.0 },
    { month: 8, name: 'August', avgHours: 15.5 },
    { month: 9, name: 'September', avgHours: 12.0 },
    { month: 10, name: 'October', avgHours: 8.5 },
    { month: 11, name: 'November', avgHours: 5.5 },
    { month: 12, name: 'December', avgHours: 3.8 },  // Shortest days
  ];

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const months: MonthlySunlight[] = monthlyData.map((m, i) => ({
    month: m.month,
    monthName: m.name,
    year: 2024,
    averageDailyHours: m.avgHours,
    totalHours: m.avgHours * daysInMonth[i],
    theoreticalHours: (m.avgHours * 1.05) * daysInMonth[i], // ~5% reduction from terrain
    reductionPercent: 5,
  }));

  const totalHours = months.reduce((sum, m) => sum + m.totalHours, 0);
  const theoreticalTotal = months.reduce((sum, m) => sum + m.theoreticalHours, 0);

  return {
    year: 2024,
    months,
    totalHours,
    averageDailyHours: totalHours / 366,
    theoreticalTotalHours: theoreticalTotal,
    reductionPercent: ((theoreticalTotal - totalHours) / theoreticalTotal) * 100,
  };
}

// Test the irradiance calculations
console.log('=== Dagsbirta Irradiance Calculator Test ===\n');

// Test 1: Optimal tilt angles for different Iceland latitudes
console.log('1. Optimal Tilt Angles for Iceland Locations:');
const locations = [
  { name: 'Reykjavík', lat: 64.1 },
  { name: 'Akureyri', lat: 65.7 },
  { name: 'Ísafjörður', lat: 66.1 },
  { name: 'Höfn', lat: 64.3 },
];
for (const loc of locations) {
  const tilt = calculateOptimalTilt(loc.lat);
  console.log('   ' + loc.name + ' (' + loc.lat + '°N): ' + tilt + '° tilt');
}
console.log('   Expected range: 60-65° ✓\n');

// Test 2: GHI calculations
console.log('2. Annual GHI Calculation:');
const annualSunlight = createSampleAnnualSunlight();
console.log('   Total annual sunlight hours: ' + annualSunlight.totalHours.toFixed(0) + ' hours');
const ghi = calculateGHI(annualSunlight);
console.log('   Annual GHI: ' + ghi.toFixed(1) + ' kWh/m²/year');
console.log('   Expected range: 700-1000 kWh/m²/year for Iceland ✓\n');

// Test 3: POA vs GHI comparison
console.log('3. POA vs GHI Comparison:');
const reykjavikLat = 64.1;
const optimalTilt = calculateOptimalTilt(reykjavikLat);
const poa = calculatePOA(ghi, optimalTilt, reykjavikLat);
console.log('   GHI: ' + ghi.toFixed(1) + ' kWh/m²/year');
console.log('   POA (at ' + optimalTilt + '° tilt): ' + poa.toFixed(1) + ' kWh/m²/year');
console.log('   Gain: ' + ((poa/ghi - 1) * 100).toFixed(1) + '%');
console.log('   POA > GHI: ' + (poa > ghi ? '✓ PASS' : '✗ FAIL') + '\n');

// Test 4: Full getIrradiance function
console.log('4. Full Irradiance Result:');
const result = getIrradiance(reykjavikLat, -21.9, annualSunlight);
console.log('   Annual GHI: ' + result.annualGHI + ' kWh/m²/year');
console.log('   Annual POA: ' + result.annualPOA + ' kWh/m²/year');
console.log('   Optimal Tilt: ' + result.optimalTiltAngle + '°');
console.log('   Monthly data: ' + result.monthlyIrradiance.length + ' months');

// Test 5: Monthly seasonal variation (summer > winter)
console.log('\n5. Monthly Irradiance (Summer vs Winter):');
const june = result.monthlyIrradiance.find(m => m.month === 6)!;
const december = result.monthlyIrradiance.find(m => m.month === 12)!;
console.log('   June GHI: ' + june.ghi + ' kWh/m², POA: ' + june.poa + ' kWh/m²');
console.log('   December GHI: ' + december.ghi + ' kWh/m², POA: ' + december.poa + ' kWh/m²');
console.log('   June > December: ' + (june.ghi > december.ghi ? '✓ PASS' : '✗ FAIL'));
console.log('   Ratio: ' + (june.ghi / december.ghi).toFixed(1) + 'x\n');

// Summary
console.log('=== Summary ===');
const allPassed =
  result.optimalTiltAngle >= 60 && result.optimalTiltAngle <= 65 &&
  result.annualGHI >= 700 && result.annualGHI <= 1000 &&
  result.annualPOA > result.annualGHI &&
  june.ghi > december.ghi;

if (allPassed) {
  console.log('All tests PASSED ✓');
  console.log('Irradiance module produces realistic Iceland values!');
} else {
  console.log('Some tests FAILED ✗');
}
