# FIN demo guide

This path demonstrates the complete story in about four minutes.

## 1. Sign in

Open FIN, enter any valid email address or 10-15 digit mobile number, and use demo OTP `246810`. Explain that this is a passwordless prototype flow stored locally on the device.

## 2. Load consented demo data

Choose **Explore demo data**. The included records are synthetic and populate transactions, balances, liabilities, history, and user preferences without exposing personal information.

## 3. Show the consolidated view

Open **Health** and highlight:

- net worth and monthly cash flow;
- savings rate and emergency runway;
- credit utilization and debt pressure; and
- the five explainable health dimensions.

Open any evidence affordance to show the method, inputs, confidence, assumptions, and limitations behind the result.

## 4. Compare constrained six-month plans

From the dashboard, open **Plan the next six months**. Compare the balanced, reserve-first, and debt-first sequences and show each month's opening cash, income, essential expenses, debt obligations, discretionary spending, savings, extra debt payment, closing cash, and P10-P90 range.

Switch through **Stable income**, **Income -30%**, **Essential shock**, and **Infeasible target**. Point out the reserve-shortfall risk, automatic replanning, explicit constraint conflict, proposed relaxation, and the case where uncertainty changes the preferred plan.

## 5. Explain predictive insights

Open **Predict**. Point out detected recurring obligations, spending direction, 30-day P10/P50/P90 balance paths, and cash-gap probability. Emphasize that the engine uses transparent statistical methods and 500 reproducible simulations.

## 6. Ask a personal question

Open **Ask FIN** and try:

```text
Can I afford a 12000 purchase next month?
```

Then try:

```text
How can I build a three-month emergency fund?
```

The offline engine uses the current financial model and preferences. A deployment build can use the managed Copilot API to demonstrate a structured response that separately labels observed facts, model predictions, recommendations, expected impact, confidence, and what changed. Open **More > Copilot service** to check API health.

## 7. Turn insight into action

Open the action center and compare the expected monthly or six-month impact, confidence, timeframe, and limitations for every recommendation. Save a recommendation and mark it accepted or complete.

## 8. Demonstrate adaptation

Open **Data > Add update** and add an example income, expense, debt balance, or savings balance. FIN reruns the model and displays the before/after health score, cash-gap risk, safe-to-spend amount, debt, and leading recommendation. A CSV import, category correction, or full history update triggers the same comparison.

## Presenter notes

- Forecasts express uncertainty; they do not claim certainty.
- Raw transaction rows stay on-device during optional AI requests.
- No provider API key is embedded in the APK or entered by the user.
- The app is educational and does not replace regulated financial advice.

