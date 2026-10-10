# FIN 1.10.2 release

FIN 1.10.2 replaces order-dependent PDF parsing with a structured real-world transaction ingestion pipeline.

## Ingestion flow

1. Android extracts each PDF twice: once by page position and once in content-stream order.
2. FIN detects Google Pay statements with whitespace-insensitive fingerprints.
3. Dates, payment direction, merchant, amount, and UPI transaction ID are normalized into structured records.
4. The two extraction candidates are independently parsed and the candidate with the most valid records is selected.
5. Records are deduplicated by UPI transaction ID and validated before entering SQLite.
6. Only the structured dataset is sent to spending, recurring-obligation, forecast, and six-month planning calculations.

## Compatibility improvements

- Accepts dates such as `04Apr,2026`, `04 Apr, 2026`, and extraction-added whitespace.
- Accepts spaced UPI IDs and optional punctuation around the ID label.
- Accepts preserved, altered, or missing rupee glyphs.
- Handles amount-before-time and alternate content-order layouts.
- Reports which extraction mode produced the imported structured dataset.

## Identity

- Product version: `1.10.2`
- Android version code: `14`
- Release channel: production candidate
