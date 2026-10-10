# FIN - Financial Health Copilot

<p align="center">
  <strong>An explainable, privacy-conscious Android copilot for understanding money today and planning for what comes next.</strong>
</p>

<p align="center">
  <img alt="Android 7+" src="https://img.shields.io/badge/Android-7.0%2B-3DDC84?logo=android&logoColor=white">
  <img alt="Version 1.10.5" src="https://img.shields.io/badge/version-1.10.5-6D5DFC">
  <img alt="Hackathon prototype" src="https://img.shields.io/badge/status-hackathon%20prototype-F4B942">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-1F9D8A">
</p>

FIN turns consented transaction and financial-history data into a consolidated health view, probabilistic cash-flow forecasts, explainable risk signals, and personalized conversations. The core experience works offline; a versioned server API can add structured AI explanations without putting a provider credential in the APK.

<p align="center">
  <a href="https://github.com/AnantHejib/HACKMATRIX-5.0/releases/latest"><strong>Download the latest APK</strong></a>
  &nbsp;|&nbsp;
  <a href="docs/DEMO_GUIDE.md">Run the demo</a>
  &nbsp;|&nbsp;
  <a href="docs/ARCHITECTURE.md">Explore the architecture</a>
</p>

## Product preview

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/login.png" alt="FIN login" width="270"><br><strong>Secure demo login</strong></td>
    <td align="center"><img src="docs/screenshots/financial-health.png" alt="Consolidated financial health dashboard" width="270"><br><strong>Financial-health overview</strong></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/predictive-insights.png" alt="Predictive cash-flow insights" width="270"><br><strong>Predictive insights</strong></td>
    <td align="center"><img src="docs/screenshots/ask-fin.png" alt="Personalized Ask FIN conversation" width="270"><br><strong>Personalized Ask FIN</strong></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/action-impact.png" alt="Action Center with quantified expected impact" width="270"><br><strong>Quantified action impact</strong></td>
    <td align="center"><img src="docs/screenshots/change-simulator.png" alt="Financial update and recommendation comparison" width="270"><br><strong>Live change simulator</strong></td>
  </tr>
  <tr>
    <td align="center" colspan="2"><img src="docs/screenshots/data-vault.png" alt="Financial data vault with SQLite status and normalized transactions" width="270"><br><strong>Durable financial data vault</strong></td>
  </tr>
</table>

## Expected outputs delivered

| Expected output | FIN implementation |
| --- | --- |
| Consolidated financial-health view | Combines transactions, current cash, balances, debt, credit utilization, savings, income, and monthly history from a versioned SQLite data vault. |
| Spending and obligation analysis | Normalizes the actual observed window, detects category trends and cadence-qualified commitments, and calculates composite debt pressure and safe-to-spend capacity. |
| Future cash-flow gaps | Runs 500 reproducible Monte Carlo paths, reports P10/P50/P90 balances, withholds unsupported probabilities, and evaluates eligible forecasts on held-out history. |
| Conversational financial guidance | Answers locally or through a managed Copilot API whose schema requires facts, predictions, recommendations, expected impact, confidence, and change reasoning. |
| Login and analysis system | Includes passwordless demo OTP login, local sessions, CSV validation, a seven-stage analysis workspace, evidence records, and an audit trail. |
| Expected action impact | Quantifies each recommendation with a timeframe, before/after values, confidence, assumptions, and missing information. |
| Decision transparency | Separates observed facts, probabilistic predictions, and recommendations in both insights and conversational answers. |
| Adaptive recommendations | Captures a before/after model snapshot whenever income, expenses, debt, savings, categories, or CSV data change. |

## Core capabilities

- Consent-first onboarding with a synthetic demo dataset
- Passwordless local prototype login and persistent on-device sessions
- Versioned native SQLite storage with transactional writes and migration from earlier local prototype data
- Persisted analysis audit records with input fingerprints, model version, confidence, and output summaries
- Net worth, cash flow, savings rate, emergency runway, debt pressure, and credit utilization
- Editable financial history and month-by-month net-worth tracking
- CSV import with validation, duplicate checks, coverage scoring, and anomaly detection
- Spending-pattern analysis using ordinary least squares and exponentially weighted averages
- Recurring-obligation detection using median cadence and consistency confidence
- 30-day probabilistic balance forecast with uncertainty bands
- Rolling-origin historical backtests with day-7/day-14/day-30 error, interval coverage, Brier score, calibration bands, and a naive baseline comparison
- Explicit unavailable, provisional, limited, and historically validated forecast states
- Six-month constrained action planning across reserve-first, balanced, and debt-first sequences
- Period-level balances, P10-P90 outcomes, reserve-shortfall risk, automatic replanning, and explicit infeasibility relaxations
- Personalized affordability, emergency-fund, debt-payoff, and spending-reduction recommendations
- Quantified recommendation impact across monthly and six-month horizons
- Separate observed-fact, model-prediction, and recommendation layers
- Live change-impact comparison after adding income, expenses, debt, savings, or imported transactions
- Correctable categories and immediate model recalculation
- Recommendation action center with accept, complete, and dismiss feedback
- Managed structured-output Copilot API through Vercel AI Gateway, with no provider key embedded in the APK
- Curated retrieval grounding from RBI, MoSPI, and Open Government Data India sources
- Synthetic contract and behavior evaluations for changed income, expense, and debt scenarios
- Private on-device LinUCB recommendation ranking with bounded safe exploration and SQLite feedback events
- Liquid-morphism light and dark themes with a persistent theme switch
- Animated secure-payment startup experience with reduced-motion support

## How prediction works

FIN uses transparent statistical methods rather than presenting a black-box score:

1. Monthly spending trend is estimated with ordinary least squares.
2. Recent behavior is weighted with an EWMA using `alpha = 0.35`.
3. Recurring payments require at least three matching events and are scored from interval and amount consistency.
4. Debt pressure combines debt-service ratio (60%), total-debt leverage (25%), and revolving-credit utilization (15%).
5. The next 30 days are simulated across 500 deterministic-seed Monte Carlo paths.
6. Historical cutoff windows measure forecast error, interval coverage, cash-gap calibration, and performance against a naive baseline without future-data leakage.
7. Minimum-data rules withhold the cash-gap probability when the available history cannot support it.
8. Every major result includes its method, assumptions, data sufficiency, validation status, source records, and limitations.

See [Data model and analytics](docs/DATA_MODEL.md) for definitions and formulas.

See [Planning and forecast evaluation](docs/PLANNING_EVALUATION.md) for constrained-plan demonstrations, baseline comparisons, and chronological train-validation-test evidence.

See [FIN 1.10.0 release notes](docs/RELEASE_1.10.0.md) for the release identity, verification gate, and signed deployment configuration.

Run `npm run version:bump -- <next-version>` for each new release. The command updates the shared release metadata, package versions, visible browser fallback, README badge, and Android build number together; `npm run check` rejects any drift before packaging.

## Architecture

```mermaid
flowchart LR
    A[CSV or synthetic data] --> B[Validation and normalization]
    H[Financial history] --> B
    B --> DB[Versioned SQLite data vault]
    DB --> C[Local financial model 2.0]
    C --> D[Health dashboard]
    C --> E[Forecast and risk engine]
    C --> F[Offline Ask FIN]
    F --> G[Versioned Copilot API]
    G --> GW[Vercel AI Gateway]
    GW --> LM[Environment-selected model]
    E --> I[Evidence and actions]
    G --> I
```

The APK is a compact native Android shell around a local WebView application. Android handles file selection, app-private SQLite persistence, and device integration; the embedded interface performs deterministic analytics. See [Architecture](docs/ARCHITECTURE.md) and [Database design](docs/DATABASE.md) for the full flow.

## Install and demo

1. Download the APK from the [latest GitHub release](https://github.com/AnantHejib/HACKMATRIX-5.0/releases/latest).
2. Install it on Android 7.0 or newer. Android may ask you to allow installs from your file manager.
3. Enter any valid email address or 10-15 digit mobile number.
4. Use demo OTP `246810`.
5. Choose **Explore the prototype** and open the prominent **Plan the next six months** card on the dashboard.

Full presentation steps are in the [demo guide](docs/DEMO_GUIDE.md).

## Import your own CSV

```csv
date,description,amount,category,type
2026-09-01,Campus stipend,58000,Income,income
2026-09-02,Apartment rent,-16500,Housing,expense
```

Dates use `YYYY-MM-DD`. Expenses can use negative amounts or `type=expense`. Imported data remains on the device.

## Managed Copilot API

The Android client calls `/api/v1/copilot` on a deployment URL compiled into the build. The server validates a bounded financial-summary contract, retrieves relevant official guidance, and requests schema-validated output through Vercel AI Gateway. Raw transactions, merchant descriptions, and AI credentials remain outside the request. Without an endpoint—or during an outage—Ask FIN automatically uses its on-device evidence mode.

See [Copilot API](docs/COPILOT_API.md) for local setup, deployment, request boundaries, and production controls, and [dataset strategy](docs/DATASETS.md) for the grounding and evaluation approach.

## Build from source

Requirements: Node.js 22+, JDK 17+, and Android SDK 35.

```bash
npm ci
npm run check
npm test
gradle assembleDebug -PFIN_API_BASE_URL=https://your-fin-api.vercel.app
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions validates the API and embedded client before building a downloadable APK for every change to `main` and every pull request.

For a production-signed release, configure the protected `production` GitHub environment with `FIN_ANDROID_KEYSTORE_BASE64`, `FIN_RELEASE_STORE_PASSWORD`, `FIN_RELEASE_KEY_ALIAS`, and `FIN_RELEASE_KEY_PASSWORD`, plus the non-secret `FIN_API_BASE_URL` variable. Running the **Android release** workflow produces both a signed APK and Play Store AAB only after all checks and tests pass.

## Repository map

```text
app/src/main/assets/index.html                 UI and financial analytics
app/src/main/assets/forecast-reliability.js    Minimum-data policy, rolling backtests, calibration, and error metrics
app/src/main/assets/financial-action-planner.js Six-period constrained plans, scenarios, trade-offs, and shortfall simulation
app/src/main/java/com/ctrlaltelite/fin/       Android host, SQLite layer, JS bridge, and CSV picker
api/ and lib/                                 Versioned Copilot API, contracts, retrieval, and AI orchestration
test/ and evals/                              API tests and synthetic behavior-evaluation cases
docs/                                         Architecture, model, and demo notes
.github/workflows/android.yml                 Reproducible Android CI build
FIN_Financial_Health_Copilot_...pptx          Original hackathon presentation
```

## Privacy and limitations

FIN is an educational hackathon prototype, not investment, lending, credit, tax, or legal advice. Authentication is a local demo flow, not production identity verification. Forecasts are estimates based on available data and should be reviewed alongside real account information.

Security and responsible disclosure details are in [SECURITY.md](SECURITY.md).

## Team

- Gauri Deshpande
- Nehali Shelar
- Anant Hejib
