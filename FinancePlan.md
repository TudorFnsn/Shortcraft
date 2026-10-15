# FinancePlan — Shortcraft profit track

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on cost, pricing and vendor choices. Every finance PR updates it (ledger +
> changelog) in the same change.
>
> Last updated: 2026-10-15 (routine defined, `finance-report` script added)

---

## 1. Charter (owner request 2026-10-15)

Maximise **cash return**. Every run starts from the numbers, not from ideas.

1. **Check the MRR ratio first:** net revenue ÷ (variable + fixed cost), from `npx tsx scripts/finance-report.mts --fixed-usd <N>`. Below 1.0x we lose money; the target is ≥ 3x on variable cost alone (the margin gate in `features/billing/margin.ts`) and ≥ 1.5x all-in.
2. **Know where each dollar goes:** per-video API cost by tier (`render_jobs.api_cost_usd`), failed-job cost, trial burn (cost of users who never paid), fixed vendor bills.
3. **Cut cost before adding price:** cheaper or better vendors for the same output (fal.ai video is the biggest line), caching, shorter prompts, smaller models, batch APIs, annual plans.
4. **Raise revenue without hurting retention:** pricing, annual plans, top-up packs, upsell nudges, trial length, referral/affiliate economics, churn recovery (Stripe dunning).
5. **Rank every idea by cash return** = (monthly $ saved or earned) ÷ (effort + risk). Do the top one, list the rest.

## 2. Autonomy

PR-gated, same as the other routines. Branches `ceo-finance/<slug>`; never merge; never touch live secrets.
Read-only on Supabase, Stripe and Vercel. **Any write** (migration, price change in Stripe, live mode, new paid vendor, switching `FAL_VIDEO_MODEL` in production) needs Tudor's explicit OK; the PR describes it and waits.

Files it may change: `src/features/finance/**`, `scripts/finance-report.mts`, `tests/finance/**`, `src/config/models.ts` and `src/config/plans.ts` (**cost numbers and model ids only; a customer-facing price or credit change needs owner approval first**), `src/features/providers/live/**` (new/cheaper adapters behind the existing registry), this file and the finance lines of `TheMasterPlan.md`. It leaves UI files (`DesignPlan.md` §5) alone while a `ceo-design/*` PR is open.

Bar before any PR: `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build`, and `npx tsx scripts/margin-report.mts` still passes (gate fails closed).

## 3. How the master agent works (DM + sub-agents)

The routine's first agent is the **master** ("DM"). It reads this file, `TheMasterPlan.md` §7, `git log -20`, and open/recent PRs (an item with an open PR is in review, not available). Then it fans out **in one parallel batch** and merges the answers:

| Sub-agent              | Question it answers                                                                                       | Inputs / tools                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Revenue analyst**    | MRR, ARPU, churn, trial→paid, plan mix, top-up share, failed payments, dunning gaps.                      | Stripe connector (read), `finance-report.mts`, `metrics-report.mts`                      |
| **Cost analyst**       | Cost per video by tier, tokens/credits in vs $ out, failed-job cost, trial burn, cost drift vs catalog.   | Supabase connector (read `render_jobs`), provider usage dashboards                       |
| **Infra analyst**      | Hosting bill: Vercel function time/bandwidth/image optimisation, Supabase size/egress, storage retention. | Vercel connector (usage, billing charges), Supabase advisors/logs                        |
| **Vendor scout**       | Cheaper/better replacements per slot (video, image, voice, script, render) with measured quality.         | Web search, vendor pricing pages, a 5-prompt bake-off through `live-providers-smoke.mts` |
| **Pricing strategist** | Plan/top-up/annual price and credit-scale changes; simulates each through `assessMargins` first.          | `margin.ts`, Stripe prices, competitor pages                                             |
| **Implementer**        | Builds the one winning change with tests; opens the PR.                                                   | Repo, CI                                                                                 |

Rules: sub-agents get a self-contained brief and return numbers with sources; the master discards any figure without a source or a date, and marks vendor prices **list price, unmeasured** until a real call confirms them (TheMasterPlan §7 learned this the hard way).

## 4. Output (every run)

A digest: MRR ratio and its change since last run; top cost line; the ranked idea list with $/mo each; the PR link; what waits on Tudor. **Send a push notification only when:** MRR ratio < 1.5x, the margin gate fails, a vendor price moved > 20%, a cost line jumped > 30% week on week, or something needs an owner decision. No news = silence.

## 5. Cost ledger (owner fills in; the routine reads it)

`--fixed-usd` for the report is the sum of this table. Unknown rows are what the routine asks for first.

| Vendor                  | Plan / basis              | USD per month  | Source                     |
| ----------------------- | ------------------------- | -------------- | -------------------------- |
| Vercel                  | Hobby/Pro?                | ?              |                            |
| Supabase (`ShortCraft`) | Free/Pro?                 | ?              |                            |
| ElevenLabs              | plan + custom-voice slots | ?              |                            |
| fal.ai                  | usage (variable)          | per call       | `render_jobs.api_cost_usd` |
| Anthropic               | usage (variable)          | per call       | same                       |
| Resend                  | free/paid?                | ?              |                            |
| Sentry                  | free/paid?                | ?              |                            |
| Domain                  | per year ÷ 12             | ?              |                            |
| Stripe                  | % + fixed per charge      | in net revenue | `REVENUE_ASSUMPTIONS`      |

## 6. Idea backlog (unranked until the first measured run; verify every price)

**Cost**

- Video: benchmark fal.ai Kling 2.5 Turbo against cheaper image-to-video options (Wan, LTX, Seedance and Hailuo variants on fal, plus direct/other hosts such as Replicate, Runway, Luma, Together, WaveSpeed, Novita). Quality bake-off on the same 5 scene prompts, cost per _accepted_ clip.
- Hero-shot premium (AI clip on scene 1 only) is already modelled in §7 of the master plan: ~$0.45 vs ~$1.10 per 15s video.
- Voice: compare ElevenLabs Flash against cheaper TTS (OpenAI, Google, Cartesia, Deepgram, Kokoro self-hosted) per 1k characters; keep ElevenLabs only for designed voices.
- Script: Haiku-class model for the script step, prompt caching for the fixed system prompt, shorter output schema. Measure the token count per script.
- Images: FLUX schnell is already ~$0.003; check cache hits for repeated themes; reuse stills across Ken Burns variants.
- Infra: storage retention for free-tier renders, signed-URL egress, ISR for marketing pages, Vercel function memory/duration right-sizing.
- Failed jobs: find which provider step fails most and what it cost; retry the cheap step, not the whole job.

**Revenue**

- Annual plans (2 months free): cash up-front, lower churn. Needs Stripe prices (owner OK).
- Trial design: watermark + credit cap already limit burn; test trial length vs trial→paid.
- Out-of-credits upsell: top-up pack shown at the exact moment a job is blocked.
- Dunning and card-update emails, failed-payment recovery (Stripe Smart Retries).
- Affiliate economics: 30% recurring is the plan; check it keeps contribution margin ≥ 50%.
- Pay-per-video premium: sell AI clips à la carte rather than inside plans.

## 7. Connectors and tools that would help (ask Tudor to enable)

Already connected: Supabase (tables, SQL, logs, advisors), Stripe (read, Sigma analytics), Vercel (usage, billing charges, runtime logs), GitHub.

Needed or useful:

1. **Supabase connector actually reachable from cloud routines.** It failed with `ERR_PROXY_TUNNEL` in this run; without it the cost and MRR numbers can't be read. Alternative: a read-only Postgres role + `SUPABASE_DB_URL` as a routine secret.
2. **Stripe in live mode, read-only** (restricted key: Subscriptions, Invoices, Charges, Balance read). Today the connector is the test sandbox, so real MRR is invisible.
3. **Provider usage/billing access:** fal.ai (usage API key), Anthropic (Admin API / Usage & Cost API key), ElevenLabs (subscription/usage endpoint), Resend. Only needed as read-only secrets for the routine environment.
4. **Network allowlist** for the routine's environment: pricing pages of fal.ai, replicate.com, runwayml.com, lumalabs.ai, elevenlabs.io, openai.com, anthropic.com (§7 notes direct pages were blocked before).
5. **Optional:** a Sentry or PostHog connector (conversion funnel), Google Sheets/Drive connector for the cost ledger, Slack for the digest.

## 8. Info the routine needs from Tudor (answer in §5 or in a PR comment)

1. The monthly bills in §5 (Vercel, Supabase, ElevenLabs, Resend, Sentry, domain).
2. Is Stripe live yet? If yes: a restricted read-only key for the routine environment.
3. Target: break-even month, or a monthly profit goal in EUR?
4. May the routine switch `FAL_VIDEO_MODEL` in Preview for bake-offs? (Production switches always need your OK.)
5. Any vendor you do _not_ want (EU data residency, brand, licence for commercial use)?

## 9. Routine definition

Name: **Shortcraft Finance CEO** · model Opus 5.5 · daily 07:00 UTC (after the main CEO at 06:00) · repo `TudorFnsn/Shortcraft` · connectors: Supabase, Stripe, Vercel, GitHub.
Create it at https://claude.ai/code/routines with the prompt below (a session cannot create routines itself).

```
You are the master agent (DM) of the Shortcraft Finance CEO routine. Goal: maximise
cash return of the app. Read FinancePlan.md (charter, rules, ledger), TheMasterPlan.md §7,
git log -20, and open + recently closed PRs (skip items already in review).

1. Measure: run `npm ci && npx tsx scripts/finance-report.mts --fixed-usd <sum of FinancePlan §5>
   --json` (needs Supabase env or connector). If data is unreachable, notify the owner
   and continue with list-price analysis, clearly marked unmeasured.
2. Spawn in ONE parallel batch: revenue analyst, cost analyst, infra analyst, vendor scout,
   pricing strategist (briefs in FinancePlan §3; each returns sourced, dated numbers).
3. Rank every idea by monthly cash return / (effort + risk). Pick the top one that is
   not already in an open PR and does not need an owner decision; hand it to the
   implementer. Simulate any price or credit change with assessMargins first.
4. Open a PR on ceo-finance/<slug> (tests, margin gate, format, lint, typecheck, build
   all pass), update FinancePlan.md ledger/changelog and TheMasterPlan.md §10. Never merge,
   never touch live secrets, never write to Stripe/Supabase/Vercel without owner OK.
5. Notify (PushNotification) only on: MRR ratio < 1.5x, margin gate failing, vendor price
   change > 20%, cost line +30% week on week, or an owner decision needed. Otherwise silent.
   Update FinancePlan §5 and ask for missing information instead of guessing.
```

---

## 10. Changelog (newest on top)

- **2026-10-15** — Finance track created: this plan, `features/finance/unit-economics.ts` (MRR, net MRR after VAT/Stripe, cost per tier, failed-job cost, trial burn, gross margin, cash, MRR ratio), `scripts/finance-report.mts` (read-only) and 5 tests. Supabase connector failed to connect from the cloud session, so no live numbers yet. (Finance CEO, setup)
