# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> Product and priority calls stay in `TheMasterPlan.md`; this file holds the
> numbers, the cost-cutting backlog, and the routine's charter.
>
> Last updated: 2026-10-15

## 1. Charter

Goal: **maximise cash return**. Every run checks MRR and unit economics, then
proposes (or, inside the rules below, implements) the change with the best
profit per hour of review.

Metrics, in order of priority:

1. **MRR** and net new MRR (new + expansion − churn − contraction).
2. **Gross margin per video** = credits revenue ÷ `render_jobs.api_cost_usd`.
3. **Cash burn** = fixed costs (Vercel, Supabase, ElevenLabs plan, Sentry, Resend, domain) + variable API spend − net revenue.
4. Conversion: trial → paid, paid churn, top-up attach rate.
5. Margin-gate multiple per plan (`scripts/margin-report.mts`, floor 3x).

## 2. Operating model (same shape as the CEO routines)

One **master agent** ("Finance DM") owns the run. It reads this file and
`TheMasterPlan.md`, lists open and recently closed PRs (skip anything already in
review), fans out to specialists **in parallel**, merges their reports, picks the
single highest-leverage change and ships it as a PR.

| Specialist                  | Reads                                                                      | Produces                                                                                   |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Revenue analyst**         | Stripe (subs, invoices, refunds, disputes), `subscriptions`, ledger grants | MRR, ARPU, churn, refunds, top-up share, trial → paid                                      |
| **Cost analyst**            | Supabase `render_jobs.api_cost_usd`, `scenes`, `assets`; Vercel billing; provider invoices pasted in §6 | cost per video by tier and step, tokens in/out per script, cost vs credits charged, fixed-cost list |
| **Provider scout**          | Web (price pages, changelogs, benchmarks), `models.ts`, `fal-video.ts`     | ranked cheaper or better alternatives per slot (video, image, voice, script), with prices and sources, plus the swap diff size |
| **Pricing and packaging**   | `plans.ts`, margin report, competitor pages                                | plan and top-up changes, annual plan, credit rollover, free-trial size, with margin math   |
| **Platform cost optimiser** | Vercel/Supabase usage, bundle and cron config                              | plan downgrades, caching, cron frequency, storage retention (delete old MP4s)              |
| **Verifier**                | the diff                                                                   | runs `format:check`, `lint`, `typecheck`, `test`; re-runs the margin gate on the new numbers |

The master agent never lets two specialists edit the same file. Only the master
writes code, and only for the one chosen item.

## 3. Rules

- PR-gated: branch `ceo-finance/<slug>`, never merge, never touch live secrets, never switch Stripe to live mode.
- Any change to **customer-facing prices, plan limits or credit grants** is a proposal in the PR body and the digest. The owner approves it before it merges. Cost-side swaps behind the provider layer may be implemented directly.
- Never lower the margin gate floor (3x). A swap must keep `margin.ts` passing on the new `costUsdPerUnit`.
- Prices from search snippets are leads, not facts (resellers quote 2–3x over vendor rates, and snippets disagree). Mark every figure **listed** or **measured**. Promote to measured only from `api_cost_usd` or an invoice.
- Read-only on Supabase and Stripe. Writes need the owner's OK.
- UI files belong to the Design routine while a `ceo-design/*` PR is open.
- Each run ends with: update §5 (numbers) and §7 (log) here, one line in `TheMasterPlan.md` §10, and a push notification **only** if something needs the owner (MRR drop, margin gate breach, cost spike, a swap that saves real money, a blocked data source).

## 4. Data access (checked 2026-10-15)

| Source                   | Status                      | Notes                                                                                                |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Supabase `iqvrovjwoavvmhaithwn` | **Works** (claude.ai connector, `execute_sql`) | Used for the baseline below. The repo's `.mcp.json` server failed to connect from this cloud session (proxy tunnel error); the connector worked. |
| Stripe                   | **Works, sandbox only** (`acct_1UKkSC0LHtTQ4zpU`, test mode) | Sigma analytics need a Sigma subscription. Use `stripe_api_read` (subscriptions, invoices) instead. No live account is connected, so real MRR is not visible yet. |
| Vercel                   | **Partial**                 | Connector works. `list_billing_charges` returned 404 `costs_not_found` (Hobby plan or no charges). Hobby is free, so cost is likely $0 until Pro. |
| fal.ai, ElevenLabs, Anthropic usage | **Not connected** | See §6. Costs come from `api_cost_usd`, which uses list prices, not invoices.                     |
| GitHub                   | Works                       | Branches, PRs, CI.                                                                                   |

## 5. Baseline (2026-10-15, first run)

From production Supabase (sandbox-era data, so test traffic):

- 6 profiles, 2 subscription rows, 5 paid-style credit grants (test cards).
- 17 render jobs: 14 done, 3 failed (**17.6% failure**, each refunded; failures still cost provider calls).
- Sum of `api_cost_usd`: **$8.13**, so **$0.48 per job** on average. That mixes Premium smoke tests with Standard, so it says nothing about the steady state yet.
- **Real MRR: €0.** Stripe is in test mode and the app has no paying customers. Every revenue figure below is a model, not a measurement.

Unit economics by plan (from `TheMasterPlan.md` §7 and `margin.ts`, worst-case full burn): Starter 9.4x, Pro 3.00x, Ultra 3.23x, top-ups 4.0–5.9x. **Pro sits exactly on the floor**, so any measured cost rise breaks the gate and blocks live mode.

Fixed costs known from the docs: Vercel Hobby (free), Supabase (free tier assumed), ElevenLabs plan (custom-voice slots, price not recorded), Sentry, Resend. **Needs the owner:** the actual monthly invoice for each (§6).

## 6. What the routine needs from the owner

1. **Provider invoices or usage exports** once live: fal.ai (usage page CSV), ElevenLabs (plan tier and characters used), Anthropic Console usage (tokens in/out per day), Supabase and Vercel plan tier. Paste the monthly totals into a table here, or give read-only keys (see connectors).
2. **Stripe live account** (or a restricted read-only live key in the routine's environment) so MRR is real. Sigma is optional (paid); the API is enough.
3. **Which fixed costs exist** (domain, Google Workspace, Sentry plan, Resend plan, ElevenLabs tier).
4. Whether prices may be A/B tested, or whether the owner approves every price change.

### Suggested connectors and tools

| Tool                                                | Why                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Stripe live, read-only restricted key**           | Real MRR, churn, refunds, disputes. Create it with read scopes only.                          |
| **Anthropic Console usage and cost API** (admin key, read-only) | Exact script tokens and spend per day, instead of the $0.04 estimate.             |
| **fal.ai usage API / dashboard export**             | Measured video and image spend. Biggest cost line once Premium is live.                      |
| **ElevenLabs `/v1/user/subscription` (read key)**   | Characters used vs plan, and slot headroom.                                                  |
| **Vercel billing** (already connected)              | Gives 404 on Hobby. Works after the move to Pro.                                             |
| **PostHog or Plausible** connector                  | Visitor → signup → paid funnel, needed for any pricing experiment.                           |
| **Sentry** connector                                | Render failure cost (failed jobs still burn provider calls).                                 |
| Google Sheets connector                             | Optional: a monthly cash table the owner can edit by hand.                                   |

## 7. Findings and backlog (ranked by cash impact)

Prices below are **listed** (search snippets, June–Aug 2026) unless marked measured. Verify before acting.

1. **Measure before swapping.** Code assumes Kling 2.5 Turbo Pro at $0.07 per billed second and the catalog charges `0.12` per scene-second as a conservative bound. A 2026 roundup lists **Kling 3.0 on fal at about $0.029/s** and Seedance 1.5 Pro at about $0.052/s (720p). If the Kling 3.0 figure holds, switching `FAL_VIDEO_MODEL` is an env change plus one input builder, with roughly 2x lower video cost. This also fixes the "Pro is at exactly 3.0x" risk. **Next step:** run `scripts/live-providers-smoke.mts --premium` with each candidate and record `api_cost_usd` per clip.
2. **fal.ai is not obviously the expensive part, the resolution of the clip is.** Sources agree vendor-direct rates run 2–3x below resellers. Candidates to price on a real clip: Wan 3.0 (about $0.08/s at 720p, listed), LTX-2.3 Fast ($0.06–0.24/s), Runware Seedance 2.0 ($0.07/s at 480p, $0.16/s at 720p), Runware Hailuo 2.3 ($0.28 per 6s clip). For a 9:16 phone video 480p–540p is often enough, so test the lower resolutions first.
3. **Keep Standard as animated stills** (cost ≈ $0.07 per 15s, 9x margin). It is the profit engine. The cheapest growth lever is steering new users to it, and a **hero-shot Premium** (AI clip on scene 1 only, about $0.45 per 15s) as a mid tier priced between Standard and full Premium.
4. **Failure rate is 17.6% on 17 jobs.** Even with refunds, each failure burns provider calls. Count failed-job `api_cost_usd` and add a pre-flight check or a cheaper retry. A one-line query in the Cost analyst's brief covers it.
5. **Annual plans** (2 months free): improves cash today and lowers churn. Stripe has `stripePriceIdYearly` fields already in `plans.ts`. Proposal only, owner approves price.
6. **Stripe vs a merchant of record.** Listed: Stripe about 1.5% + €0.25 on EEA cards (assumed in `margin.ts`), Paddle and Lemon Squeezy 5% + €0.50 with tax handled. Break-even is quoted around €12–18k MRR. Stay on Stripe until then, and turn on Stripe Tax before real EU sales.
7. **Storage retention.** Finished MP4s live in Supabase Storage. A 30-day expiry for unposted videos caps storage cost as users grow. Implementation: scheduled delete, owner decides the policy.
8. **Prompt caching and a smaller script model.** The script step is $0.04 per generation on Sonnet 5.5 against 100 credits charged. A Haiku-class model with a cached system prompt is likely a 3–5x cut on a small line. Low cash impact, so rank below 1–4.

## 8. Log (newest first)

- **2026-10-15** — Routine designed (this file). First baseline from production Supabase; Stripe sandbox and Vercel checked. No code changed. Real MRR is €0 until Stripe goes live. (Finance CEO, interactive setup)

## 9. Routine prompt (paste into claude.ai/code/routines)

```
You are the Finance CEO and master agent for Shortcraft (repo TudorFnsn/Shortcraft). Goal: maximise cash return.

1. Read FinancePlan.md, TheMasterPlan.md §7, AGENTS.md. Obey FinancePlan.md §3 rules. List open and recently closed PRs first; skip work already in review.
2. Pull the numbers: Supabase (project iqvrovjwoavvmhaithwn, read-only SQL), Stripe (read-only), Vercel billing. Check MRR first.
3. In parallel, spawn the specialists in FinancePlan.md §2 (revenue analyst, cost analyst, provider scout, pricing, platform cost, verifier) with narrow briefs and the data they need. Give them no conclusions to confirm.
4. Merge their reports. Rank by cash impact per hour of review. Implement the single best item that is allowed without owner approval, on branch ceo-finance/<slug>, with tests; run format:check, lint, typecheck, test and the margin report. Open a PR. Price and plan changes are proposals only.
5. Update FinancePlan.md §5 and §8, add one line to TheMasterPlan.md §10.
6. Notify (PushNotification) only if the owner must act: MRR drop, margin gate breach, cost spike, a swap that saves real money, or a data source that is blocked. Otherwise stay silent.
```

Suggested schedule: daily 07:00 UTC (after the main CEO at 06:00 and before Design at 09:00), Opus-class model, PR-gated.
