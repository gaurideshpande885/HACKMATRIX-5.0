(function (root) {
  'use strict';

  const DAY = 86400000;
  const MODEL_VERSION = '2.1';
  const HORIZONS = [7, 14, 30];

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function dayValue(value) {
    const date = value instanceof Date || typeof value === 'number' ? new Date(value) : new Date(String(value || ''));
    if (Number.isNaN(date.getTime())) return null;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  function isoDay(value) {
    const day = dayValue(value);
    return day === null ? null : new Date(day).toISOString().slice(0, 10);
  }

  function cleanRecords(records, asOf) {
    const end = dayValue(asOf);
    return (Array.isArray(records) ? records : [])
      .map((record, index) => ({ ...record, amount: Number(record?.amount), _day: dayValue(record?.date), _index: index }))
      .filter(record => record._day !== null && Number.isFinite(record.amount) && (end === null || record._day <= end))
      .sort((a, b) => a._day - b._day || a._index - b._index);
  }

  function assessEligibility(records, options = {}) {
    const asOf = dayValue(options.asOf) ?? dayValue(new Date());
    const rows = cleanRecords(records, asOf);
    const oldest = rows[0]?._day ?? asOf;
    const latest = rows.at(-1)?._day ?? null;
    const observedDays = rows.length ? Math.max(1, Math.floor((asOf - oldest) / DAY) + 1) : 0;
    const recencyDays = latest === null ? null : Math.max(0, Math.floor((asOf - latest) / DAY));
    const incomeObservations = rows.filter(row => row.amount > 0 && row.category === 'Income').length;
    const activeMonths = new Set(rows.map(row => new Date(row._day).toISOString().slice(0, 7))).size;
    const expectedMonths = observedDays ? Math.max(1, Math.ceil(observedDays / 30.44)) : 0;
    const missingPeriods = Math.max(0, expectedMonths - activeMonths);
    const completedBacktests = Math.max(0, Math.floor(finite(options.completedBacktests)));
    const recurringCycles = Math.max(0, Math.floor(finite(options.recurringCycles)));
    const reasons = [];

    if (observedDays < 30) reasons.push('Fewer than 30 days of transaction history');
    if (rows.length < 10) reasons.push('Fewer than 10 valid transactions');
    if (!incomeObservations) reasons.push('No income observation is available');
    if (recencyDays === null || recencyDays > 45) reasons.push('Transaction history is not recent');
    if (expectedMonths >= 3 && missingPeriods > Math.ceil(expectedMonths / 3)) reasons.push('Several monthly periods have no transactions');
    if (recurringCycles < 3) reasons.push('Fewer than three recurring cycles were detected');

    let status;
    if (observedDays < 30 || rows.length < 10 || !incomeObservations) status = 'unavailable';
    else if (observedDays < 90) status = 'provisional';
    else if (observedDays < 180 || completedBacktests < 3 || recencyDays > 45) status = 'limited';
    else status = 'validated';

    const labels = {
      unavailable: 'Scenario only', provisional: 'Provisional', limited: 'Limited validation', validated: 'Historically validated',
    };
    return {
      status,
      label: labels[status],
      observedDays,
      transactionCount: rows.length,
      incomeObservations,
      recurringCycles,
      recencyDays,
      activeMonths,
      missingPeriods,
      completedBacktests,
      reasons,
      canShowProbability: observedDays >= 90 && status !== 'unavailable',
      minimumRequirements: { scenarioDays: 30, reportedProbabilityDays: 90, fullValidationDays: 180, transactions: 10, completedBacktests: 3 },
    };
  }

  function valueAt(path, day) {
    if (!Array.isArray(path) || !path.length) return 0;
    return finite(path[Math.min(day, path.length - 1)]);
  }

  function runRollingBacktest(records, currentBalance, forecastAtCutoff, options = {}) {
    if (typeof forecastAtCutoff !== 'function') return [];
    const rows = cleanRecords(records, options.asOf || new Date());
    if (!rows.length) return [];
    const minTrainingDays = Math.max(30, Math.floor(finite(options.minTrainingDays, 90)));
    const horizonDays = 30;
    const stepDays = Math.max(7, Math.floor(finite(options.stepDays, 30)));
    const firstDay = rows[0]._day;
    const lastDay = rows.at(-1)._day;
    const lastCutoff = lastDay - horizonDays * DAY;
    const results = [];

    for (let cutoff = firstDay + (minTrainingDays - 1) * DAY; cutoff <= lastCutoff; cutoff += stepDays * DAY) {
      const training = rows.filter(row => row._day <= cutoff).map(({ _day, _index, ...row }) => row);
      const heldOut = rows.filter(row => row._day > cutoff && row._day <= cutoff + horizonDays * DAY);
      if (training.length < 10 || !heldOut.length) continue;
      const futureNet = rows.filter(row => row._day > cutoff).reduce((sum, row) => sum + row.amount, 0);
      const startBalance = finite(currentBalance) - futureNet;
      const cutoffDate = isoDay(cutoff);
      const forecast = forecastAtCutoff({ training, cutoffDate, startBalance });
      if (!forecast || !Array.isArray(forecast.mid)) continue;

      const actualPath = [startBalance];
      let balance = startBalance;
      let actualGapDay = null;
      for (let day = 1; day <= horizonDays; day++) {
        balance += heldOut.filter(row => row._day === cutoff + day * DAY).reduce((sum, row) => sum + row.amount, 0);
        actualPath.push(balance);
        if (actualGapDay === null && balance < 0) actualGapDay = day;
      }
      const trainingSpan = Math.max(1, Math.floor((cutoff - firstDay) / DAY) + 1);
      const dailyNet = training.reduce((sum, row) => sum + finite(row.amount), 0) / trainingSpan;
      const points = {};
      for (const day of HORIZONS) {
        points[day] = {
          p10: valueAt(forecast.low, day), p50: valueAt(forecast.mid, day), p90: valueAt(forecast.high, day),
          actual: finite(actualPath[day]), baseline: startBalance + dailyNet * day,
        };
      }
      results.push({
        cutoffDate,
        trainingHistoryDays: trainingSpan,
        trainingRecordCount: training.length,
        points,
        predictedCashGapProbability: Math.max(0, Math.min(1, finite(forecast.gapProbability) / 100)),
        actualCashGap: actualGapDay !== null,
        predictedFirstGapDay: forecast.medianGapDay ?? null,
        actualFirstGapDay: actualGapDay,
        modelVersion: options.modelVersion || MODEL_VERSION,
      });
    }
    return results;
  }

  function average(values) {
    const safe = values.filter(Number.isFinite);
    return safe.length ? safe.reduce((sum, value) => sum + value, 0) / safe.length : 0;
  }

  function aggregateBacktests(backtests) {
    const tests = Array.isArray(backtests) ? backtests : [];
    const metrics = { completedBacktests: tests.length, horizons: {}, gapDayMae: null, calibration: [] };
    for (const day of HORIZONS) {
      const points = tests.map(test => test?.points?.[day]).filter(Boolean);
      metrics.horizons[day] = {
        p50Mae: average(points.map(point => Math.abs(finite(point.p50) - finite(point.actual)))),
        intervalCoverage: points.length ? points.filter(point => finite(point.actual) >= finite(point.p10) && finite(point.actual) <= finite(point.p90)).length / points.length : 0,
        meanIntervalWidth: average(points.map(point => Math.max(0, finite(point.p90) - finite(point.p10)))),
        baselineMae: average(points.map(point => Math.abs(finite(point.baseline) - finite(point.actual)))),
      };
      metrics.horizons[day].beatsBaseline = points.length ? metrics.horizons[day].p50Mae < metrics.horizons[day].baselineMae : null;
    }
    metrics.brierScore = average(tests.map(test => (finite(test.predictedCashGapProbability) - (test.actualCashGap ? 1 : 0)) ** 2));
    const comparableGaps = tests.filter(test => Number.isFinite(test.predictedFirstGapDay) && Number.isFinite(test.actualFirstGapDay));
    if (comparableGaps.length) metrics.gapDayMae = average(comparableGaps.map(test => Math.abs(test.predictedFirstGapDay - test.actualFirstGapDay)));
    for (let lower = 0; lower < 1; lower += 0.2) {
      const upper = Math.min(1, lower + 0.2);
      const bucket = tests.filter(test => test.predictedCashGapProbability >= lower && (upper === 1 ? test.predictedCashGapProbability <= upper : test.predictedCashGapProbability < upper));
      metrics.calibration.push({
        band: `${Math.round(lower * 100)}-${Math.round(upper * 100)}%`, count: bucket.length,
        meanPredicted: average(bucket.map(test => test.predictedCashGapProbability)),
        observedRate: average(bucket.map(test => test.actualCashGap ? 1 : 0)),
      });
    }
    metrics.calibrationStatus = tests.length < 3 ? 'unavailable' : tests.length < 10 ? 'limited' : Math.abs(average(tests.map(test => test.predictedCashGapProbability)) - average(tests.map(test => test.actualCashGap ? 1 : 0))) <= 0.1 ? 'calibrated' : 'needs-calibration';
    return metrics;
  }

  root.FinForecastReliability = { MODEL_VERSION, HORIZONS, assessEligibility, runRollingBacktest, aggregateBacktests };
})(typeof globalThis !== 'undefined' ? globalThis : window);
