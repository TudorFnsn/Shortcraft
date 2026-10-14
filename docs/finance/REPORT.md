# Finance report log

Newest first. Written by the Finance CFO routine (`docs/routines/finance-cfo.md`).

## 2026-10-14 — routine created (no data run yet)

- Baseline from the repo only: margin gate passes (Starter 9.4x, Pro 3.0x, Ultra 3.2x, top-ups 4.0–5.9x per TheMasterPlan §5); Pro has zero headroom on premium AI video at the catalog's $0.12/s.
- Real costs are still list prices: the 2026-10-08 live renders measured $0.037 (15s Standard), $0.049 (30s Standard), $1.92 (30s Premium); invoiced provider totals have not been supplied.
- Stripe is sandbox-only, so MRR is not yet real money.
- Blocked this run: Supabase MCP did not connect (`ERR_PROXY_TUNNEL`), so `finance-report` could not run against the database.
- Needs the owner: see "Questions the owner should answer once" in the routine doc.
