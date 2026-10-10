import assert from 'node:assert/strict';
import test from 'node:test';

await import('../app/src/main/assets/financial-action-planner.js');
const { buildPlans, replan } = globalThis.FinActionPlanner;

const base = {
  periods: 6,
  startingCash: 30000,
  monthlyIncome: 60000,
  incomeSd: 4000,
  essentialExpenses: 30000,
  essentialSd: 3000,
  debtMinimum: 6000,
  discretionaryBaseline: 10000,
  monthlySavingsGoal: 8000,
  totalDebt: 100000,
  minimumReserve: 20000,
  paths: 500,
};

test('compares three deterministic six-period action sequences with probabilistic ranges', () => {
  const result = buildPlans({ ...base, scenario: 'stable' });
  assert.equal(result.sequences.length, 3);
  assert.equal(result.horizon, '6 monthly periods');
  for (const sequence of result.sequences) {
    assert.equal(sequence.periods.length, 6);
    assert.equal(sequence.uncertainty.ranges.length, 6);
    assert.ok(sequence.uncertainty.shortfallRisk >= 0 && sequence.uncertainty.shortfallRisk <= 1);
    sequence.uncertainty.ranges.forEach(range => assert.ok(range.p10 <= range.p50 && range.p50 <= range.p90 && range.width >= 0));
  }
});

test('identical inputs produce identical plans and simulations', () => {
  assert.deepEqual(buildPlans(base), buildPlans(base));
});

test('income reduction and unexpected essential expense trigger replanning', () => {
  const stable = buildPlans({ ...base, scenario: 'stable' });
  const reduced = replan(base, { scenario: 'income-reduction' });
  const shocked = replan(base, { scenario: 'essential-shock', shockAmount: 25000 });
  assert.ok(reduced.sequences[0].periods[1].income < stable.sequences[0].periods[1].income);
  assert.ok(shocked.sequences[0].periods[1].essential > stable.sequences[0].periods[1].essential);
  assert.ok(reduced.sequences[0].uncertainty.shortfallRisk >= stable.sequences[0].uncertainty.shortfallRisk);
});

test('infeasible targets identify conflicts and explicit relaxations', () => {
  const result = buildPlans({ ...base, scenario: 'infeasible', minimumReserve: 45000, monthlySavingsGoal: 20000 });
  assert.ok(result.sequences.some(sequence => sequence.feasibility.infeasible));
  const infeasible = result.sequences.find(sequence => sequence.feasibility.infeasible);
  assert.ok(infeasible.feasibility.conflicts.length > 0);
  assert.ok(infeasible.feasibility.proposals.length > 0);
});

test('uncertainty can change the preferred plan', () => {
  const result = buildPlans({ ...base, scenario: 'stable' });
  assert.equal(result.uncertaintyChangedPreference, true);
  assert.notEqual(result.recommendedId, result.riskNeutralId);
  const recommended = result.sequences.find(sequence => sequence.id === result.recommendedId);
  const riskNeutral = result.sequences.find(sequence => sequence.id === result.riskNeutralId);
  assert.ok(recommended.uncertainty.shortfallRisk < riskNeutral.uncertainty.shortfallRisk);
});
