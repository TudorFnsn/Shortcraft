# Finance ledger

Append-only log kept by the Finance CFO routine (`docs/routines/finance-cfo.md`).
Newest entry on top. Each entry: metrics snapshot, findings, proposals with
expected USD/month, what shipped, what the owner still needs to supply.

## 2026-10-16 — routine created

- No metrics yet: the routine has not run. Baseline from the repo (margin gate, `scripts/margin-report.mts`): Starter 9.4x, Pro 3.0x, Ultra 3.2x, top-ups 4.0–5.9x, trial burn $0.14 (TheMasterPlan §7).
- Known weak point: Pro has zero headroom, and premium AI video (fal.ai Kling, ~$0.07/billed second, fixed 5s clips) is the only slot with real per-video cost. Standard is animated stills at ~$0.07 per 15s video.
- Owner to supply: authorize the Stripe connector; monthly amounts for the fixed vendors in `docs/finance/vendors.json`; fal.ai / ElevenLabs / Anthropic invoices or read-only usage keys; whether yearly billing is live.
