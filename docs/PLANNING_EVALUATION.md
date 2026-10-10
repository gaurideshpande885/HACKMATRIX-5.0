# Constrained planning and probabilistic forecast evaluation

## Product scope

FIN analysis model 2.1 combines a six-month constrained action planner with the existing 30-day probabilistic cash-flow engine. The planner compares three action sequences:

1. **Balanced progress:** moderate discretionary reduction, saving, and extra debt repayment.
2. **Reserve first:** stronger discretionary reduction and saving before optional debt overpayment.
3. **Debt first:** prioritizes optional principal reduction and accepts less saving progress.

Every sequence includes opening cash, forecast income, essential expenses, required debt payment, discretionary allowance, saving contribution, optional debt payment, closing cash, and a P10-P90 closing-balance range for every month. The user declares monthly income, a minimum cash reserve, and a monthly savings target. Imported peer transfers are not assumed to be earned income.

## Constraints and replanning

Required constraints are applied in this order:

- essential expenses;
- contractual minimum debt payment;
- declared minimum cash reserve; and
- the selected sequence's discretionary, saving, and optional-debt priorities.

When all requests cannot fit above the reserve, FIN reduces lower-priority actions and reports each conflict. It proposes an explicit relaxation, such as deferring part of the savings target, adding income equal to the reserve gap, temporarily lowering the reserve by a stated maximum, or renegotiating optional debt overpayments. It never proposes reducing essential expenses or required debt payments as the first relaxation.

The planner recalculates all six periods and all three sequences after a declared-income, reserve, target, expense, or scenario change.

## Uncertainty method

Each action sequence is evaluated with 500 reproducible Monte Carlo paths. Monthly income and essential expenses vary using the observed monthly standard deviations. The current scenario can also apply a declared structural income reduction or a one-time essential-expense shock. FIN reports:

- probability that cash falls below the declared reserve in any period;
- P10, P50, and P90 closing cash by period;
- P10-P90 interval width; and
- the change in preferred sequence caused by shortfall risk.

The risk-neutral comparison maximizes planned saving plus optional debt reduction. If another sequence lowers reserve-shortfall probability by at least two percentage points, uncertainty changes the preferred plan and FIN names both plans and both risks.

## Required demonstration cases

| Case | Synthetic assumption | Expected evidence |
| --- | --- | --- |
| Stable income | Declared income and observed variability continue for six months | Three period-level plans and their reserve-shortfall risks |
| Income reduction | Declared income falls 30% from month 2 | All periods are replanned; optional actions contract before protected obligations |
| Unexpected essential expense | A one-time essential expense is added in month 2 | Wider/downward balance range and changed shortfall risk |
| Infeasible target | Income falls 40% from month 2 and the essential shock occurs | Explicit conflicts and quantified relaxation proposals |
| Uncertainty changes preference | Risk-neutral progress is compared with simulated reserve risk | Aggressive plan is replaced when another plan reduces risk by at least two percentage points |

These scenario changes are synthetic perturbations used for demonstration. They are not inferred claims about an imported user's future.

## Sample statement study

The supplied Google Pay activity statement covers 4 April through 30 September 2026. The importer recovered 541 unique UPI entries and reconciled to the statement totals of INR 110,163.34 sent and INR 96,063 received. Incoming entries are peer transfers or rewards in this source, not verified salary records. FIN therefore imports them as `Transfers`, excludes them from earned-income forecasts, and asks the user to declare or recategorize verified income before action planning.

The statement is useful for observed payment frequency, variable expense amounts, merchant/category patterns, and recurring obligations. It is not a complete account ledger because Google Pay explicitly excludes some activity and does not provide a running bank balance. The user-entered current balance remains authoritative.

No personal identifiers or raw statement rows are copied into the repository or sent to the Copilot API.

## Train-validation-test timeline

FIN uses chronological splits only:

```text
Expanding training history -> earlier held-out 30-day validation windows -> latest untouched 30-day test window
```

- **Training:** only records posted on or before each cutoff are used for recurring detection, trends, distributions, and model inputs.
- **Validation:** completed middle rolling windows measure P50 MAE, interval coverage and width, Brier score, and gap-day error.
- **Test:** the latest complete held-out 30-day window is reported separately in the product timeline.
- **Baseline:** each held-out window also receives a historical-average daily net-cash-flow forecast.

Future records never enter the training calculation for their cutoff. Synthetic scenario generation is separate from these real/synthetic history periods and is used only to stress the six-month plans.

## Evidence delivered

- period-level expected cash plans for three sequences;
- per-period P10-P90 simulated outcomes;
- declared constraints and any violated goal;
- explicit relaxations for infeasible plans;
- replanning controls for all required cases;
- held-out forecast errors, coverage, interval width, Brier score, and baseline comparison; and
- an explicit train-validation-test timeline.
