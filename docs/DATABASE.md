# Financial data vault

FIN keeps the authoritative financial dataset in Android's app-private SQLite storage. Browser preview retains a local-storage fallback, while the installed APK uses schema version 3 with additive learning-state and forecast-validation migrations.

## Schema

| Table | Purpose | Important fields |
| --- | --- | --- |
| `transactions` | Normalized income and expense ledger | stable ID, posting date, signed amount, category, type, source, timestamps |
| `financial_profile` | Current consolidated balance snapshot | cash, savings, investments, total debt, emergency fund, credit values |
| `financial_history` | Monthly net-worth series | unique `YYYY-MM` period, label, assets, debt |
| `analysis_runs` | Reproducible model audit trail | SHA-256 input hash, model output JSON, health score, debt pressure, nullable/withheld gap-risk sentinel, validation status, backtest count, day-30 MAE, interval coverage, Brier score, calibration status |
| `feedback_events` | Private adaptive-ranking audit trail | decision/action IDs, event, bounded reward, propensity, context, policy version |
| `policy_state` | Current local LinUCB state | version, interaction count, matrices and reward vectors, update time |

Indexes support date-ordered transaction reads, category evidence lookups, and newest-first analysis reads. Foreign-key enforcement and write-ahead logging are enabled. Transaction replacement and profile/history updates run inside database transactions.

## Lifecycle

1. On first launch, FIN opens the versioned database.
2. If the database is empty, existing v1.5 local data is normalized and migrated; otherwise the bundled synthetic dataset is seeded.
3. CSV imports replace the ledger atomically after validation. Manual updates use targeted upserts.
4. Profile saves replace the current profile and its 12-month history within one transaction.
5. A recalculation stores a new analysis only when its input fingerprint differs from the latest run. Validation evidence is stored both in indexed columns and in the backward-compatible result JSON.
6. The newest 100 analysis runs are retained.
7. The newest 2,000 learning events are retained; policy updates and their triggering feedback are written transactionally.

Imports are capped at 10,000 records. IDs, date shape, description, finite non-zero amount, type, non-negative balances, credit-score range, and credit-limit consistency are validated at the native boundary.

## Privacy boundary

The database is scoped to the Android application and excluded from Android backup. It is not advertised as independently encrypted; device encryption and screen-lock policy still matter. No provider key is embedded, and raw transaction rows or merchant descriptions are not included in managed Copilot requests.
