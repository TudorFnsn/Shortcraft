# FinancePlan — Shortcraft unit economics & cash return

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine
> (prompt: `docs/routines/finance-ceo.md`). It sits under `TheMasterPlan.md`:
> the master plan wins on product and priority; this file wins on cost,
> pricing math and vendor choice. Every finance PR updates §3 (numbers) and §6
> (changelog) in the same change.
>
> Last updated: 2026-10-13

---

## 1. Charter (proposed 2026-10-13, owner to confirm the open items in §5)

| Question     | Answer                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal         | Maximise **cash return**: net MRR minus every cost to run the app, month after month. Margin first, growth second, vanity metrics never.                                        |
| Scope        | Revenue (MRR, churn, ARPU, trial → paid), COGS (every provider, per video), fixed costs (hosting, DB, email, monitoring), pricing/credit scale, vendor swaps, billing hygiene   |
| Autonomy     | **Analyse + PR-gated code**, same as the other routines. Branches `ceo-finance/<slug>`; never merges; never writes to live Stripe, never touches live secrets or vendors.       |
| Cadence      | Daily cloud routine **"Shortcraft Finance CEO"**. Suggested 07:30 UTC (after the main CEO at 06:00 and before Design at 09:00).                                                 |
| Notification | Only when something needs the owner (see `docs/routines/finance-ceo.md`, "When to notify"). A healthy day is silent.                                                            |
| Files owned  | `FinancePlan.md`, `src/features/metrics/finance.ts`, `src/features/billing/margin.ts`, `src/config/models.ts` + `plans.ts` **numbers**, `scripts/*-report.mts`, vendor adapters |
| Files shared | Pricing UI and Create UI belong to the Design routine: the Finance CEO changes the numbers behind them, not the layout.                                                         |

### Principles

1. **Measured beats researched.** Public list prices disagree by up to 2x (TheMasterPlan §7). A decision needs a measured cost per video, from real calls.
2. **Cost per _finished_ video is the unit.** Failed jobs, retries, the free trial and moderation rejections all spend money; they belong in the denominator.
3. **Margin gate stays fail-closed.** `npx tsx scripts/margin-report.mts` must pass at 3x on every plan and top-up before any change merges. Pro sat at exactly 3.00x on 2026-10-05; one cost increase breaks it.
4. **Cheaper must not look worse.** A vendor swap ships only with a side-by-side sample set the owner can watch. Quality is a retention cost.
5. **Cash before ARR.** Prefer annual prepay, fewer refunds, fewer failed payments and lower trial burn over a bigger headline number.

---

## 2. Data sources

| Need                       | Source today                                                         | Status                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| MRR, subscribers, plan mix | `subscriptions` + `PLANS` list prices → `scripts/finance-report.mts` | **Built** (this PR). DB read needs `.env.local` or the Supabase connector                                                    |
| Cost per video, per tier   | `render_jobs.api_cost_usd` (orchestrator-metered)                    | **Built**; coverage % printed by the report                                                                                  |
| Cost per provider/step     | not stored                                                           | **Gap F1**: needs a `usage_events` table (job, step, provider, model, units, usd, tokens in/out). Migration is owner-applied |
| LLM tokens                 | not stored; Anthropic returns `usage` on every call                  | **Gap F1**, same table                                                                                                       |
| Real money in/out          | Stripe (test mode only so far)                                       | Needs live-mode **read-only** access, see §4                                                                                 |
| Provider invoices          | fal, ElevenLabs, Anthropic, Vercel, Supabase, Resend dashboards      | Needs usage/billing read access, see §4                                                                                      |
| Fixed monthly costs        | not recorded anywhere                                                | **Owner input**, see §5                                                                                                      |

Cost model (what one video spends): script (Anthropic) + images (fal FLUX) + voice (ElevenLabs, per character) + optional AI video clips (fal Kling, Premium only) + render (in-house ffmpeg, ~$0.01) + storage/egress. Catalog lives in `src/config/models.ts`.

---

## 3. Numbers (update every run)

_No live revenue yet: Stripe is test-mode and the app has no paying users on record. First run of the Finance CEO fills this table from `scripts/finance-report.mts --json`._

| Metric                                  | Value                                          | As of |
| --------------------------------------- | ---------------------------------------------- | ----- |
| MRR (EUR) / net MRR (USD)               | n/a                                            |       |
| Paying subscribers (Starter/Pro/Ultra)  | n/a                                            |       |
| API cost, last 30d / per finished video | n/a                                            |       |
| Wasted spend on failed jobs, 30d        | n/a                                            |       |
| Cost-metering coverage                  | n/a                                            |       |
| Gross margin / net MRR ÷ API cost       | n/a                                            |       |
| Fixed costs per month                   | n/a                                            |       |
| Margin gate (Starter / Pro / Ultra)     | 9.4x / 3.00x / 3.23x (2026-10-05, list prices) |       |

---

## 4. Connectors, tools and access the routine wants

Ranked by cash impact. "Read-only" is a hard requirement everywhere: the routine analyses and opens PRs, it never moves money or changes a vendor account.

| #   | Access                                                                                                                           | Why                                                                                                              | How                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Supabase connector** (already configured; failed to connect on 2026-10-13)                                                     | Read `render_jobs`, `subscriptions`, `credit_transactions` for real cost/revenue                                 | Re-authenticate in claude.ai → Connectors                                                                                                                                                                                            |
| 2   | **Stripe, live mode, restricted read-only key** (Balance, Charges, Subscriptions, Invoices, Refunds, Disputes; Sigma if enabled) | Real MRR, churn, refunds, failed payments, fees                                                                  | Owner creates the restricted key; connector currently points at the sandbox                                                                                                                                                          |
| 3   | **fal.ai usage/billing** (admin API key or dashboard export)                                                                     | Largest COGS line; compare billed vs metered per job                                                             | Owner exports monthly or adds a read-only key as a routine secret                                                                                                                                                                    |
| 4   | **Anthropic Admin API key** (usage + cost reports)                                                                               | Tokens and dollars for the script step; verify caching/batch savings                                             | Console → Admin keys; `ANTHROPIC_WORKSPACE_ID` already supported                                                                                                                                                                     |
| 5   | **ElevenLabs usage** (`/v1/user/subscription`, character counts)                                                                 | Voice cost per video; custom-voice slot pressure                                                                 | Read-only via existing `ELEVENLABS_API_KEY` or dashboard export                                                                                                                                                                      |
| 6   | **Vercel connector** (configured; has `list_billing_charges`, runtime logs)                                                      | Hosting, function duration, egress: the ffmpeg render runs here                                                  | Already connected                                                                                                                                                                                                                    |
| 7   | **GitHub** (scoped to this repo)                                                                                                 | PRs, CI, changelog                                                                                               | Already connected                                                                                                                                                                                                                    |
| 8   | **Web search/fetch** in the routine                                                                                              | Vendor price scouting; network policy must allow vendor pricing pages (the 2026-10-04 run was blocked from them) | Environment network policy → allow provider domains (fal.ai, replicate.com, elevenlabs.io, cartesia.ai, deepgram.com, wavespeed.ai, runware.ai, together.ai, runpod.io, modal.com, vercel.com, supabase.com, resend.com, stripe.com) |
| 9   | Later: **PostHog/Plausible** (funnel), **Sentry** (error spend), **Resend** stats                                                | Conversion and email cost                                                                                        | Only once there is traffic                                                                                                                                                                                                           |

Skills/add-ons worth adding: the existing `supabase` and `supabase-postgres-best-practices` skills (usage-metering migration); the `claude-api` skill (cheaper Claude usage: prompt caching, Batch API, smaller model for the script step); `Workflow` for fan-out research when the owner opts in.

---

## 5. Open questions for the owner (the routine cannot invent these)

1. **Fixed monthly costs:** Vercel plan, Supabase plan, ElevenLabs plan, Resend, Sentry, domain, any SaaS. Paste the numbers into §3.
2. **Stripe live mode:** when will it go live, and can the routine have a restricted read-only key?
3. **Target:** a monthly net-profit goal and the break-even subscriber count you want to see.
4. **Quality floor:** may a cheaper model be Standard-only first, or must Premium stay on Kling until a clear winner exists?
5. **Pricing authority:** may the routine open PRs that change plan prices/credit grants (it will always show the margin-gate output and the customer-facing before/after)?

---

## 6. Roadmap (priority = cash impact ÷ effort)

- [x] **F0 Finance report** (`finance.ts`, `scripts/finance-report.mts`, tests): MRR, net MRR, cost per tier, wasted spend, gross margin, metering coverage.
- [ ] **F1 Usage metering** — `usage_events` table (job, step, provider, model, units, usd, tokens in/out) written by the orchestrator, plus a view for per-provider cost per video. Without it the answer to "tokens vs money" is a guess. Needs owner to apply the migration.
- [ ] **F2 Measure real costs** — run `scripts/live-providers-smoke.mts` for each tier with `FAL_KEY` set; replace `costUsdPerUnit` list prices with measured ones; re-run the margin gate.
- [ ] **F3 Vendor bake-off** — scout and A/B cheaper options per slot, behind the existing adapter layer (one catalog row + one adapter each). Candidates to verify, not assume: image-to-video (Wan 2.x, LTX-2, Seedance, Hailuo vs Kling on fal; the same models on Replicate/WaveSpeed/Runware or the lab's own API, since marketplaces add margin), images (FLUX schnell vs smaller/faster open models), TTS (ElevenLabs Flash vs Cartesia, Deepgram Aura, OpenAI TTS, self-hosted Kokoro for the Standard tier), script LLM (Haiku-class model, prompt caching, Batch API for non-interactive jobs).
- [ ] **F4 Cost levers inside the pipeline** — hero-shot Premium (AI clip on scene 1 only, ~$0.45 per 15s vs ~$1.10), cap retries, reuse images across re-voice jobs, cache script prompts, drop resolution where nobody can see it, refuse to start a job whose hold can't cover its cost.
- [ ] **F5 Revenue levers** — yearly plans with a prepay discount (cash up front), credit expiry/rollover rules, dunning (Stripe Smart Retries + failed-payment email), top-up nudges at 20% balance, trial burn cap (currently ~$0.14/signup), affiliate program, price test on Pro (the 3.00x plan).
- [ ] **F6 Fixed-cost audit** — right-size Vercel/Supabase/ElevenLabs plans against usage; kill unused vendors.
- [ ] **F7 Weekly finance digest** — one line per metric vs last week, written into §3.

---

## 7. Changelog (newest on top)

- **2026-10-13** — Finance track created: `FinancePlan.md`, routine prompt `docs/routines/finance-ceo.md`, F0 finance report (+4 tests). Plan only beyond F0. (interactive)
