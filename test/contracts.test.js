import test from 'node:test';
import assert from 'node:assert/strict';
import { copilotRequestSchema, copilotResponseSchema } from '../lib/contracts.js';
import { validAnswer, validRequest } from './fixtures.js';

test('accepts a bounded financial-summary request', () => {
  assert.equal(copilotRequestSchema.safeParse(validRequest()).success, true);
});

test('rejects raw or malformed request fields', () => {
  const payload = validRequest();
  payload.transactions = [{ amount: -500 }];
  payload.question = 'x'.repeat(801);
  const parsed = copilotRequestSchema.safeParse(payload);
  assert.equal(parsed.success, false);
});

test('accepts a withheld cash-gap probability with validation evidence', () => {
  const payload = validRequest();
  Object.assign(payload.financialContext.prediction, {
    cashGapProbability: null,
    validationStatus: 'unavailable',
    completedBacktests: 0,
    day30Mae: null,
    intervalCoverage: null,
    brierScore: null,
    calibrationStatus: 'unavailable',
  });
  assert.equal(copilotRequestSchema.safeParse(payload).success, true);
});

test('requires separate facts, predictions, recommendations, and impact', () => {
  assert.equal(copilotResponseSchema.safeParse(validAnswer).success, true);
  const missingImpact = structuredClone(validAnswer);
  delete missingImpact.recommendations[0].expectedImpact;
  assert.equal(copilotResponseSchema.safeParse(missingImpact).success, false);
});

test('accepts a calculated spending plan and category ranking', () => {
  const payload = validRequest({
    categories: [{ name: 'Housing', monthlyAverage: 18000, plannedMonthlyCap: 18000, sharePercent: 39, flexible: false }],
    plan: {
      today: '2026-10-10',
      monthlyIncome: 60000,
      plannedBills: 25500,
      goalContribution: 6000,
      everydayBudget: 20500,
      dailyAllowance: 683,
      weeklyAllowance: 4781,
      unallocated: -500,
      flexibleTrimPercent: 12,
      spentToday: 240,
      upcoming: [{ kind: 'bill', label: 'Housing bill', amount: 18000, date: '2026-10-15' }],
    },
  });
  const parsed = copilotRequestSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.financialContext.plan.dailyAllowance, 683);

  payload.financialContext.plan.upcoming[0].date = 'next Thursday';
  assert.equal(copilotRequestSchema.safeParse(payload).success, false);
});

test('accepts a schedule answer', () => {
  assert.equal(copilotResponseSchema.safeParse({
    directAnswer: 'Here is your plan for the month.',
    schedule: [{ period: 'Week 1', plan: 'Spend up to ₹4,781 on everyday costs; Housing bill ₹18,000 due 15 Oct.' }],
    sourceIds: [],
  }).success, true);
});

test('accepts a conversational answer without irrelevant financial sections', () => {
  assert.equal(copilotResponseSchema.safeParse({
    directAnswer: 'Hi! I’m FIN. How can I help?',
    sourceIds: [],
  }).success, true);
});
