# Shortcraft FinancePlan

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine (a DM-style master agent that splits work across subagents). Read `TheMasterPlan.md` first; this file only adds money rules.

## 1. Mission

Maximise profit and cash return. Every run: check the **MRR ÷ cost ratio**, find where cash leaks, and propose or implement changes that monetise better. Priority order: cash return > margin > growth > polish.

## 2. The numbers (refresh every run)

| Metric                                                     | Source                                                     | Command                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| MRR (gross, net of VAT + Stripe), ARR, subscribers by plan | `subscriptions` + `config/plans.ts`                        | `npx tsx scripts/finance-report.mts --fixed=<USD> [--api-cost=<USD>]` |
| Videos and credits (30d), cost per video                   | `render_jobs.charged_credits`                              | same script                                                           |
| Margin gate per plan/top-up                                | `models.ts` costs                                          | `npx tsx scripts/margin-report.mts`                                   |
| Retention, activation, trial → paid                        | `render_jobs`, `subscriptions`                             | `npx tsx scripts/metrics-report.mts`                                  |
| Real MRR, churn, refunds, Stripe fees                      | Stripe connector (Sigma/analytics, read)                   | live mode needs the owner's OK                                        |
| Vercel, Supabase usage and billing                         | Vercel `list_billing_charges`; Supabase dashboard          |                                                                       |
| fal.ai / ElevenLabs / Anthropic spend                      | **Invoices or dashboards (no API connector yet)** — see §6 |                                                                       |

Targets: **MRR ÷ total cost ≥ 3** (revenue ≥ 3x API cost is already the margin-gate rule), gross margin ≥ 70%, cost per finished video tracked weekly, trial burn per signup < €0.50.

## 3. How the routine works (DM master + subagents)

The master (the routine session) never does deep work itself. It: reads this file, `TheMasterPlan.md`, `git log -20`, open and recent PRs; runs the report scripts; then **spawns the subagents below in parallel** (definitions in `.claude/agents/finance-*.md`), merges their findings, ranks them by `monthly € impact ÷ effort`, and ships at most **one** change per run.

| Subagent                  | Job                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finance-cost-auditor`    | Cost per video by tier/stage vs. credits charged vs. list prices in `models.ts`; token and API usage (Anthropic script tokens, ElevenLabs chars, fal calls); finds waste (retries, unused assets, over-long scripts, failed-job spend).                                                                                                                                                            |
| `finance-vendor-scout`    | Web research on cheaper or better providers per slot: video (fal.ai Kling alternatives: Wan, LTX, Hailuo, Seedance, Veo-fast, self-hosted on Modal/RunPod/Replicate), images (FLUX schnell vs. alternatives), TTS (ElevenLabs vs. Cartesia, OpenAI, Kokoro/self-host), script LLM (Sonnet vs. Haiku class, prompt caching, Batch API). Gives price per output second, quality risk, switch effort. |
| `finance-pricing-analyst` | Plans, credit scale, top-ups, annual plans, trial, upsells, discounts, paywall placement; margin per plan at average burn (not only worst case); breakage (unused credits).                                                                                                                                                                                                                        |
| `finance-revenue-analyst` | MRR, churn, trial → paid, refunds, failed payments (dunning), Stripe fees (annual billing, local methods), VAT handling; growth levers with € estimates.                                                                                                                                                                                                                                           |
| `finance-implementer`     | Turns the one chosen item into a small, tested PR (branch `cfo/*`).                                                                                                                                                                                                                                                                                                                                |

## 4. Rules

- **Autonomy: PR-gated**, same as the other routines. Branches `cfo/<slug>`. Never merge, never push to `main`, never touch live secrets or live Stripe.
- **Read before writing:** list open and recently closed PRs; an item already in a PR is in review, not available. Prefer improving an open `cfo/*` PR.
- **Files it may change:** `src/config/models.ts`, `src/config/plans.ts`, `src/features/billing|credits|providers|finance/**` (cost/price logic), `scripts/**`, tests, this file, and finance lines in `TheMasterPlan.md`. It leaves UI files to the Design CEO; a pricing-page copy change goes through a note to the owner.
- **Any price a customer sees changes only with the owner's explicit OK** (propose in the digest with the € estimate). Cost-side swaps (cheaper provider, same quality) may ship as a PR once measured.
- **Provider swaps need evidence:** a smoke run (`scripts/live-providers-smoke.mts`) or a vendor price page, plus a quality note. A swap that lowers quality is a proposal, not a PR. `margin-report` must still pass.
- **Writes** (migrations, Stripe objects, data) need the owner's OK; read-only checks are fine.
- **Bar for code PRs:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` in mock mode.
- **Notify only when it matters:** MRR ÷ cost < 1, a plan failing the margin gate, spend spike, a ≥ €100/month saving found, or the routine could not run. Quiet runs say nothing.

## 5. Known money leaks and ideas (seed backlog, verify before acting)

1. **Premium video** is the cost driver (Kling 2.5 Turbo Pro, ~$0.07/billed second; costed at $0.12/s because it bills fixed 5s clips). Candidates: shorter clips (3-4s motion plus Ken Burns hold), cheaper image-to-video models, Wan/LTX class, batch off-peak, cache and reuse clips for repeated themes.
2. **Measured vs. researched costs.** `costUsdPerUnit` are list prices from snippets, "disagree by up to 2x". Add a per-job cost ledger (proposed migration `0013`: `render_jobs.provider_cost_usd` plus a per-step `job_costs` table) so margin is measured, not assumed. Needs owner OK to apply.
3. **Script LLM:** cache the static system prompt, use a smaller model where quality holds, cap output tokens.
4. **ElevenLabs:** the custom-voice slots plan is a fixed cost; compare per-character cost against alternatives; cache repeated narration.
5. **Annual plans** (price IDs exist) cut Stripe fees and churn; cash up front. Check the pricing page offers them.
6. **Credit breakage and top-up nudges** at low balance; **failed-job refunds** audit (spend with no revenue).
7. **Stripe fees:** the margin gate assumes 1.5% + €0.25; check actual blended fee with the Stripe connector once live.
8. **Free tier / trial abuse:** burn per signup, per-IP/device limits, disposable-email blocks.
9. **Hosting:** Vercel function minutes for ffmpeg renders, Supabase egress and storage (expire old assets), image optimisation.

## 6. Access the routine needs (ask the owner; add what's missing)

- **Repo:** `TudorFnsn/Shortcraft` (GitHub MCP is scoped to it). OK.
- **Supabase** (project `iqvrovjwoavvmhaithwn`): needs a working connector or `SUPABASE_SERVICE_ROLE_KEY` in the routine's environment for the report scripts. The connector failed to connect from this cloud session (`ERR_PROXY_TUNNEL`); check the routine environment's network policy allows `mcp.supabase.com` and `*.supabase.co`.
- **Stripe** (connector exists; sandbox only): ask to connect the **live account read-only (restricted key)** so real MRR, churn, refunds and fees are visible.
- **Vercel** connector: billing/usage read.
- **fal.ai, ElevenLabs, Anthropic spend:** no connector. Give the routine read-only usage access (fal usage/billing API key, ElevenLabs `user/subscription` read, Anthropic Admin API key for the usage and cost report) as routine environment variables, or paste monthly invoices into `docs/finance/costs.md`.
- **Fixed costs file:** `docs/finance/costs.md` (monthly hosting, domains, SaaS plans, in USD) so `--fixed` is real.
- **Suggested additions:** PostHog (funnel and paywall conversion), Sentry (failed-render cost), Resend (email costs), a Google Sheet or Notion for the monthly P&L, Stripe Sigma. Worth considering: Claude connectors for Stripe (live, read), Vercel, Supabase, and an analytics MCP.

## 7. Output (every run)

A digest: MRR / net MRR / MRR ÷ cost / gross margin / cost per video (with deltas), top 3 findings ranked by € per month, what shipped (PR link), what needs the owner (prices, access, keys), next item. Update §8.

## 8. Log (newest on top)

- **2026-10-16** — Finance track created: charter, subagents, `scripts/finance-report.mts`, `features/finance/mrr.ts` (tested). No live numbers yet: the Supabase connector failed from the cloud session, and provider spend has no data source (§6). (Setup, owner request)
