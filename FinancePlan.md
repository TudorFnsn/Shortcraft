# FinancePlan — Shortcraft

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> Product, pricing and priority calls still live in `TheMasterPlan.md` (§7 pricing,
> §8 risks). This file holds the charter, the agent roster, the metrics, the
> backlog and the log for money work.
>
> Last updated: 2026-10-18

---

## 1. Charter

Maximise **cash returned per euro spent**, and grow MRR, without hurting the north
star (weekly paying-retained creators, `TheMasterPlan.md` §1). Every run:

1. Measure: MRR, net revenue, API spend, cost per video by tier, fixed costs, cash margin.
2. Find the biggest leak or lever (a cheaper provider, a pricing gap, wasted spend, a conversion fix).
3. Ship or propose one change, with the numbers behind it.

Priority order when things conflict: **cash margin > MRR growth > cost of the stack > everything else.**
The 3x margin gate (`features/billing/margin.ts`) is a floor, never something to relax to win a quarter.

## 2. How the routine runs (master agent + specialists)

One **CFO master agent** runs daily. It does not do the analysis itself: it reads this
file, takes a snapshot, decides which lanes have work today, and fans them out as
parallel sub-agents with narrow briefs. It then merges the answers, picks the single
highest-leverage change, and reports.

| Lane                      | Question it answers                                                                                                    | Reads                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Revenue (MRR)**         | MRR/ARR, churn, plan mix, top-ups, trial → paid, ARPU, pricing and packaging fixes                                     | `scripts/finance-report.mts`, `scripts/metrics-report.mts`, Stripe (once live), `config/plans.ts` |
| **Unit economics**        | Cost per video by tier, tokens/usage vs credits charged, failed-job waste, margin gate headroom                        | `scripts/finance-report.mts`, `scripts/margin-report.mts`, `config/models.ts`, `render_jobs`      |
| **Vendor scout**          | Cheaper or better models for video, image, voice and script; new techniques (caching, batching, tiering, open weights) | Web research, provider pricing pages, `config/models.ts`, `features/providers/live/*`             |
| **Infra and fixed costs** | Vercel, Supabase, ElevenLabs, Resend, Sentry, domain: plan fit, overage risk, what to downgrade                        | Vercel and Supabase connectors (usage, billing), `config/fixed-costs.ts`                          |
| **Growth to cash**        | Cheapest path from visit to paid: pricing page, trial, upgrade prompts, annual plan, referral                          | `metrics-report.mts`, SEO pages, `config/plans.ts`                                                |

The master spawns only the lanes with something to do (a quiet lane is skipped, not
padded). Lanes are read-only and return numbers plus a recommendation; **only the
master writes code, and one change per run.**

### Autonomy (PR-gated, same as the other routines)

- May: read the repo and every connected tool read-only, run the report scripts, research the web, open **one** PR a day on a `ceo-finance/*` branch, and edit this file.
- Never: merge, touch live secrets, write to Stripe/Supabase/Vercel (the owner approves every write), change a price or credit grant without the owner's approval (a pricing change is a **proposal** with a margin-gate run attached), switch a live provider, or lower the 3x margin gate.
- Before picking work: list open and recently closed PRs; an item with an open PR is in review, not available. Leave `ceo-design/*` PRs and UI files alone.
- Files it may change: `src/config/models.ts` (**costs only**, from measured numbers), `src/config/fixed-costs.ts`, `src/features/finance/**`, `src/features/providers/**` (new adapters behind the existing port, off by default), `scripts/*report*.mts`, `tests/**`, this file, `docs/routines/finance-cfo.md`, and its lines in `TheMasterPlan.md`.
- Bar for any code PR: `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` in mock mode.
- **Notify the owner** (push notification) only for: a margin gate failure, MRR down week over week, a spend spike, a vendor change worth > 20% of API spend, a blocked data source, or a decision only the owner can make. A quiet healthy run sends nothing.

## 3. Metrics and where they come from

| Metric                                      | Source                                                        | Status (2026-10-18)                                                      |
| ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| MRR, ARR, plan mix, net MRR                 | `finance-report.mts` from `subscriptions` + `config/plans.ts` | Built. App is on Stripe **test mode**, so MRR is sandbox until go-live.  |
| Top-up revenue                              | `credit_transactions` `topup` rows matched to packs           | Built.                                                                   |
| API spend and cost per video by tier        | `render_jobs.api_cost_usd`                                    | Built. It is usage × catalog **list price**, not an invoice.             |
| Failed-job waste                            | `render_jobs` `failed` rows                                   | Built.                                                                   |
| Cash margin (net revenue − API − fixed)     | `finance-report.mts` + `config/fixed-costs.ts`                | Built. **Fixed costs are all `null` until the owner enters them.**       |
| **Tokens and units per provider call**      | nothing stored                                                | **Gap.** Only the dollar total is saved per job. See backlog F1.         |
| Invoiced spend (fal, Anthropic, ElevenLabs) | provider dashboards                                           | **Gap.** Owner pastes monthly totals; see §6.                            |
| Churn, refunds, disputes, real MRR          | Stripe (Sigma / API)                                          | **Blocked.** Stripe connector shows `needs_reconnect`; live mode not on. |
| Hosting bill                                | Vercel / Supabase connectors                                  | Vercel and Supabase connected; billing reads untested.                   |

Run it: `npx tsx scripts/finance-report.mts` (add `--json` for the digest). Math is pure
and tested in `features/finance/finance.ts`.

## 4. Where the money goes (from what the repo already says)

- **Standard** (animated stills, in-house ffmpeg): measured **$0.037** (15s) to **$0.049** (30s) per video. Already ~9x margin on Starter. Little left to cut; fal is not the Standard problem.
- **Premium** (AI video clips): measured **$1.92** for a 30s video at the catalog's conservative $0.12/s; Kling 2.5 Turbo Pro lists ~$0.07/s, so the true cost is likely lower. This is where a cheaper video model pays off, and where **Pro sits at exactly 3.0x with zero headroom**.
- A **hero-shot** Premium (AI clip on scene 1 only) is ~$0.45 per 15s video: the cheapest way to make Premium sell.
- Script (Claude Sonnet 5.5, ~$0.02–0.04) and voice (ElevenLabs Flash, ~$0.00075/s) are small. The ElevenLabs **custom-voice slot** limit is a fixed-cost cliff, not a per-video cost.

## 5. Backlog (ordered; the master takes the top item that is unblocked and not in an open PR)

- [ ] **F1 Record usage per provider call.** Add `render_jobs.usage jsonb` (migration, owner applies): per step the provider, model id, units (input/output tokens for the script, megapixels for images, seconds for video, characters for voice) and cost. Without it the "tokens vs spend" question can only be answered in dollars. Additive, nullable, backfill nothing.
- [ ] **F2 Reconcile list price vs invoice.** Owner pastes last month's fal, Anthropic and ElevenLabs totals (§6). The routine compares them with `SUM(api_cost_usd)` for the month, and corrects `costUsdPerUnit` in `models.ts` if they differ by > 10%. Re-run the margin report after.
- [ ] **F3 Video model bake-off.** Price and quality shortlist for image-to-video: current Kling 2.5 Turbo Pro vs LTX-2, Wan 2.x, Seedance, Hailuo and Veo Fast variants, on fal and on direct or alternative hosts (Replicate, Runware, Novita, WaveSpeed, DeepInfra and similar), with per-second price, 9:16 support, clip length and watermarks. Output: a table in this file and, if a candidate beats Kling by > 25% at equal quality, a `FAL_VIDEO_MODEL` env change or a new adapter behind the port, flagged off. The owner judges the look on one sample before anything goes live.
- [ ] **F4 Hero-shot Premium tier.** Model it in the margin gate (`--premium` already previews it) and propose a price. A cheaper Premium that sells beats an expensive one nobody can afford.
- [ ] **F5 Prompt caching and model tiering for the script.** Cache the system prompt; test Haiku 5.5 for the script step against Sonnet 5.5 on quality. Saves cents per video; only worth it at volume, so do it after F1 gives real token counts.
- [ ] **F6 Media egress and storage.** Retention policy for the `media` bucket and the move to Cloudflare R2 (no egress fees), once Supabase storage or bandwidth approaches the plan limit.
- [ ] **F7 Annual plans.** A yearly price at ~2 months free lifts cash up front and cuts churn. Needs the owner's yes (price change), Stripe prices, and a webhook check.
- [ ] **F8 Upgrade prompts and pricing page tests.** Use `metrics-report.mts` (trial → paid) to find where signups stall; propose one change at a time.
- [ ] **F9 Stripe real MRR.** Once the connector is reconnected and live mode is on: churn, refunds, disputes and failed-payment recovery (Stripe Smart Retries and dunning emails) into the report.
- [ ] **F10 Hosting right-sizing.** Check Vercel and Supabase usage against plan limits monthly; downgrade anything unused, upgrade only before a limit breaks sign-ups.

## 6. What the owner needs to provide (one-time, ~15 minutes)

1. **Fixed costs:** fill `src/config/fixed-costs.ts` (every `monthlyUsd: null`). Until then cash margin excludes them and says so.
2. **Invoiced spend:** last month's totals from the fal.ai, Anthropic and ElevenLabs dashboards (and what plan tier ElevenLabs is on).
3. **Reconnect the Stripe connector** (claude.ai → Settings → Connectors → Stripe: `needs_reconnect`). It stays read-only for the routine.
4. **Routine environment:** the routine needs `.env.local`-style read access to the production database to run the report scripts. Safest option: a Postgres role with `SELECT` only on `subscriptions`, `render_jobs` and `credit_transactions`, exposed to the routine as its own secret. The Supabase connector (read-only queries) is the fallback and needs no secret.
5. **Create the routine** on claude.ai from `docs/routines/finance-cfo.md` (prompt, schedule, connectors and repo access are listed at the top of that file).

## 7. Connectors, tools and add-ons that would help

Already connected: **GitHub** (repo), **Supabase** (read-only SQL, advisors, logs), **Vercel** (usage, billing, runtime logs), **Firecrawl** (price-page scraping, which the earlier routine could not reach directly). Needs action: **Stripe** (reconnect; MRR/churn/refunds/disputes via Sigma).

Worth adding, in order of value:

1. **Stripe, reconnected** (above): real MRR and churn instead of the plan-table estimate.
2. **PostHog** (already planned in the Master Plan): visit → signup → first video → paid funnel and attribution, so spend on SEO and ads can be tied to cash.
3. **A Google Sheet or Drive folder** for the owner's monthly invoice totals: the routine reads one sheet instead of asking.
4. **Sentry connector:** failed-render cost (wasted spend) and error spikes that burn API money.
5. **Resend or an email connector:** lifecycle email performance (reminders are a retention lever).
6. **Provider dashboards with API access** (fal.ai usage API, Anthropic Usage and Cost API, ElevenLabs usage endpoint): actual invoiced spend per day instead of list-price estimates. This is the best fix for F2, and needs read-only keys stored as routine secrets.
7. **Claude tools:** the Anthropic Admin API for token usage per workspace and prompt caching for the script step; the `claude-api` skill for any caching or model-tier change.

## 8. Rules the routine follows

- Numbers carry their source and date. List price, measured and invoiced are labelled as such; never mix them in one figure.
- Prices from search snippets are leads, not facts (the 2026-10 research disagreed by up to 2x). Confirm on the provider's own page with Firecrawl, or on a real call, before recommending a switch.
- A recommendation names the saving per month at today's volume and at 10x, the risk, and how to roll it back.
- Zero revenue is a number, not an error: with no paying users the routine works on cost per video, headroom and the funnel, and says so in one line.
- Never assert MRR from the sandbox as real. Label test-mode figures "sandbox".

## 9. Log (newest on top)

- **2026-10-18** — Finance track created: charter, lanes, backlog, `scripts/finance-report.mts` + `features/finance/finance.ts` (MRR, net MRR, top-ups, API spend, cost per video by tier, failed-job waste, cash margin; 5 tests) and `config/fixed-costs.ts` (all unknown). Routine prompt in `docs/routines/finance-cfo.md`; the routine itself is created by the owner on claude.ai (no way to create it from a session). First read: Stripe connector needs reconnect, app is in Stripe test mode, no per-call token usage is stored. (Finance CFO, setup)
