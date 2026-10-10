import assert from 'node:assert/strict';
import test from 'node:test';

await import('../app/src/main/assets/forecast-reliability.js');
const { assessEligibility, runRollingBacktest, aggregateBacktests } = globalThis.FinForecastReliability;

const DAY = 86400000;
const iso = value => new Date(value).toISOString().slice(0, 10);

function history(days, { start = '2025-01-01', volatile = false, missedIncome = false, shockDay = -1 } = {}) {
  const origin = Date.parse(start + 'T00:00:00Z');
  const rows = [];
  for (let day = 0; day < days; day++) {
    const date = iso(origin + day * DAY);
    if (day % 30 === 0 && !(missedIncome && day === 120)) rows.push({ id: `I${day}`, date, amount: 50000, category: 'Income', description: 'Salary' });
    if (day % 30 === 2) rows.push({ id: `R${day}`, date, amount: -15000, category: 'Housing', description: 'Rent' });
    if (day % 3 === 0) rows.push({ id: `E${day}`, date, amount: -(volatile ? 200 + (day * 977) % 5000 : 900), category: 'Groceries', description: 'Daily spend' });
    if (day === shockDay) rows.push({ id: `S${day}`, date, amount: -65000, category: 'Health', description: 'Unexpected expense' });
  }
  return rows;
}

function deterministicForecast({ training, startBalance }) {
  const first = Date.parse(training[0].date + 'T00:00:00Z');
  const last = Date.parse(training.at(-1).date + 'T00:00:00Z');
  const span = Math.max(1, Math.floor((last - first) / DAY) + 1);
  const daily = training.reduce((sum, row) => sum + row.amount, 0) / span;
  const mid = Array.from({ length: 31 }, (_, day) => startBalance + daily * day);
  return { low: mid.map(value => value - 5000), mid, high: mid.map(value => value + 5000), gapProbability: mid.some(value => value < 0) ? 80 : 10, medianGapDay: mid.findIndex(value => value < 0) || null };
}

test('minimum-data policy handles empty and exact age boundaries', () => {
  const asOf = '2026-01-01';
  assert.equal(assessEligibility([], { asOf }).status, 'unavailable');
  const makeBoundary = days => history(days, { start: iso(Date.parse(asOf + 'T00:00:00Z') - (days - 1) * DAY) });
  const provisional = assessEligibility(makeBoundary(30), { asOf, recurringCycles: 3 });
  assert.equal(provisional.status, 'provisional');
  assert.equal(provisional.canShowProbability, false);
  const limited = assessEligibility(makeBoundary(90), { asOf, recurringCycles: 3 });
  assert.equal(limited.status, 'limited');
  assert.equal(limited.canShowProbability, true);
  assert.equal(assessEligibility(makeBoundary(180), { asOf, recurringCycles: 3, completedBacktests: 3 }).status, 'validated');
});

test('rolling backtests are deterministic, ordered, and never expose future rows to training', () => {
  const records = history(240);
  const seen = [];
  const forecast = input => {
    seen.push(input);
    assert.ok(input.training.every(row => row.date <= input.cutoffDate));
    return deterministicForecast(input);
  };
  const first = runRollingBacktest(records, 40000, forecast, { asOf: '2025-08-28', minTrainingDays: 90, stepDays: 30 });
  const second = runRollingBacktest(records, 40000, deterministicForecast, { asOf: '2025-08-28', minTrainingDays: 90, stepDays: 30 });
  assert.deepEqual(first, second);
  assert.ok(first.length >= 3);
  assert.equal(seen.length, first.length);
});

test('backtests cover stable, volatile, missed-income, shock, gap, and no-gap outcomes', () => {
  const scenarios = [
    { records: history(240), balance: 80000 },
    { records: history(240, { volatile: true }), balance: 80000 },
    { records: history(240, { missedIncome: true }), balance: 30000 },
    { records: history(240, { shockDay: 205 }), balance: 5000 },
  ];
  const all = scenarios.flatMap(({ records, balance }) => runRollingBacktest(records, balance, deterministicForecast, { asOf: '2025-08-28' }));
  assert.ok(all.some(result => result.actualCashGap));
  assert.ok(all.some(result => !result.actualCashGap));
  for (const result of all) {
    assert.ok(result.predictedCashGapProbability >= 0 && result.predictedCashGapProbability <= 1);
    for (const point of Object.values(result.points)) assert.ok(point.p10 <= point.p50 && point.p50 <= point.p90);
  }
  const metrics = aggregateBacktests(all);
  assert.ok(Number.isFinite(metrics.brierScore));
  for (const horizon of Object.values(metrics.horizons)) {
    for (const value of [horizon.p50Mae, horizon.intervalCoverage, horizon.meanIntervalWidth, horizon.baselineMae]) assert.ok(Number.isFinite(value));
    assert.ok(typeof horizon.beatsBaseline === 'boolean');
  }
});

test('malformed rows are ignored and empty metrics stay finite', () => {
  const malformed = [{ date: 'not-a-date', amount: 10 }, { date: '2026-01-01', amount: 'bad' }];
  assert.deepEqual(runRollingBacktest(malformed, 0, deterministicForecast), []);
  const metrics = aggregateBacktests([]);
  assert.equal(metrics.completedBacktests, 0);
  assert.ok(Number.isFinite(metrics.brierScore));
  assert.equal(metrics.horizons[30].beatsBaseline, null);
});
