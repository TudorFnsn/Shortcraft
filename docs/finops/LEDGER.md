# FinOps ledger

Appended by the FinOps routine (`.claude/routines/finops.md`). Newest first.

| Metric | Value | Source |
|---|---|---|
| MRR | not measured yet | needs Stripe access |
| Gross margin | not measured yet | needs Supabase `render_jobs.api_cost_usd` |
| Worst-case plan multiple | ~3.1x on Pro (derived from catalog; confirm with `scripts/margin-report.mts`) | `src/config/models.ts` |

## 2026-10-17 – baseline (setup run)
- Biggest cost line in the catalog: premium AI video (Kling 2.5 Turbo Pro on fal, ~$0.07/s billed, catalog bound $0.12/s). Standard videos use in-house Ken Burns at $0 video cost, so only premium tier is exposed.
- Premium credit price (1,420 credits/s) was set as the smallest value passing the 3x gate on Pro, so any cheaper video model lets us either cut credits/s (more conversion) or keep it as pure margin.
- Catalog costs are list prices, not measured. First job: measure real cost per video.
- Data blocked this run: Stripe (OAuth pending), Supabase MCP (proxy tunnel error), fal / ElevenLabs / Anthropic usage (no access).
