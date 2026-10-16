# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on cost, pricing experiments and cash. Every finance PR updates this file
> (numbers + changelog) in the same change.
>
> Last updated: 2026-10-16 (created)

---

## 1. Charter

**Goal:** maximise cash return. Grow MRR, raise gross margin per video, cut every
avoidable payment, and never ship a change that makes a paid plan lose money.

**Every run starts by measuring**, in this order:

1. `npx tsx scripts/finance-report.mts --json` — MRR (gross + net), paying subscribers, ARPU, top-ups, API cost per video by tier, gross margin, monthly P&L. Needs `.env.local` (Supabase service role). If unreachable, use the Supabase and Stripe connectors for the same read-only queries.
2. `npx tsx scripts/metrics-report.mts --json` — the north star (weekly paying-retained creators), activation, trial → paid, failure rate.
3. `npx tsx scripts/margin-report.mts` — the 3x gate on the current catalog.
4. Real invoices (see §4): fal.ai, ElevenLabs, Anthropic, Vercel, Supabase, Resend, Sentry.

**Known blind spot (fix first, §5 F1):** `render_jobs.api_cost_usd` is the _catalog_
price (`models.ts costUsdPerUnit`) added per step. It is not what providers
invoiced, and nothing stores LLM tokens, so "tokens used vs money spent" cannot be
answered from the database yet. Until F1 ships, every report must say the margin is
modelled, not measured.

## 2. Levers, in priority order

1. **Measure real unit cost** (F1). Everything else is guesswork without it.
2. **Premium video cost** (the only expensive step; Standard is ~$0.07/15s). Candidates to benchmark _on our own prompts, with retries counted_ (list prices from vendor pages and an aggregator blog, unverified):
   - fal.ai Kling 2.5 Turbo Pro (today) ~$0.07/s billed in fixed 5s clips; fal Wan 2.2 A14B $0.04–0.08/s by resolution; fal Kling O3 Std $0.084/s.
   - Aggregators selling the same models: Atlas Cloud lists Wan 2.2 Turbo ~$0.02/s and Wan 2.6 Flash ~$0.018/s; Seedance Fast ~$0.076/s. Also check Replicate and WaveSpeed (not yet priced).
   - Self-hosting Wan 2.2 (14B needs 65–80 GB VRAM) only pays at sustained high utilisation; not before real volume.
   - Design levers that beat any vendor swap: **hero-shot** (AI clip on scene 1 only, ~$0.45/15s), shorter clips, cache and reuse clips per theme, one retry cap, lower resolution for 9:16 phone output.
3. **Price and packaging.** Annual plans (Stripe prices exist as `stripePriceIdYearly`, unused) for cash up front; a paid trial or lower free grant if trial burn is high; top-up price ladder; Standard is ~9x margin so there is room to cut its credit price or add a cheaper plan if conversion is the bottleneck. Only change prices with data (conversion, churn) and the owner's OK.
4. **Churn and expansion.** Unused-credit reminders, upgrade nudges at plan limits, dunning (Stripe Smart Retries), cancellation reason capture, pause instead of cancel.
5. **Fixed costs.** Vercel and Supabase tiers vs actual use, ElevenLabs plan vs voice slots in use, Sentry/Resend free tiers, storage retention and egress (delete rendered files after N days if cheaper than keeping them).
6. **LLM tokens.** Script step is ~$0.04/video on Sonnet 5.5. Candidates: prompt caching, a Haiku-class model for scripts if quality holds, shorter outputs. Needs token counts stored first (F1).

## 3. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7, §8, §9), this file, `git log -20`, open and recently closed PRs (an item with an open PR is in review, not available), then run the §1 measurements.
- **One item per run**, the highest cash impact not already in an open PR. Branches `ceo-finance/<slug>`. Never merge, never push to `main`.
- **Owner approval gate:** any change to plan prices, credit prices, trial size, a provider swap in production, or anything in live Stripe/Supabase needs Tudor's explicit OK (comment on the PR or an edit to this file). Experiments behind a flag, benchmarks and read-only analysis do not.
- **Margin gate is a hard floor:** `npm run` checks plus `scripts/margin-report.mts` must pass (≥3x) with the new numbers. Never lower the bar to make a change fit.
- **Files it may change:** `src/features/finance/**`, `src/config/costs.ts`, `src/config/models.ts` (costs and provider ids), `src/features/providers/**` (new adapters, behind the registry), `scripts/**`, `tests/**`, this file and the finance lines of `TheMasterPlan.md`. Leave UI files while a `ceo-design/*` PR is open. Migrations may be _written_ (additive only) but are applied by the owner.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode. Live provider benchmarks run only with keys the owner provides, capped at a stated spend.
- **Output:** a digest: MRR and net MRR (with change vs last run), cost per video by tier, margin, runway signal, what moved (PR links), what waits on Tudor, next item. Notify only when something needs a decision or money is leaking (margin gate fails, cost per video up >20%, MRR down, failed payments, a provider bill far above the model).
- **Record each run's numbers** in the §6 table so trends exist without a metrics vendor.

## 4. Access the routine needs (owner action)

| Need                                                      | Why                                       | Status (2026-10-16)                                                                                                                                     |
| --------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft` (read/write branch)    | work and PRs                              | Granted in this session                                                                                                                                 |
| **Stripe connector, authorised**                          | real MRR, churn, failed payments, fees    | **Needs OAuth in claude.ai connector settings**; test mode only so far                                                                                  |
| **Supabase connector** (project `iqvrovjwoavvmhaithwn`)   | read-only P&L queries                     | Failed to connect from the cloud session (`ERR_PROXY_TUNNEL`); retry                                                                                    |
| Vercel connector                                          | billing charges, usage, function duration | Connected; `list_billing_charges` available                                                                                                             |
| Read-only provider billing: fal.ai, ElevenLabs, Anthropic | invoice vs modelled cost                  | **Not available.** Owner: paste monthly totals into §6, or create read-only/usage keys and add them as routine secrets                                  |
| `.env.local` equivalent in the routine environment        | run the report scripts                    | **Missing.** Add `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` as routine environment secrets (or rely on the connector)                      |
| Fixed-cost invoices                                       | complete the P&L                          | **Fill `src/config/costs.ts`** (all `null` today)                                                                                                       |
| Outbound network to vendor pricing pages                  | verify prices                             | Earlier routines saw blocked pages; allow `fal.ai`, `replicate.com`, `wavespeed.ai`, `elevenlabs.io`, `anthropic.com` in the environment network policy |

**Suggested additions:** Stripe (authorise, then also enable Sigma/Revenue reports),
a PostHog or Plausible connector (visitor → signup → paid funnel and CAC), Sentry
connector (failures that burn spend), and a spreadsheet or Docs connector so the
monthly P&L lands somewhere you read. Useful skills: `anthropic-skills:xlsx` for a
P&L workbook, `dataviz` for the digest chart, `claude-api` for token/caching work.

## 5. Roadmap

- [ ] **F1 — Measure real cost.** Additive migration `step_costs` (job_id, step, provider, units, usd, input_tokens, output_tokens, created_at); orchestrator writes a row per provider call using the provider's returned usage (Anthropic `usage`, fal request cost header/billing API, ElevenLabs characters). Finance report then shows modelled vs measured and tokens per video.
- [ ] **F2 — Provider bake-off for Premium video.** Script that runs the same 10 prompts through each candidate (fal Kling, fal Wan, an aggregator), records price per usable clip including retries and a quick quality review; capped spend, owner-supplied keys. Output: table in §6, then a PR adding the winner as an adapter behind `FAL_VIDEO_MODEL`-style config.
- [ ] **F3 — Annual plans** behind the existing yearly price slots (owner approves discount, e.g. 2 months free).
- [ ] **F4 — Dunning and churn:** confirm Stripe Smart Retries and failed-payment emails; capture cancel reason in the billing portal flow.
- [ ] **F5 — Hero-shot Premium** tier priced close to Standard (see TheMasterPlan §7).
- [ ] **F6 — LLM spend:** prompt caching and a cheaper model trial for scripts once F1 gives token counts.
- [ ] **F7 — Fixed-cost review** once `costs.ts` is filled.

## 6. Numbers log (append newest on top)

| Date       | MRR gross € | MRR net $ | Subs | Videos 30d | API $/video (modelled) | API $/video (invoiced) | Fixed $/mo | Net profit $/mo | Source                                                                               |
| ---------- | ----------- | --------- | ---- | ---------- | ---------------------- | ---------------------- | ---------- | --------------- | ------------------------------------------------------------------------------------ |
| 2026-10-16 | n/a         | n/a       | n/a  | n/a        | n/a                    | n/a                    | n/a        | n/a             | Routine had no DB, Stripe or invoice access; scripts built, not yet run on live data |

## 7. Changelog (newest on top)

- **2026-10-16** — Finance track created: this plan, `features/finance/pnl.ts` (MRR, net MRR, ARPU, cost per video by tier, gross margin, monthly P&L; +5 tests), `scripts/finance-report.mts` (read-only), `config/costs.ts` (fixed costs, owner to fill). Found: API cost is catalog-metered, tokens are not stored. (Finance CEO, interactive setup)
