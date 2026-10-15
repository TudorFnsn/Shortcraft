# FinancePlan — Shortcraft unit economics & cash return

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md` (which wins on product and priority). This file
> wins on cost, pricing, vendor choice and cash. Every finance PR updates this
> file (scorecard, ledger of decisions, changelog) in the same change.
>
> Last updated: 2026-10-15 (routine created; first baseline below)

---

## 1. Charter

| Question  | Answer                                                                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximise cash return**: highest MRR and contribution margin per euro of spend, without breaking the 3x margin gate or product quality.                                                                                      |
| Always    | Check MRR, net revenue, cost per video, credits-vs-cost ratio, and every recurring bill. Propose or implement the change with the best payback.                                                                               |
| Autonomy  | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`. Never merges, never touches live secrets, never changes live Stripe prices or subscribes to a paid vendor.                                              |
| Cadence   | Daily cloud routine "Shortcraft Finance CFO", 07:00 UTC (after the CEO at 06:00, before Design at 09:00).                                                                                                                     |
| Territory | `src/config/models.ts`, `src/config/plans.ts`, `src/features/billing/*`, `src/features/providers/*`, `scripts/*-report.mts`, `FinancePlan.md`. UI and product copy stay with the CEO / Design routines (propose via the CEO). |
| Evidence  | Measured beats researched. Every vendor claim needs a source URL and a date; every number says whether it is **measured** (our DB/billing) or **list price**.                                                                 |

---

## 2. How the routine works (master agent + specialists)

The routine's first agent is the **Finance Master** (the "DM"). It reads this file, `TheMasterPlan.md` §7–§9, lists open and recently closed PRs (an item with an open PR is in review, not available), then **splits the work across specialist subagents in parallel** and merges their results. It picks **one** highest-payback item for the day's PR.

| Specialist (subagent)  | Question it answers                                                                                                          | Reads                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Revenue analyst**    | What is MRR, net MRR movement, churn, ARPU, trial→paid, top-up share, refunds, failed payments?                              | Stripe (analytics/API read), Supabase `subscriptions`, `credit_transactions`                              |
| **Cost auditor**       | What does a finished video cost us **measured**, per step and per tier, vs the modelled cost? Where is the margin leak?      | Supabase `render_jobs.api_cost_usd`, `charged_credits`, orchestrator `warn` logs, `npm run` margin report |
| **Infra & bills**      | What do Vercel, Supabase, ElevenLabs, fal.ai, Anthropic, Sentry, Resend, domain cost per month, and which tier is oversized? | Vercel billing/usage, Supabase usage/advisors, owner-pasted invoices (see §6)                             |
| **Vendor scout**       | Is there a cheaper or better provider per slot (video, image, voice, script, render, hosting)? Verified, with sources.       | Web search, Firecrawl (if enabled), vendor pricing pages                                                  |
| **Pricing strategist** | Are plans, top-ups, trial and annual billing priced to maximise cash? What would raise ARPU or cut churn?                    | Master plan §7, `margin.ts`, Stripe prices, competitor pages                                              |
| **Implementer**        | Turns the chosen item into a tested PR (new catalog row + adapter, repricing, script, tests).                                | Repo; runs `format:check`, `lint`, `typecheck`, `test`, margin report                                     |
| **Skeptic**            | Tries to break the plan: does it fail the margin gate, lower quality, add vendor lock-in or hidden cost?                     | The diff and the specialists' evidence                                                                    |

Rules for the master: run the five analysts in parallel; hand the Implementer a single, narrow brief; run the Skeptic on the diff; never ship a cost-saving that lowers the video quality below the tier's promise without flagging it.

### Daily loop

1. **Collect** — specialists gather numbers (read-only). Write them into §3.
2. **Rank** — payback = (monthly € saved or earned) ÷ (effort + risk). Pick one.
3. **Implement or propose** — code change as a PR, or a decision request in the digest if it needs the owner (§6).
4. **Record** — update §3 scorecard, §5 decisions and §7 changelog, and `TheMasterPlan.md` (changelog line, §7 numbers if they moved).
5. **Notify** — send a push notification **only** when something needs the owner: margin gate below 3x, a measured cost > 1.5x modelled, a vendor saving > €20/month, MRR drop, a missing access the routine needs, or a PR ready for review. Otherwise stay silent.

### Guardrails

- Read-only on Stripe/Supabase/Vercel. Any write (migration, price change, live mode, vendor signup) needs the owner's explicit OK first (master plan §9).
- `npx tsx scripts/margin-report.mts` must exit 0 before any PR that touches catalog or plans.
- No new paid dependency without a stated monthly cost and a free-tier or usage cap.
- A vendor swap goes in as a **new catalog row + adapter behind the registry**, with the old one kept as fallback until measured on real calls.

---

## 3. Scorecard (update every run)

### Baseline, 2026-10-15

| Metric                           | Value                                                                              | Source              |
| -------------------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| Profiles / subscriptions (live)  | 6 / 2 (both active or trialing)                                                    | measured            |
| MRR                              | **unknown**: Stripe is sandbox, Sigma not enabled                                  | gap, §6             |
| Jobs rendered to date            | 17 (14 done, 3 failed, failures cost $0)                                           | measured            |
| API cost to date                 | **$8.13** total                                                                    | measured            |
| Standard 15s, measured           | **$0.232 avg** (10 jobs) vs **$0.07 modelled**: ~3.3x higher                       | measured vs model   |
| Standard 30s, measured           | $0.049 (1 job; low sample)                                                         | measured            |
| Premium 30s, measured            | **$1.919 avg** (3 jobs) vs ~$3.80 modelled: ~50% lower                             | measured vs model   |
| Avg credits charged, premium 30s | 14,212 (priced 44,040 at list: charge was far below the quote; check why)          | measured            |
| Margin gate (modelled costs)     | PASS: Starter 5.62x, Pro 3.00x, Ultra 3.23x, top-ups 3.96–5.92x; trial burn $0.23  | `margin-report.mts` |
| Vercel billing charges           | API returned `costs_not_found` (no billed usage in the last 30 days, likely Hobby) | Vercel MCP          |
| Stripe Sigma (MRR templates)     | not subscribed on the sandbox account                                              | Stripe MCP          |

### What the baseline already says

1. **The model undercounts Standard cost.** 10 real Standard 15s jobs averaged $0.232, not $0.07. The catalog still holds list prices. Until the Cost auditor splits it by step (script / images / voice / render), the 5.3x+ Starter margin is not proven. **First task for the next run: per-step cost breakdown and a re-baselined `costUsdPerUnit`.**
2. **Premium is cheaper than modelled** (≈$1.92 for 30s vs $3.80). If Pro's 3.00x was driven by `video-premium` at $0.12/s, measured cost may allow lowering the per-second credit price (more videos per plan, better conversion) or keep it as pure margin. Decide with more samples (need ≥10).
3. **Credits charged on Premium (14.2k) are far below the 44k quote.** Either the orchestrator is capping at metered cost in a way that under-charges, or the sample is test grants. Investigate before launch: it is direct margin.
4. **Failed jobs cost $0** and refund: good, keep it.

---

## 4. Vendor shortlist (research, to be measured)

Prices disagree across sources by up to 2x; none of these is trusted until measured on real calls (master plan §7, risk 3). Sources: [Atlas Cloud, cheapest video API 2026](https://www.atlascloud.ai/es/blog/guides/cheapest-ai-video-generation-api-2026), [invideo, AI video model pricing (Aug 2026)](https://invideo.io/blog/ai-video-model-pricing), [apiframe, best image-to-video APIs 2026](https://apiframe.ai/blog/best-image-to-video-apis-2026), [aireiter, cheapest image-to-video API](https://aireiter.com/blog/cheapest-image-to-video-api).

| Slot (today)                                              | Candidate                                                    | Indicative price (list, unverified) | Note                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------- |
| Premium video (fal Kling 2.5 Turbo Pro, ~$0.07/s)         | Wan 2.2 Turbo / Wan 3.0 (480p–720p)                          | ~$0.02/s … $0.04–0.08/s             | Cheapest per second; test I2V quality and motion on our themes   |
|                                                           | Kling 3.0 on fal                                             | reported $0.029/s … $0.084/s        | Sources conflict: read the fal page and bill a real call         |
|                                                           | Seedance 2.x at 480p                                         | ~$0.07/s (Runware)                  | Good price/quality at 480p, vertical 9:16 support to check       |
|                                                           | Hailuo (per-clip)                                            | ~$0.28 per 6s ≈ $0.047/s            | Fixed clip lengths: fits our 6s max scene                        |
|                                                           | LTX-2.3 Fast                                                 | $0.06–0.24/s                        | Already the "Low" scenario in master plan §7                     |
| **Hero-shot only** (AI clip on scene 1, stills elsewhere) | n/a (design, any model)                                      | ~$0.45 per 15s video vs ~$1.10 full | Biggest lever: cuts premium cost ~60% with little perceived loss |
| Images (FLUX schnell $0.003)                              | keep                                                         | already near floor                  | Not worth swapping                                               |
| Voice (ElevenLabs Flash)                                  | Cartesia / OpenAI TTS / self-hosted Kokoro                   | cents per 1k chars; verify          | Voice is <2% of cost; only switch if quality is equal            |
| Script (Claude Sonnet 5.5 ~$0.04)                         | Claude Haiku 5.5 with prompt caching                         | est. 3–5x cheaper                   | Test script quality on all 8 themes before switching             |
| Hosting (Vercel)                                          | stay on Hobby until traffic / commercial-use rules force Pro | $0 → $20/seat                       | Hobby bars commercial use: **check ToS before go-live**          |

Also on the table (scout to price): annual plans with ~2 months free (cash up front, lower churn), a credit expiry/rollover policy, a higher-priced "Creator" tier between Pro and Ultra, usage-based overage at the Pro margin, and an affiliate payout model that keeps CAC under first-month revenue.

---

## 5. Decisions & open questions

| Date       | Decision / question                                                                                        | Status                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 2026-10-15 | Create the Finance CFO routine, PR-gated, branches `ceo-finance/*`.                                        | Owner request                                    |
| 2026-10-15 | Re-baseline `costUsdPerUnit` from measured `render_jobs.api_cost_usd` per step.                            | Next run                                         |
| 2026-10-15 | Pilot a cheaper premium video model (Wan / Kling 3.0 / Seedance) behind the registry, plus hero-shot mode. | Needs owner OK for the vendor account / key (§6) |

---

## 6. Access the routine needs (ask the owner, in this order)

Already connected: **Supabase** (read SQL works), **Stripe** (sandbox only), **Vercel** (team `tudorfnsns-projects`; no billed usage returned), **GitHub**.

| Need                                                                                               | Why                                                        | How                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Stripe live-mode read access** (restricted key or connector on the live account)                 | Real MRR, churn, refunds, fees. Sandbox has no revenue.    | Create a read-only restricted key in Stripe; connect the live account in the Stripe connector                       |
| **Stripe Sigma** (optional, paid by Stripe)                                                        | `stripe_analytics` MRR/churn templates                     | Or skip: the routine computes MRR from the subscriptions API                                                        |
| **Monthly vendor bills** (fal.ai, ElevenLabs, Anthropic, Supabase, Vercel, Resend, Sentry, domain) | Total cost of running the app, not just per-video API cost | Paste a monthly summary into the session, or enable usage/billing pages or invoice emails via Gmail/Drive connector |
| **fal.ai usage export** (or a usage API key)                                                       | Reconcile our `api_cost_usd` with what fal actually billed | fal dashboard → usage → CSV                                                                                         |
| **Anthropic + ElevenLabs usage**                                                                   | Tokens in/out per script; characters per voice             | Console usage export; or log token counts per job (the routine can add this, see below)                             |
| **Gmail or Google Drive connector** (optional)                                                     | Auto-read invoices and receipts                            | claude.ai → Connectors                                                                                              |
| **Firecrawl connector enabled in routine sessions** (already installed)                            | Read vendor pricing pages the proxy blocks                 | Turn on for the routine's environment                                                                               |

**Gap in the data the routine will close first:** `render_jobs` stores one `api_cost_usd` per job, not per step, and **not the token counts**. The first implementation PR adds a per-step usage record (script input/output tokens, image count, video seconds, voice characters, render ms, each with its USD cost) so "tokens used vs money spent" is answerable per video. That needs a migration, so it is written for the owner to apply (additive, expand-only).

### Suggested tools (not installed; owner decides)

- **Stripe live connector + Sigma or Stripe Revenue Recognition**: MRR, churn, cohorts.
- **Vercel MCP** (already connected): billing charges once the team is on a metered plan.
- **PostHog or Plausible**: visitor→signup→paid funnel and CAC by channel (master plan §9 notes no analytics connector).
- **Helicone or Langfuse**: per-call LLM cost and token tracking for the Anthropic script step (a code-level alternative is the per-step usage record above).
- **Cost anomaly alerts**: a Supabase view + the routine's notification, or Vercel Spend Management.
- **Firecrawl** (installed): vendor price-page scraping.

---

## 7. Changelog (newest on top)

- **2026-10-15** — Finance track created: charter, master/specialist structure, first measured baseline (17 jobs, $8.13; Standard 15s measured at 3.3x the modelled cost; Premium 30s about half), vendor shortlist, access list. Docs only. (Finance CFO, interactive setup)

---

## 8. The routine prompt (paste into the cloud routine "Shortcraft Finance CFO")

```
You are the Finance Master for Shortcraft (repo TudorFnsn/Shortcraft), a scheduled routine at
PR-gated autonomy. Nobody is watching live. Your goal: maximise cash return (MRR, contribution
margin, payback) without breaking the 3x margin gate.

1. Read FinancePlan.md, then TheMasterPlan.md §7-§9. List open and recently closed PRs; an item
   with an open PR is in review, not available. Do not touch UI files while a ceo-design/* PR is open.
2. In ONE message, launch these subagents in parallel, each with a narrow brief and read-only access:
   Revenue analyst, Cost auditor, Infra & bills, Vendor scout, Pricing strategist (roles and sources
   in FinancePlan.md §2). They return numbers with sources, labelled measured or list price.
3. Update the FinancePlan.md §3 scorecard with what you found. Flag any metric you could not get and
   which access in §6 would unlock it.
4. Rank candidate changes by payback (monthly euro gain / effort+risk). Pick ONE. Hand it to the
   Implementer subagent with a narrow brief, then run the Skeptic on the diff. Run format:check, lint,
   typecheck, test and `npx tsx scripts/margin-report.mts` (must exit 0).
5. Open a PR on branch ceo-finance/<slug> with: the change, the before/after numbers, the sources, and
   what the owner must approve. Update FinancePlan.md (§3, §5, §7) and a TheMasterPlan.md changelog line.
   Never merge. Never use live secrets or change live Stripe prices. Writes to Supabase/Stripe need the
   owner's OK.
6. Send ONE push notification only if: the margin gate falls below 3x; a measured cost exceeds 1.5x its
   modelled cost; a vendor change would save more than 20 EUR/month; MRR dropped; you lack access you
   need; or a PR is ready for review. Lead with the single most important sentence. If nothing needs
   the owner, stay silent.
```
