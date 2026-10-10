# Data model and analytics

This document describes the prototype's inputs, calculated signals, and forecasting approach. The goal is explainability: every important output can be traced to data and a named method.

## Transaction record

| Field | Meaning |
| --- | --- |
| `date` | Posting date in `YYYY-MM-DD` format |
| `description` | Merchant or transaction description |
| `amount` | Signed value; expenses may be negative |
| `category` | Income, Housing, Debt, Utilities, Subscriptions, Education, Health, or another user category |
| `type` | `income` or `expense` |

The normalization stage standardizes dates, signs, categories, and merchant names. Validation reports missing fields, duplicates, coverage, and high-value anomalies before results are calculated.

## Financial history

The profile supplements transactions with current cash balance, savings, investments, debt balances, emergency fund, credit limit and usage, and monthly net-worth snapshots. Each history point uses a `YYYY-MM` period key plus a display label so different years cannot collide.

## Health metrics

| Metric | Calculation |
| --- | --- |
| Net worth | Current cash + liquid savings + investments - total debt |
| Monthly cash flow | Monthly income - monthly spending |
| Savings rate | Positive monthly cash flow / monthly income |
| Emergency runway | Emergency fund / essential monthly spending |
| Credit utilization | Revolving credit used / revolving credit limit |
| Debt-service pressure | Required monthly debt payments / monthly income |
| Safe to spend | Available balance less near-term obligations and a safety buffer |

The dashboard groups metrics into cash flow, liquidity, debt, credit, and stability dimensions. Scores are directional educational indicators, not lending or credit decisions.

## Spending trend

Monthly spending totals are fitted with ordinary least squares:

```text
slope = sum((month - meanMonth) * (spend - meanSpend))
        / sum((month - meanMonth)^2)
```

A positive slope indicates spending is rising. An exponentially weighted moving average (`alpha = 0.35`) gives recent months more influence while retaining older evidence. Volatility is calculated from variation in observed monthly totals.

## Recurring obligations

Transactions are grouped by normalized merchant and category. A candidate needs at least three observations. FIN calculates:

- median interval between payments;
- interval coefficient of variation;
- amount coefficient of variation;
- next expected date from the most recent event and median cadence; and
- confidence from cadence and amount consistency.

Forecasted fixed commitments are restricted to categories such as Housing, Debt, Utilities, Subscriptions, Education, and Health so irregular discretionary purchases are not treated as bills.

## Debt pressure

Debt pressure is a bounded composite:

```text
pressure = 60% × debt-service-to-income
         + 25% × (total debt / annualized income)
         + 15% × revolving-credit utilization
```

The 0-100 result is an educational stress signal. Its contributing factors stay visible instead of being presented as an unexplained score.

## Cash-flow forecast

FIN runs 500 seeded Monte Carlo simulations over 30 days. Each path starts at the current balance, schedules detected obligations and expected income, then samples variable daily spending from recent behavior. Results are summarized as:

- P10: stress-case balance path;
- P50: median expected balance path;
- P90: upside balance path; and
- gap probability: share of simulations that fall below zero.

Using a deterministic seed makes the same input reproducible during a demo. The forecast is not a guarantee: missing transactions, changing income, unusual expenses, and short history can materially change the outcome.

## Forecast reliability and held-out validation

Analysis model 2.1 uses rolling-origin backtesting rather than a random train/test split. At each eligible historical cutoff, FIN gives the model only transactions posted on or before that date, reconstructs the balance at the cutoff from the current balance and subsequent ledger entries, forecasts the next 30 days, and compares the result with the held-out transactions. Recurring detection, trends, averages, and simulation inputs are recalculated from the training window so future records cannot leak into the prediction.

The reliability report contains:

- P50 mean absolute balance error at days 7, 14, and 30;
- empirical coverage and mean width of the P10-P90 interval;
- Brier score for the cash-gap event;
- first-gap-day error when both predicted and actual gaps exist;
- probability calibration bands; and
- the same balance errors for a naive average-daily-net-cash-flow baseline.

Historical balances are reconstructed and therefore depend on the imported ledger being complete. A backtest is evidence about past performance on the user's available data, not a guarantee of future accuracy.

### Minimum-data policy

| Available evidence | Forecast status |
| --- | --- |
| Under 30 observed days, fewer than 10 valid transactions, or no income observation | Unavailable: scenario path only; cash-gap probability is withheld |
| 30-89 days | Provisional scenario; cash-gap probability remains withheld |
| 90-179 days | Limited validation |
| 180+ days, recent data, and at least three completed held-out windows | Historically validated |

Recency, missing monthly periods, income observations, and recurring-cycle coverage are also reported as limitations. Data quality, minimum-data sufficiency, forecast interval width, calibration, and held-out accuracy remain separate concepts. The older stability percentage is retained internally as an input-stability heuristic and is not presented as validated accuracy.

## Data quality and persistence

Analysis model 2.0 normalizes income, spending, debt service, and category totals over the actual observed window, bounded to 30-90 days. Its quality score considers record volume, history span, category coverage, recency, duplicates, and uncategorized share. Forecast confidence combines model stability with this measured data quality.

On Android, normalized transactions and user-entered history are authoritative in SQLite. Every distinct recalculation input also creates a capped analysis record containing the model version, SHA-256 input fingerprint, record count, health score, net worth, debt pressure, cash-gap probability, confidence, and a JSON result summary. See [Database design](DATABASE.md).

## Recommendation context

Ask FIN uses calculated metrics together with the user's goal, monthly target, desired emergency-fund months, recommendation style, and time horizon. The local engine supports affordability checks, emergency-fund plans, debt-payoff estimates, and category-specific spending reductions. Optional AI receives only a summarized context.

## Constrained six-month action plans

The action planner uses declared monthly income, observed essential expenses, minimum debt obligations, discretionary spending, total debt, a monthly savings goal, current cash, and a user-declared minimum cash reserve. It compares balanced, reserve-first, and debt-first sequences for at least six monthly periods. Protected essential expenses and minimum debt payments are applied before discretionary, saving, or optional debt actions.

Each sequence is evaluated across 500 deterministic-seed paths using observed income and essential-expense variability. FIN reports reserve-shortfall risk and P10-P90 closing cash for every period. Income-reduction and essential-expense changes trigger a complete replan. When goals conflict, the plan lists the period and amount of each shortfall plus explicit relaxation proposals.

Positive imported transactions count as forecast income only when categorized as `Income`. Peer receipts from payment-activity statements use `Transfers` and are excluded until the user verifies and recategorizes them.

## Recommendation impact and change tracking

Every generated action includes a quantified outcome, a timeframe, a confidence score, and an uncertainty statement. Depending on the action, FIN reports projected monthly cash released, six-month buffer growth, emergency-runway change, simple debt reduction, bill coverage, or estimated cash-gap risk change.

FIN keeps three claim types separate:

- **Observed fact:** direct arithmetic from imported transactions or clearly labeled user-entered balances. A coverage score warns when the dataset may be incomplete.
- **Model prediction:** a probabilistic estimate with method, horizon, assumptions, and confidence.
- **Recommendation:** a suggested response to the facts and predictions, with expected impact and limitations.

Before any transaction, income, expense, debt, savings, category, or CSV update is applied, FIN stores the current model snapshot. After recalculation it compares health score, safe-to-spend, cash-gap probability, total debt, and the leading recommendation. This makes model sensitivity visible instead of silently replacing the previous answer.

