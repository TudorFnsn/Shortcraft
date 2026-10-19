# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority,
> this file wins on how we spend, price and cut cost. Every finance PR updates
> this file (metrics snapshot, backlog, changelog) in the same change.
>
> Last updated: 2026-10-19 (track created)

---

## 1. Charter (owner request 2026-10-19, change only with Tudor)

| Question | Owner's answer                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal     | **Maximum profit, cash return first.** Raise MRR, raise gross margin, cut every cost that does not buy revenue.                                                                                            |
| Always   | Check the **MRR** and the cost-to-revenue ratio first, every run.                                                                                                                                          |
| Hunt     | Cheaper and better providers (video is **fal.ai**, which looks expensive), new techniques and tools, and monetisation ideas (pricing, packaging, upsells, annual plans, retention).                        |
| Measure  | Tokens and provider units used per video **vs** what they cost **vs** hosting and every other payment (Vercel, Supabase, Stripe fees, ElevenLabs, Anthropic, Resend, Sentry, domains). Prioritise by cash. |
| Autonomy | **PR-gated**, same as the other routines. Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe or production data.                                                            |
| Cadence  | Daily cloud routine **"Shortcraft Finance CEO"**, 07:00 UTC (after the main CEO at 06:00, so it reads that run's PRs). Master agent splits work across sub-agents (§4).                                    |
| Asks     | When it lacks data or access, it **asks Tudor** in its digest (§6) instead of guessing.                                                                                                                    |

---

## 2. Money model today (from `TheMasterPlan.md` §7, re-verify each run)

- Plans (EUR/mo, VAT incl.): Starter 14.99 / 30k credits · Pro 29.99 / 100k · Ultra 79.99 / 250k. Top-ups 20k 12 · 60k 29 · 150k 59.
- Net revenue = price ÷ 1.2 VAT, minus Stripe 1.5% + €0.25, × 1.08 USD/EUR (`REVENUE_ASSUMPTIONS` in `src/features/billing/margin.ts`).
- Gate: revenue ≥ 3× worst-case API cost per product (`npx tsx scripts/margin-report.mts`). Pro sits at exactly 3.0x, so any measured cost rise fails it.
- Cost levers in code: `src/config/models.ts` (`costUsdPerUnit`, `creditsPerUnit`), `src/features/providers/live/*` (fal image/video, Anthropic script, ElevenLabs voice), `src/features/render/pricing.ts`.
- Premium (AI video) is the expensive tier: fal.ai Kling 2.5 turbo, ~$0.07/s list price, unmeasured.

### Known measurement gaps (close these first)

1. **Tokens are not stored.** `anthropic-script.ts` computes `costUsd` from `usage` but only the dollar total reaches `render_jobs.api_cost_usd`. There is no per-step or per-provider split and no token or unit counts, so "tokens vs cost" cannot be answered from the DB. **Proposal:** migration `0013_job_cost_events` (job_id, step, provider, model, units, unit_kind, input_tokens, output_tokens, cost_usd, created_at), written by the orchestrator where it already meters cost. RLS on, no grants to `anon`/`authenticated`. Needs Tudor's OK to apply.
2. **Fixed costs are not in the repo.** Hosting, Supabase, ElevenLabs plan, Resend, Sentry, domain and any other subscriptions are unknown. Tudor to fill §5 (or connect the billing sources in §7).
3. **Real provider prices are unmeasured** (snippets disagreed by up to 2x). Run `scripts/live-providers-smoke.mts` with `FAL_KEY` and record real per-call cost.
4. **Subscription history is not stored**, so churn and net revenue retention are proxies. Stripe (Sigma or the API) is the real source once connected.

---

## 3. Metrics snapshot (the routine overwrites this table each run)

Source: `npx tsx scripts/finance-report.mts` (needs `.env.local` with the Supabase service role) or, in the cloud, the Supabase connector read-only. Fallback: derive from the master plan and say so.

| Metric (30d, net USD)       | Value                    | Δ vs last run |
| --------------------------- | ------------------------ | ------------- |
| MRR (net)                   | _not yet measured_       |               |
| Paying subscribers          | _not yet measured_       |               |
| Top-up revenue              | _not yet measured_       |               |
| API cost                    | _not yet measured_       |               |
| Gross margin / cost-revenue | _not yet measured_       |               |
| Cost per finished video     | _not yet measured_       |               |
| Fixed monthly costs (§5)    | _unknown, owner to fill_ |               |
| Net cash after fixed costs  | _unknown_                |               |

---

## 4. How the routine runs (master agent + sub-agents)

The routine's main session is the **master agent ("DM")**. It never does the deep work itself. Each run:

1. **Orient (master, serial):** read `TheMasterPlan.md`, this file, `git log -20`, list open and recently closed PRs (an item with an open PR is in review, skip it). Run the finance report; refresh §3. Note MRR, cost/revenue, and what moved.
2. **Split (master):** pick the 2–4 highest-cash items from §8 and spawn sub-agents **in parallel in one message**, each with a narrow brief, the files to read and what is ruled out. Sub-agents:
   - **Cost-unit analyst:** reads `models.ts`, the live adapters, `pricing.ts`, `margin.ts`; computes tokens/units vs cost per video and per tier; finds where we overspend (retries, failed-job spend, over-long prompts, oversized images, premium defaults). Output: a table and ranked savings.
   - **Provider scout:** web research for cheaper or better video, image, TTS and LLM options (§9 leads). Must give price per unit **with a source and date**, quality notes, API fit with our adapter contract, licensing for commercial use, rate limits. Never trusts one snippet; flags disagreement.
   - **Pricing & MRR strategist:** reads plans, top-ups, entitlements, the funnel metrics; proposes packaging, annual plans, price tests, upsells, trial changes, churn saves. Every proposal comes with the expected MRR effect and the margin-gate result.
   - **Fixed-cost auditor:** hosting, database, email, monitoring, domains, Stripe fees. Uses connectors (Vercel usage/billing, Supabase advisors and logs, Stripe) where available.
   - **Implementer:** only for a single approved or clearly safe item (§5 rules). Writes code + tests in a worktree.
3. **Verify (master):** challenge each sub-agent's numbers. Re-run `scripts/margin-report.mts` for anything touching prices or costs. A saving is only real if the margin gate still passes.
4. **Ship (master):** at most one PR per run on `ceo-finance/<slug>`; update this file and the Finance lines of `TheMasterPlan.md` in it.
5. **Report:** the digest (§6). Send a push notification only when something needs Tudor (§6); otherwise stay quiet.

## 5. Rules

- **Files it may change:** `FinancePlan.md`, `scripts/finance-report.mts`, `src/features/finance/**`, `tests/finance/**`, `src/config/models.ts` and `src/config/plans.ts` **only with the margin gate passing in the same PR**, provider adapters under `src/features/providers/**` for a swap proposed with measured data, and the Finance lines of `TheMasterPlan.md`. UI changes (pricing page copy, new upsell surfaces) go through the Design CEO's files rules: propose in the digest, do not edit `src/app/**` views while a `ceo-design/*` PR is open.
- **Never:** merge; apply migrations; write to Stripe, Supabase data or Vercel config; set live-mode or production secrets; change what existing subscribers pay without Tudor's explicit OK; switch a provider in production without a measured side-by-side (same prompt set, cost + quality) and Tudor's OK. Price changes for new customers and any migration are **proposals** in the PR description.
- **Read-only connectors are fine** (Supabase `execute_sql` selects/advisors/logs, Stripe reads, Vercel usage/billing reads, GitHub). Any write needs the owner's explicit OK.
- **Quality floor:** a cheaper model must not visibly degrade the output. Keep Standard (animated stills) as the margin engine; Premium must stay ≥ 3× gate.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Sources:** every price or claim in a PR cites a URL and a date. Prices from search snippets are labelled "unverified".

## 6. Digest format and when to notify

Digest: MRR and cost/revenue (with Δ), what the sub-agents found, the PR link, **what is blocked on Tudor**, next item.

Push notification (inside `<routine_summary>` tags, first sentence is the phone banner) **only** when one of these is true: MRR or gross margin dropped materially; the margin gate fails or is at risk; a provider is ≥ 25% cheaper with comparable quality (with the saving in €/month); a PR is ready that needs a decision; the routine could not run or lacks access. A healthy, unchanged run sends nothing.

**Questions for Tudor (the routine keeps asking until answered):**

1. Fixed monthly costs: Vercel plan, Supabase plan, ElevenLabs plan, Resend, Sentry, domain, anything else (amounts + billing dates).
2. Is the app live with real customers (Stripe live mode), or is revenue still sandbox? Real MRR numbers need live Stripe.
3. Which connectors can the cloud routine use (§7)?
4. Target: monthly profit goal or margin goal, and the minimum acceptable gross margin?
5. Is changing prices for new customers allowed without asking, within the 3× gate?

## 7. Access and tooling the routine needs (suggested)

Connected today per `TheMasterPlan.md` §9: Supabase (project `iqvrovjwoavvmhaithwn`), Stripe (sandbox), GitHub. A Vercel connector is now present in cloud sessions. Suggested additions, in order of cash value:

1. **Stripe live (read-only restricted key / connector)**: real MRR, churn, refunds, failed payments, fees. Without it MRR is estimated from the DB.
2. **Vercel connector (usage and billing reads)**: hosting spend, function duration, bandwidth. Cost of long renders and the 1-minute cron.
3. **Supabase connector (re-authenticate)**: it failed to connect in the first run (`ERR_PROXY_TUNNEL`); retry or authorise in claude.ai connector settings. Needed for the finance report in the cloud.
4. **fal.ai usage/billing**: the real per-call spend (dashboard export or a read-only key). Compare against `api_cost_usd`.
5. **Anthropic Console usage and cost report (admin read key)**, **ElevenLabs usage**: tokens and characters actually billed vs ours.
6. **Sentry / PostHog**: failure rate (wasted spend) and funnel for pricing tests.
7. Claude tools worth using: `WebSearch` (extended mode for pricing research), `WebFetch`, sub-agents in parallel, `Workflow` for large price-comparison sweeps if Tudor opts in.

## 8. Backlog (priority order; the routine edits this list)

`[ ]` todo · `[~]` in progress · `[x]` shipped

- [ ] **F1. Measure.** Ship `0013_job_cost_events` proposal + per-step cost capture; fill §3 from real data. (Blocks every other saving from being provable.)
- [ ] **F2. Video cost.** Replace or reduce fal.ai Premium video spend: hero-shot only, shorter clips, lower resolution, cheaper model (§9), batch/queue pricing. Side-by-side on a fixed prompt set.
- [ ] **F3. Image cost.** Check FLUX schnell/dev prices vs alternatives; cache and reuse images for re-voices; right-size resolution.
- [ ] **F4. Script cost.** Anthropic: prompt caching for the fixed system prompt, a smaller model for short videos, Batch API where latency allows, cap `max_tokens`. Check actual tokens/video once F1 lands.
- [ ] **F5. Voice cost.** ElevenLabs vs cheaper TTS for Standard; keep ElevenLabs for Voice Studio. Watch custom-voice slot costs.
- [ ] **F6. Wasted spend.** Failed and retried jobs: where do paid calls happen before a failure? (`failedJobCostUsd30d`.) Move cheap checks before expensive calls.
- [ ] **F7. Pricing & MRR.** Annual plans with a discount (cash up front), a mid tier between Pro and Ultra if the data supports it, top-up bundles that expire, trial burn vs conversion, dunning/failed-payment recovery, win-back emails (Resend is already wired).
- [ ] **F8. Payments cost.** Stripe fee mix, VAT handling (Merchant of Record vs Stripe Tax), refund and dispute rate.
- [ ] **F9. Fixed costs.** Right-size Vercel/Supabase plans, cron frequency, storage retention (delete old media), egress.
- [ ] **F10. Referral/affiliate economics.** Model the 30% recurring affiliate offer in `TheMasterPlan.md` §6 against margin before launching it.

## 9. Research leads (UNVERIFIED, starting points for the Provider scout)

Prices change monthly; the scout must re-check each against the provider's own page and record URL + date.

- **Video:** fal.ai alternatives for the same models (Kling, Seedance, Wan, Hailuo/MiniMax, LTX-2) via Replicate, WaveSpeed, Novita, Together, Runway/Luma/Pika direct APIs, and open-weight models (Wan, LTX) on a serverless GPU (Modal, RunPod, Replicate cold-start tradeoffs). Also lower-cost tricks: image-to-video at 480p then upscale, 3s clips + loop/slow-mo, animate only the hook scene, reuse clips across a series.
- **Image:** FLUX schnell/dev on other hosts, Recraft, Ideogram, Stable Diffusion 3.5/SDXL turbo variants, self-hosted on serverless GPU for volume.
- **Voice:** ElevenLabs Flash vs Cartesia, Deepgram Aura, OpenAI TTS, Azure/Google neural voices, open-source Kokoro/F5 on GPU for the Standard tier.
- **LLM:** prompt caching, Batch API, Haiku-class model for scripts, structured output to cut retries.
- **Money:** Stripe annual pricing and Link, Paddle/Lemon Squeezy as Merchant of Record (fees vs VAT-handling saving), usage-based add-ons, credit expiry/rollover policy.

## 10. Routine prompt (paste into the cloud routine)

> You are the master agent ("DM") of the Shortcraft Finance CEO routine. Read `FinancePlan.md` and `TheMasterPlan.md` in the repo first and follow `FinancePlan.md` §1, §4, §5 and §6 exactly. Goal: maximise profit and cash return for Shortcraft. Every run: (1) check MRR and the cost-to-revenue ratio (run `npx tsx scripts/finance-report.mts` if `.env.local` exists, else read-only SQL through the Supabase connector, else derive from the plan and say so); (2) list open and recently closed PRs; (3) split the top cash items across parallel sub-agents (cost-unit analyst, provider scout, pricing strategist, fixed-cost auditor, implementer) with narrow briefs; (4) verify their numbers and re-run `scripts/margin-report.mts` for anything touching cost or price; (5) open at most one PR on `ceo-finance/<slug>`, never merge, never apply migrations or touch live secrets, Stripe live data or existing subscribers' prices; (6) refresh the metrics table, backlog and changelog in `FinancePlan.md`; (7) when you lack data or access, ask Tudor in the digest and say which connector or fact unblocks you. Send a PushNotification inside `<routine_summary>` tags only per §6; otherwise stay silent.

---

## 11. Changelog (newest on top)

- **2026-10-19** — Finance track created: charter, master-agent/sub-agent plan, rules, backlog, research leads. Added `src/features/finance/finance.ts` (pure MRR, 30-day revenue vs API cost, cost per video and per tier; failed-job spend counted), `scripts/finance-report.mts` (read-only) and 4 tests. No migration, no dependency, no runtime change. (Finance CEO, setup)
