# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file
> wins on pricing, costs, vendors and cash. Every finance PR updates this file
> (metrics log + changelog) in the same change.
>
> Last updated: 2026-10-16 (created)

---

## 1. Charter (owner request 2026-10-16, do not change without Tudor)

| Question  | Answer                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal      | Maximise **profit and cash return**. Every run checks MRR, the revenue ÷ cost ratio and gross margin, then proposes or implements changes that improve them.                                                                                           |
| Scope     | Pricing and plans, credit scale, vendor and model choice (fal.ai video is the known cost), hosting/infra spend, Stripe fees, new monetisation ideas.                                                                                                   |
| Autonomy  | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merge. Read-only on Stripe, Supabase, Vercel. Any write to a live system, price change in Stripe, or vendor switch in production needs Tudor's OK.                         |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the CEO at 06:00 and Design at 09:00). Weekly deep review on Mondays.                                                                                                               |
| Collision | Touches `config/models.ts`, `config/plans.ts`, `features/billing/*`, `features/providers/*`, `features/finance/*`, `scripts/finance-*`. Never UI files while a `ceo-design/*` PR is open (price copy changes go in the design PR's follow-up or wait). |
| Guardrail | The **margin gate** (`features/billing/margin.ts`, 3x worst case) must keep passing. Never lower quality or safety (moderation, AI label) to save money.                                                                                               |

## 2. Operating loop (DM master agent)

The routine's main session is the **master agent**. It does not do the research itself: it reads this file, `TheMasterPlan.md` §7, and open/recently closed PRs (skip anything already in review), then fans out the work below **in parallel** and merges the results into one decision.

| Sub-agent           | Job                                                                                                                                                                        | Reads                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Revenue analyst** | MRR, net MRR, active/new/churned subs, ARPU, top-up share, trial → paid, failed payments, refunds, Stripe fees. Compares to the last entry in §4.                          | Stripe connector (read), `scripts/finance-report.mts`, `metrics-report.mts`                              |
| **Cost analyst**    | API spend per vendor and per video, tokens (Anthropic usage), fal.ai seconds/images, ElevenLabs characters, Vercel + Supabase bills. Finds the biggest line.               | `render_jobs.api_cost_usd`, vendor dashboards/invoices, Vercel `list_billing_charges`, Supabase advisors |
| **Vendor scout**    | Finds cheaper/better video, image, TTS, LLM and hosting options (see §3). Output: a table with price per unit, quality notes, how to integrate, risk, source URL and date. | Web search; never trusts one snippet, cross-checks two sources                                           |
| **Pricing analyst** | Re-runs the margin gate on measured costs, checks plan/top-up prices, credit scale, annual plan, overage and trial burn. Proposes changes with before/after multiples.     | `scripts/margin-report.mts`, `config/plans.ts`, `config/models.ts`                                       |
| **Growth-to-cash**  | Monetisation ideas that raise revenue per user: annual discount, credit packs, add-ons, referral, upsell moments in the product. Ranked by expected € per week of work.    | The product, competitors' pricing pages                                                                  |
| **Implementer**     | Takes the master's chosen item and ships it as a small PR with tests (adapter swap, price table, report change). Runs format, lint, typecheck, tests.                      | The repo                                                                                                 |

Master's rules: (1) pick **one** highest cash-impact item per run, quantified in €/month; (2) prefer cost cuts that don't touch what customers see, then pricing, then new revenue; (3) anything uncertain becomes a measurement task, not a guess (§7 in the master plan says why); (4) log the numbers in §4 even on days with no PR; (5) end every run with a digest, and send a notification only when something needs Tudor (see §6).

## 3. Cost hunting: where the money goes

Known lines, biggest first (from `config/models.ts`, list prices, **not yet measured**):

1. **Premium AI video** (fal.ai, Kling 2.5 Turbo Pro, ~$0.07/billed second, 5 s minimum clips, ~$0.12/s assumed). Everything else in a Standard video costs cents.
2. Script writer (Anthropic, ~$0.04/video), ElevenLabs voice (~$0.00075/s), FLUX images ($0.003–0.025), in-house ffmpeg (~$0.01), Vercel and Supabase fixed plans, Stripe fees (1.5% + €0.25 per payment).

Ideas for the scout to price and test (candidates, unverified; prices change monthly):

- **Video:** other image-to-video models on fal.ai (Wan 2.x, LTX-2, Seedance, Hailuo), the same models through other hosts (Replicate, Runware, WaveSpeed, Together, DeepInfra), or self-hosted open models on per-second GPU (Modal, RunPod). Test hero-shot only (AI clip on scene 1, stills for the rest), 3 s clips instead of 5 s, lower resolution, and clip caching/reuse for repeated themes.
- **Images:** same FLUX models on cheaper hosts; batch/cached prompts.
- **LLM:** Haiku-class model for scripts if quality holds (A/B on a fixed prompt set), prompt caching, shorter outputs. Count tokens per video from the Anthropic usage API.
- **Voice:** compare ElevenLabs Flash against cheaper TTS (Cartesia, Kokoro/open models) on quality; keep ElevenLabs only for designed voices.
- **Money in:** annual plans at ~2 months free (cash up front), top-up nudges when credits run out, Stripe Tax and local payment methods only if fees stay under the gain.

Rule for any swap: build it behind the provider registry as a new adapter, run `scripts/live-providers-smoke.mts` to **measure** real cost per scene, update `costUsdPerUnit` from the measurement, and keep the old adapter as a fallback. Report the saving in € per 1,000 videos.

## 4. Metrics log (newest on top; the routine appends a row every run)

Source: `npx tsx scripts/finance-report.mts` plus Stripe and vendor dashboards. `n/a` until the data exists.

| Date       | Paying subs | MRR gross (EUR) | MRR net (USD) | API 30d (USD) | Videos 30d | Cost / video | MRR ÷ API | Gross margin | Notes                           |
| ---------- | ----------- | --------------- | ------------- | ------------- | ---------- | ------------ | --------- | ------------ | ------------------------------- |
| 2026-10-16 | n/a         | n/a             | n/a           | n/a           | n/a        | n/a          | n/a       | n/a          | Track created, no data read yet |

## 5. Backlog (ranked by cash impact; the master reorders it)

- [ ] **F1. Measure real cost per video.** Run the live smoke script on fal.ai (needs `FAL_KEY`) for Standard and Premium; replace list prices in `models.ts` with measured ones; re-run the margin gate.
- [ ] **F2. Cheaper premium video.** Price 3 alternatives from §3, build the best as an adapter, measure, switch if it saves 30% or more at equal quality (Tudor judges quality on samples).
- [ ] **F3. Token and spend accounting per vendor.** Record Anthropic input/output tokens and fal.ai seconds per job so the cost analyst reads real numbers, not one `api_cost_usd` total (needs a migration: owner-applied).
- [ ] **F4. Annual plans.** Stripe yearly prices exist in the plan type but are null; propose a discount, show it on `/pricing`.
- [ ] **F5. Top-up and low-credit upsell.** Prompt at the moment credits run out.
- [ ] **F6. Fixed-cost review.** Vercel and Supabase plans vs usage; cut anything unused.

## 6. When to notify Tudor

Send a notification (the routine's push) only for: net MRR falling week over week, gross margin below 70%, margin gate failing on measured costs, a vendor price rise above 20%, a payment-failure spike, a finding that needs a decision or a secret, or the routine being unable to read its data. Quiet runs send nothing.

## 7. Access and setup needed (owner checklist)

The routine runs with whatever the cloud environment gives it. To work at full strength:

1. **Repo:** GitHub access to `TudorFnsn/Shortcraft` (already scoped to the session).
2. **Connectors** (claude.ai → Settings → Connectors), read access is enough: **Stripe** (live account once activated; the sandbox shows test data only), **Supabase** (project `iqvrovjwoavvmhaithwn`; the cloud connection failed on 2026-10-16 with `ERR_PROXY_TUNNEL`, so reconnect it or allow `mcp.supabase.com` in the environment's network policy), **Vercel** (billing charges, runtime logs).
3. **Environment variables** in the routine's environment (read-only where the vendor allows): `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` for the report scripts, `ANTHROPIC_ADMIN_KEY` (usage and cost API), and, if available, a read-only/usage key for fal.ai and ElevenLabs. Without them the routine reports "not reachable" and asks, it does not guess.
4. **Network:** allow the vendors' pricing pages and APIs (`fal.ai`, `elevenlabs.io`, `replicate.com`, `runware.ai`, `modal.com`, `api.anthropic.com`, `api.stripe.com`), since the 2026-10-04 run could not open provider pages directly.
5. **Helpful additions:** PostHog or Vercel Analytics for funnel numbers (pricing view → checkout), a Sentry connector for failed-render cost waste, and a Google Sheets/Docs connector if Tudor wants the §4 log mirrored in a sheet.

## 8. Routine prompt (paste into the new cloud routine; model Opus 5.5, 12:00 UTC, PR-gated)

```
You are the Finance CEO of Shortcraft (repo TudorFnsn/Shortcraft). You are the
master agent: you decide and delegate, you do not do every task yourself.

1. Read FinancePlan.md, TheMasterPlan.md (§7, §8, §9) and AGENTS.md. Next.js here
   has breaking changes: read node_modules/next/dist/docs before writing code.
2. List open and recently closed PRs. Anything with an open PR is in review; do
   not duplicate it.
3. Fan out in parallel (Agent tool) the sub-agents of FinancePlan §2: revenue
   analyst, cost analyst, vendor scout, pricing analyst, growth-to-cash. Give each
   a narrow brief and the files to read. Require sources and dates for every price.
4. From their results pick ONE highest cash-impact item (EUR per month), prefer
   cost cuts that customers do not see. Hand it to an implementer sub-agent or do
   it yourself. Branch ceo-finance/<slug>. Run format:check, lint, typecheck,
   test; the margin gate must still pass. Open a PR. Never merge. No live secrets,
   no Stripe or production writes without the owner's OK.
5. Append a row to FinancePlan §4 and a line to the changelog every run, even
   when there is no PR. Update TheMasterPlan §10 if you changed pricing or costs.
6. Notify (PushNotification, inside <routine_summary>) only per FinancePlan §6.
   If you cannot read a data source, say which and what access you need.
```

## 9. Changelog (newest on top)

- **2026-10-16** — Finance track created: this plan, `features/finance/unit-economics.ts` (MRR, 30-day API spend, cost per video, gross margin; pure, tested), and `scripts/finance-report.mts` (read-only). No runtime change. (Interactive setup)
