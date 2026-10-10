# FIN 1.10.1 release

FIN 1.10.1 is the release-management and product-polish update.

## Changes

- Adds an in-app **What's new** panel showing the installed semantic version and Android build number.
- Uses `release.json` as shared release metadata for Android builds and automated consistency checks.
- Removes hard-coded Android WebView and user-agent versions in favor of generated build metadata.
- Adds `npm run version:bump -- <major.minor.patch>` so future updates increment every required product surface together.
- Makes the signed CI artifact name version-neutral while the APK/AAB metadata remains authoritative.
- Retains the Google Pay statement analyzer fix, six-month constrained planner, and forecast-reliability evidence introduced in 1.10.0.

## Identity

- Product version: `1.10.1`
- Android version code: `13`
- Release channel: production candidate
