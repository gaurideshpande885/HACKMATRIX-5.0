# FIN 1.10.0 release

## Product changes

- Adds a prominent six-month planner entry on the home dashboard and quick actions.
- Compares balanced, reserve-first, and debt-first action sequences period by period.
- Replans for stable income, a 30% income reduction, an unexpected essential expense, and an infeasible target.
- Reports P10, P50, and P90 balances plus reserve-shortfall risk from 500 reproducible Monte Carlo paths.
- Shows constraint conflicts, proposed relaxations, trade-offs, and when uncertainty changes the preferred sequence.
- Reports rolling held-out forecast error, prediction-interval coverage and width, Brier score, calibration, and a historical-average baseline.
- Imports supported PDF statements locally on Android and keeps incoming Google Pay peer transfers separate from earned income.
- Recognizes the actual Google Pay PDF row order (`date -> payment details -> amount -> time -> UPI ID`) as well as alternate PDF extraction order and missing rupee glyphs.

## Release identity

- Product version: `1.10.0`
- Android version code: `12` (Google Pay analyzer hotfix build)
- Minimum Android version: Android 7.0 / API 24
- Target Android SDK: 35

The Android WebView loads `index.html?release=1.10.0` with `LOAD_NO_CACHE`, preventing a previous packaged interface from masking the new release after an app update.

## Verification commands

```bash
npm ci
npm run check
npm test
gradle clean assembleDebug
gradle assembleRelease bundleRelease
```

The debug build is immediately installable for demonstration. Production artifacts must be signed. The protected **Android release** GitHub workflow runs the complete verification gate, then creates a signed APK and AAB using repository secrets without writing credentials into source control.

## Required production configuration

Configure these secrets in the protected GitHub `production` environment:

- `FIN_ANDROID_KEYSTORE_BASE64`
- `FIN_RELEASE_STORE_PASSWORD`
- `FIN_RELEASE_KEY_ALIAS`
- `FIN_RELEASE_KEY_PASSWORD`

Configure `FIN_API_BASE_URL` as a non-secret environment variable when the managed Copilot API is deployed. If it is absent or unreachable, the Android app continues in its local evidence mode.
