# FinancePlan — Shortcraft unit economics & cash return

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on cost structure, pricing proposals and vendor choices. Every finance PR
> updates the scorecard (§4) and changelog (§8) in the same change.
>
> Created: 2026-10-14

---

## 1. Charter

**Goal: maximise cash return.** In order: (1) keep gross margin ≥ the 3x gate on
every plan and top-up, (2) grow MRR, (3) cut cost per finished video without
hurting quality, (4) cut fixed costs, (5) raise ARPU and cut churn.

| Question             | Rule                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomy             | **PR-gated**, like the CEO routines. Branches `ceo-finance/<slug>`, never merge. Reports and proposals are free; code changes need a PR.                                                          |
| Hard stops           | Never change live Stripe prices/products, never touch live secrets, never switch a production provider, never run a write on Supabase/Stripe without the owner's explicit OK (master plan §9 rule). |
| Pricing changes      | Proposed with numbers (before/after margin multiple, effect on plan value to the customer). The owner approves; only then a PR edits `config/plans.ts` / `config/models.ts`.                     |
| Vendor swaps         | A swap needs **measured** quality + cost on the same prompts (the adapter layer makes it one row + one adapter). Price-list numbers alone are not enough to switch.                               |
| Files owned          | `FinancePlan.md`, `scripts/finance-*`, `src/features/billing/margin.ts`, `src/config/models.ts` (cost fields), new provider adapters. UI files belong to the Design CEO.                          |
| Collision rule       | List open + recently closed PRs first. Skip anything with an open PR. Leave `ceo-design/*` files alone.                                                                                           |
| Cadence              | Daily cloud routine **"Shortcraft Finance CFO"**, 12:00 UTC (after the CEO at 06:00 and Design at 09:00). Weekly deep review on Mondays.                                                         |
| Notify the owner     | Only when something needs them: margin gate fails, MRR drops week-on-week, a vendor cost jumps >20%, a cheaper vendor passed quality testing, or the routine could not reach its data.            |

---

## 2. Data the routine reads (access checklist)

| Need                                   | Source                                                                                  | Status (2026-10-14)                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Code, PRs, plan files                  | GitHub MCP (`TudorFnsn/Shortcraft`)                                                     | ✅ in scope                                                                           |
| MRR, subs, churn, refunds, fees        | **Stripe connector** (`stripe_analytics`, `stripe_api_read`) — test mode only so far    | ✅ connected, ⚠️ sandbox only → live numbers need a restricted live key (read-only)   |
| Per-job metered cost, credits, tiers   | Supabase `render_jobs.api_cost_usd`, `credit_transactions` via `scripts/finance-report.mts` or the Supabase connector | ⚠️ connector failed from the cloud session on 2026-10-14 (proxy tunnel); needs retry/`.mcp.json` auth |
| Hosting spend, bandwidth, functions    | **Vercel connector** (`list_billing_charges`, usage tools)                              | ✅ connected                                                                          |
| Vendor invoices: fal.ai, ElevenLabs, Anthropic, Supabase, Resend | Dashboards; **no connector**. Owner pastes monthly totals into §3 (or exports CSVs to Drive) | ❌ manual — see §6                                                                    |
| Competitor / vendor prices             | WebSearch, **Firecrawl connector** (installed, toggle on for routines)                  | ✅ available, ⚠️ enable in the routine's connector list                               |
| Funnel (visit → signup → paid)         | PostHog (not wired yet, master plan Phase 3)                                            | ❌ pending                                                                            |

If a source is unreachable, the routine says so in its digest (and notifies) instead of guessing.

---

## 3. Cost ledger (fill monthly; the routine proposes updates, owner confirms)

| Line                    | Type     | Monthly USD | Source / note                                           |
| ----------------------- | -------- | ----------- | ------------------------------------------------------- |
| fal.ai (images, Premium video) | variable | _measured_  | `api_cost_usd` for `fal:*` steps; invoice to reconcile  |
| ElevenLabs (voice, voice design slots) | mixed | _owner_ | plan fee + characters; custom-voice slot cap is a fixed-cost step |
| Anthropic (script)      | variable | _measured_  | ~$0.04/script assumed (Sonnet 5.5)                      |
| Supabase                | fixed    | _owner_     | plan + storage + egress (private `media` bucket grows)  |
| Vercel                  | fixed    | _connector_ | ffmpeg renders run in functions — watch duration/GB-hrs |
| Resend, Sentry, domain  | fixed    | _owner_     |                                                         |
| Stripe fees             | variable | _connector_ | ~1.5% + €0.25 EU cards; 3.25% + fee for non-EU/FX       |

Per-video cost (from the catalog today): 15s Standard ≈ **$0.07**; 15s Premium ≈ **$1.10** (Kling 2.5 Turbo Pro, unmeasured); hero-shot Premium ≈ **$0.45**.

---

## 4. Scorecard (the routine overwrites this each run)

| Metric                                   | Value | Date | Target                     |
| ---------------------------------------- | ----- | ---- | -------------------------- |
| MRR (EUR) / paying subscribers           | n/a — no live data yet | | grow ≥ 10% w/w once live |
| Gross margin multiple (worst case, gate) | Starter 9.4x · Pro 3.00x · Ultra 3.23x | 2026-10-05 | ≥ 3x each |
| Metered API cost ÷ MRR                   | n/a   |      | ≤ 0.25                     |
| Cost per finished Standard / Premium video | n/a (unmeasured) |  | ≤ $0.10 / ≤ $0.60          |
| Trial burn per signup                    | ~$0.23 (catalog) | 2026-10-13 | ≤ $0.25 |
| Fixed costs per month                    | n/a   |      | < 15% of MRR               |
| Payback on paid acquisition              | n/a   |      | < 1 month of revenue       |

---

## 5. Architecture of the routine (DM master + specialists)

The routine's **master agent** (the "DM") reads this file, the open PR list and the
data, picks the day's biggest cash lever, and fans work out to specialist
sub-agents in parallel (Agent tool, `general-purpose`/`Explore`), then merges
their findings. Sub-agents get a narrow brief and return a short report; the
master decides, writes the PR and the digest.

| Specialist          | Job                                                                                                                                                                                      | Output                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Revenue analyst** | MRR, new/expansion/churned MRR, ARPU, trial→paid, refunds, failed payments (Stripe), plan mix. Runs `scripts/finance-report.mts --json`.                                                 | MRR bridge + anomalies                 |
| **Cost auditor**    | Tokens/chars/seconds consumed vs dollars: Anthropic tokens per script, ElevenLabs chars per video, fal image/video seconds, ffmpeg function time, storage/egress. Compares `api_cost_usd` to vendor invoices. | Cost per video by step; drift vs catalog |
| **Vendor scout**    | Cheaper/better alternatives per slot: image (FLUX variants, Runware, Together, Replicate, local), video (Kling, Wan, LTX, Seedance, Hailuo, Veo Fast), TTS (ElevenLabs Flash, Cartesia, Deepgram Aura, OpenAI TTS, Kokoro self-host), LLM (Haiku-class for scripts), render/hosting. Uses WebSearch + Firecrawl. | Ranked shortlist with $/unit and sources |
| **Quality gate**    | For a shortlisted vendor: writes/updates a smoke script that renders the same 3 prompts on old vs new and records cost, latency and a human-review sheet. Never switches production.       | `scripts/*-compare.mts` + review pack  |
| **Pricing strategist** | Margin gate re-run on new costs; proposes plan/top-up/credit changes, annual plan discount, upgrade nudges, paid-trial vs free-trial, win-back, overage packs. Models churn/ARPU effect. | Proposal with before/after table       |
| **Infra optimiser** | Vercel function duration, bandwidth, Supabase storage retention (delete intermediate clips/images after N days), caching, cron frequency, Resend volume.                                  | Savings list, small PRs                |
| **Reviewer**        | Adversarially checks the master's numbers and PR diff (arithmetic, units, EUR vs USD, VAT/fees).                                                                                          | Pass / fix list                        |

### Run loop

1. Read `TheMasterPlan.md` §7–§9 and this file. List open + recently closed PRs (skip anything in review).
2. Check data access (§2). Missing source → note it, notify if it blocks the run.
3. Fan out the specialists that matter today (always Revenue + Cost; others by need). Monday: all.
4. Update §3/§4 with measured numbers. Compute margin gate (`npx tsx scripts/margin-report.mts`).
5. Pick **one** lever: the change with the largest monthly € effect per hour of work. Open a PR if it's code/config in scope; else write a proposal into §7.
6. Tests/CI must pass (`npm run format:check && npm run lint && npm run typecheck && npm test`).
7. Digest + notification rules per §1.

---

## 6. Connectors, tools and add-ons that would help

Already connected: **Stripe**, **Supabase**, **Vercel**, **Firecrawl**, GitHub.

Suggested, in priority order:

1. **Stripe — live, restricted read-only key** (or switch the connector to the live account when go-live happens). Without it MRR is sandbox data.
2. **Supabase connector reliability** — the cloud session failed to dial `mcp.supabase.com` on 2026-10-14. Fallback: the routine runs `scripts/finance-report.mts`, which needs `SUPABASE_SERVICE_ROLE_KEY` as a routine environment variable (read-only use; the script only selects). Prefer a dedicated read-only Postgres role if you want least privilege.
3. **Google Drive or Gmail connector** — to read vendor invoices/receipts (fal.ai, ElevenLabs, Anthropic, Resend) so the cost ledger reconciles without manual pasting. Drive: have invoices forwarded into one folder.
4. **Vendor usage APIs as routine env vars** (all read-only/admin-read): Anthropic Admin API usage & cost report, ElevenLabs `/v1/user/subscription` (character quota), fal.ai usage/billing endpoint. Gives tokens/chars/seconds consumed vs spend per day without invoices.
5. **PostHog** (already in Phase 3) — CAC and funnel conversion for paid-acquisition math.
6. **Sentry / Vercel Observability** — correlate render failures (refunded cost with no revenue) with spend.
7. Optional: **Google Sheets** for a live P&L sheet the owner can eyeball; **Slack/email** for digests if the push notification isn't enough.

---

## 7. Hypotheses and opportunity backlog (the routine validates, re-ranks, retires)

Ordered by expected cash effect. None is proven — all are leads to measure.

1. **Premium AI video is the cost cliff.** Hero-shot variant (AI clip on scene 1 only, ~$0.45 vs ~$1.10) and routing to cheaper image-to-video models (Wan 2.x, LTX-2, Seedance Lite, Hailuo) could cut Premium cost 40–70%. Needs the quality gate.
2. **fal.ai alternatives for stills.** Standard images cost $0.003 — already near floor; compare only for quality. Premium images (FLUX dev $0.025/MP) vs FLUX schnell + upscale, Runware, or Together.
3. **TTS cost per video.** ElevenLabs Flash ≈ $0.05/1k chars (plan-based, with slot caps). Compare Cartesia, Deepgram Aura-2, OpenAI TTS, or self-hosted Kokoro for the Standard tier; keep ElevenLabs for designed voices.
4. **Script LLM.** A Haiku-class model with structured output may cost a fraction of Sonnet 5.5 at equal quality; use prompt caching for the fixed system prompt. Measure tokens per script first.
5. **Storage/egress.** Intermediate images/clips/audio kept forever in Supabase Storage; add retention (e.g. delete scene assets 30 days after a job finishes, keep the final MP4). Check `media` bucket size.
6. **Revenue levers.** Annual plans (cash up front, ~2 months free), a cheap "pay-as-you-go" pack for non-subscribers, upgrade prompts at 80% credit use, win-back email for lapsed subs (lifecycle email exists), referral credits (cost = marginal API cost only), a hard cap on trial abuse (one trial per card/device/email domain).
7. **Break-even view.** Fixed cost ÷ gross profit per subscriber = subscribers needed to break even; report it every Monday.
8. **Stripe fees.** Check card-region mix; consider SEPA debit for EU (cheaper) and avoiding currency conversion.

---

## 8. Changelog (newest on top)

- **2026-10-14** — Finance track created: this plan, `scripts/finance-report.mts` (read-only MRR + metered cost per tier), routine prompt in `docs/routines/finance-cfo.md`. (interactive)
