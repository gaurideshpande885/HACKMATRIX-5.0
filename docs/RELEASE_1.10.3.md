# FIN 1.10.3

FIN 1.10.3 connects the Home dashboard directly to the structured statement dataset.

## Dashboard integration

- Anchors the latest-month metrics and six-month charts to the newest transaction in the imported statement.
- Refreshes stability, health dimensions, financial position, financial history, attention signals, the best next action, planning inputs, and spending after import.
- Shows imported net flow, incoming payments, outgoing payments, statement coverage, and record count when verified balance-sheet data is unavailable.
- Replaces demo net-worth history with a statement-derived cumulative cash-flow history.
- Keeps incoming Google Pay transfers separate from verified earned income.

## Planning integrity

- Uses imported expenses, essential categories, recurring obligations, and observed variability.
- Requests opening cash and declared monthly earned income when the statement cannot supply them.
- Clears previous planner assumptions after a new statement import.

## Verification

- Statement-window tests confirm that an April–September statement renders April–September even when the device is already in October.
- Dashboard totals are tested for incoming payments, outgoing payments, and net statement flow.
- The complete API, forecast, planning, learning, statement-import, and release checks pass.
