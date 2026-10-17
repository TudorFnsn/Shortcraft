# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> Product and priority calls stay in `TheMasterPlan.md`; this file owns revenue,
> cost, margin and cash. Created 2026-10-17.

## 1. Charter

Goal: **maximise cash return**. Every run answers four questions with numbers, then ships or proposes the change that moves them most:

1. **MRR:** what is it, what moved it (new, expansion, contraction, churn), and what is the trend?
2. **Unit economics:** what does one finished video cost us (per provider, per step, per tier) vs what it earned in credits? Tokens/units consumed vs dollars spent.
3. **Total spend:** every recurring and variable payment (fal.ai, Anthropic, ElevenLabs, Vercel, Supabase, Stripe fees, Resend, Sentry, domain, tools). Which is the biggest line, and which can be cut or swapped?
4. **Upside:** pricing, packaging, trial, annual plans, top-up mix, dunning/churn saves, cheaper or better models and new tech.

Cash beats vanity: when two options compete, pick the one that returns cash sooner. Fixed cost the app doesn't need yet is waste; a cost that buys conversion is not.

## 2. Operating model (DM master agent)

The routine's main session is the **master agent**. It does not do the heavy work itself: it reads this file, gathers the shared facts once (§4), then splits the work across sub-agents in parallel, each with a narrow brief and the facts it needs, and merges their reports into one digest and at most one PR.

| Sub-agent         | Job                                                                                                                                                                                                        | Reads                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Revenue**       | MRR, new/expansion/contraction/churn, plan mix, trial→paid, top-up share, failed payments, refunds. Output: MRR table + the one leak worth fixing.                                                          | Stripe, `scripts/metrics-report.mts`, Supabase `subscriptions` |
| **Cost ledger**   | Cost per finished video by step and provider, tokens/units vs dollars, failed-job waste (cost of jobs that refunded), overrun `warn` logs. Output: cost-per-video table and gross margin by plan.          | Supabase `render_jobs.api_cost_usd`, logs, `margin-report.mts` |
| **Infra spend**   | Hosting and SaaS bills: Vercel usage/charges, Supabase plan/egress/storage growth (videos are big: check Storage and egress), Stripe fees, email, Sentry. Output: monthly burn table + anything to downgrade. | Vercel connector (`list_billing_charges`), Supabase, Stripe    |
| **Model scout**   | Cheaper/better providers for each slot (see §5). Prices from provider pages, not snippets; quality check on a real sample before recommending. Output: ranked swap candidates with $/video saved.          | Web, provider docs, `src/config/models.ts`                     |
| **Pricing/growth**| Plan prices, credit grants, trial size, annual discount, top-up packs, upsell prompts, dunning, win-back emails, referral. Output: one experiment with the expected € impact.                              | Revenue + Cost reports, competitors' pricing pages             |
| **Implementer**   | Builds the single change chosen by the master (adapter, catalog row, instrumentation, script), with tests. Only after the others report.                                                                    | Repo                                                           |

Rules for splitting: run Revenue, Cost ledger, Infra spend and Model scout in parallel (independent); run Pricing/growth after Revenue + Cost; run Implementer last and only for one change. Skip a sub-agent when nothing changed since its last report (record "no change" in the digest instead).

## 3. Autonomy and guardrails

- **PR-gated**, like the CEO routines: branch `ceo-finance/*`, never merges, never pushes to `main`.
- **Read-only on money systems.** Stripe, Supabase, Vercel, provider dashboards: read only. Any write (price change, migration, live-mode switch, plan downgrade, cancelling a subscription, buying anything) needs the owner's explicit OK in the PR or digest.
- **Never touches** live secrets, Stripe live mode, or UI files owned by Design (`DesignPlan.md` §5) while a `ceo-design/*` PR is open.
- **Check open and recently closed PRs first** (`list_pull_requests`); an item with an open PR is in review, not available.
- **Margin gate stays fail-closed** (`features/billing/margin.ts`, ≥3x). A cheaper model may raise it; nothing may lower it without the owner.
- **Don't swap a model on price alone.** A swap needs: a measured cost on real calls, a quality sample the owner can look at, and an adapter behind the existing provider layer (one catalog row + one adapter).
- **Data hygiene:** no customer emails, card data or secrets in PRs, logs, plan files or digests; aggregate only.
- **Bar for code PRs:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` in mock mode.

## 4. Shared facts the master gathers once per run

1. `TheMasterPlan.md` §7 (pricing, margin), §9 (ops), this file §6–§8, `git log -20`, open + recent PRs.
2. Stripe: active subscriptions by plan, MRR, 30-day new/cancelled/failed, refunds, fee total.
3. Supabase (read-only SQL): finished/failed jobs last 30 days, `sum(api_cost_usd)` by tier and length, credits granted vs burned, storage size and growth.
4. Vercel: current period charges and usage. Anthropic / fal.ai / ElevenLabs: invoices or usage if reachable (see §7), otherwise the stored per-job costs.
5. `npx tsx scripts/margin-report.mts` and `scripts/metrics-report.mts` (need `.env.local`; in a cloud run use the connectors instead).

If a source is unreachable, say which, use the next best, and add it to §7. Do not guess figures.

## 5. Standing research list (Model scout)

fal.ai is the largest variable cost once Premium (AI video) is used (~$0.07/s Kling 2.5 Turbo Pro, billed in fixed 5s clips). Candidates to price on real calls, cheapest-first, for each slot:

- **Image-to-video:** Wan 2.x / Wan 2.5, LTX-2 Fast, Seedance, Hailuo, Kling 3.x, Veo 3.1 Fast; via fal.ai, Replicate, Together, DeepInfra, or **self-hosted open weights on serverless GPU** (Modal, RunPod, Fireworks) once volume justifies it. Compare per-second price, minimum billed clip length, queue time, and failure rate.
- **Hero-shot only:** AI clip on the hook scene, Ken Burns for the rest (~$0.45 per 15s vs ~$1.10). Cheapest way to keep a "premium" feel.
- **Clip caching/reuse:** reuse a generated clip across a series or re-render with new captions/voice without regenerating.
- **Images:** FLUX schnell is already ~$0.003. Check Flux 2 / Qwen-Image / Z-Image class models and fal batch pricing.
- **Voice:** ElevenLabs Flash vs Cartesia, Deepgram Aura, OpenAI TTS, Kokoro (self-hosted, near-free). Voice Studio custom-voice slots are a fixed cost.
- **Script:** Sonnet 5.5 at $2/$10 per MTok is ~$0.04 per script; test Haiku 5.5 for scripts and use **prompt caching** on the system prompt. Batch API for non-interactive work.
- **Platform costs:** Vercel Fluid compute and function duration for in-house ffmpeg, Supabase Storage egress (signed-URL downloads), and a retention rule for old MP4s.
- **Payments:** Stripe fees by method; annual plans (cash up front, lower churn); Stripe Tax vs Merchant of Record trade-off for EU VAT.

## 6. Baseline (2026-10-17, from the repo; to be replaced with measured numbers)

- Plans €14.99 / €29.99 / €79.99; top-ups €12 / €29 / €59. Trial 3,000 credits (burn ≈ $0.14–0.25).
- Standard video (animated stills): ≈ $0.07 for 15s API cost; Premium ≈ $0.12 per scene-second in the catalog (conservative; Kling list ≈ $0.07/s).
- Margin gate passes (Starter 9.4x, Pro 3.00x, Ultra 3.23x) but **Pro sits exactly on the limit** and every cost is a list price, not a measurement.
- Stripe is in **test mode**; no real MRR exists yet. The first live euro changes every figure above.

## 7. Gaps found on day 1 (the routine should close these first)

| #   | Gap                                                                                                                                                                                                              | Why it matters                                                                       | Fix                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `render_jobs` stores one total `api_cost_usd`. No per-step or per-provider cost, and **no token counts** (Anthropic returns `usage`, but only the computed dollars are kept).                                      | Can't answer "tokens vs spend" or find which step/provider to replace.               | New table `render_job_costs` (job_id, step, provider_id, units, unit_kind, input_tokens, output_tokens, cost_usd). Additive migration (owner applies); orchestrator writes a row per step. |
| G2  | No cost view for failed/refunded jobs.                                                                                                                                                                           | Refunded jobs still cost us provider money; that waste is invisible.                 | Report `sum(cost)` of `failed` jobs next to revenue in the finance report.                                                                                                              |
| G3  | No finance report script. `metrics-report.mts` covers growth, `margin-report.mts` covers list-price margin.                                                                                                       | No single weekly view of MRR, cost per video and burn.                               | `scripts/finance-report.mts` (read-only), pure math in `features/finance/` with tests.                                                                                                  |
| G4  | Provider costs are list prices, not measured.                                                                                                                                                                    | Pro's 3.0x gate may fail on real numbers.                                            | Run `live-providers-smoke.mts --premium` with the owner's keys; record measured costs in §8.                                                                                            |
| G5  | Stripe connector needs authorization; Supabase connector failed to connect from the cloud session on 2026-10-17.                                                                                                 | Without them the routine has no revenue or cost data.                                | See §9.                                                                                                                                                                                 |
| G6  | Generated MP4s accumulate in Supabase Storage with no retention rule.                                                                                                                                            | Storage and egress grow linearly with videos and will outgrow the free/Pro quota.    | Retention policy (e.g. delete renders after N days unless posted/saved) + lifecycle cron. Needs owner decision.                                                                         |

## 8. Ledger of measurements and decisions

_Empty. The routine appends: date, source, figure, and any swap decision (with the quality sample link)._

## 9. Access the routine needs (owner action)

**Connectors (claude.ai → Settings → Connectors):**

- **Stripe** — authorize it (currently "requires authentication"). Prefer a **restricted read-only key / read-only scope**. Gives MRR, churn, fees, failed payments, and Sigma queries.
- **Supabase** — reconnect (failed with `ERR_PROXY_TUNNEL` on 2026-10-17). Read-only SQL for cost and usage; `get_advisors` and storage size.
- **Vercel** — already attached; used for `list_billing_charges` and usage.
- **GitHub** — attached (PRs, CI).
- Worth adding: **PostHog** (visitor→signup→paid funnel; no connector yet), **Sentry** (error rate that causes refunds), **Resend** (email volume/cost, dunning performance), a **Google Sheets/Drive** connector if the owner keeps expenses (domain, tools, ads) in a sheet or wants a monthly P&L sheet, and **Slack/email** for the digest.

**Cost data with no connector (put read-only/admin keys in the routine's environment as secrets, never in the repo):**

- `FAL_ADMIN_KEY` — fal.ai usage/billing API.
- `ANTHROPIC_ADMIN_KEY` — Anthropic Admin API (usage + cost reports per workspace).
- ElevenLabs: key with usage-read (`/v1/usage`, subscription endpoint).
- Until then the owner pastes the monthly invoice totals into §8, or enables G1 so costs come from our own ledger.

**Claude tools/add-ons that would help:** the `xlsx` skill for a monthly P&L workbook, the `dataviz` skill + Artifact dashboard (MRR, cost per video, burn) pinned in the sidebar, `deep-research` for the Model scout's market sweeps, and WebFetch/WebSearch (provider pages were blocked from the CEO routine's network on 2026-10-04: if it recurs, the owner should allow `fal.ai`, `replicate.com`, `elevenlabs.io`, `anthropic.com`, `vercel.com`, `supabase.com`, `stripe.com` in the routine's environment network policy).

**Owner decisions that unblock the most cash:** (1) turn on Stripe live mode when legal pages are verified; (2) approve migration for G1; (3) say whether to test annual plans and a smaller trial.

## 10. Rules for the Finance CEO routine

- **One change per run**, the one with the highest expected € per week, or the missing measurement that blocks it (G1 first).
- **Output:** a digest with MRR (and delta), cost per finished video, gross margin by plan, biggest cost line, what the sub-agents found, the PR link, and the decision waiting on the owner. Send a push notification **only** when something needs the owner (margin gate at risk, MRR drop > 10% week on week, a spend spike, a failed payment cluster, a source that stopped working, or a ready PR/decision). Quiet runs stay quiet.
- Update §6–§8 and add a changelog line in `TheMasterPlan.md` §10 on every PR.

## 11. Changelog

- **2026-10-17** — Finance track created: this charter, the routine prompt (`docs/finance/ROUTINE_PROMPT.md`), gaps G1–G6. No code yet. (interactive request, scheduled session)
