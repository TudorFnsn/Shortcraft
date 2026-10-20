# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine. It sits under
> `TheMasterPlan.md` (which wins on product and priority; this file wins on cost, pricing and
> cash). Every finance PR updates this file (metrics log + backlog + changelog) in the same change.
>
> Last updated: 2026-10-20 (routine defined, first research pass)

---

## 1. Charter (owner-configured 2026-10-20, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit, cash return first.** Watch MRR against every cost; find ideas, models and tools that monetise better and cost less.                                                                                            |
| Scope     | Provider costs (fal.ai, ElevenLabs, Anthropic), hosting (Vercel, Supabase), email, Sentry, Stripe fees, tax, pricing, plans, credits, top-ups, conversion, churn.                                                                |
| Autonomy  | **Measure and propose freely; implement PR-gated.** Branches `ceo-finance/<slug>`; never merge. Anything that changes what a customer pays, a live provider, a Stripe object or a vendor contract is a proposal for Tudor first. |
| Structure | A **master agent** reads this file, runs the report, and splits the work across parallel sub-agents (§4). It does not do their research itself.                                                                                  |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**. Suggested 07:00 UTC, after the main CEO (06:00) and before the Design CEO (09:00).                                                                                             |

### Principles

1. **Cash beats vanity.** Rank every idea by _€ of monthly profit per hour of work_, with the evidence next to it.
2. **Measure before you cut.** List prices disagree by up to 2x between sources (TheMasterPlan §7). A model swap needs a measured cost per finished video from `render_jobs.api_cost_usd`, not a blog table.
3. **Quality is revenue.** A cheaper model that raises render failures or lowers retention loses money. Compare on cost per _delivered_ video and on failure rate.
4. **The margin gate stays closed.** `npx tsx scripts/margin-report.mts` must still PASS (≥3x worst case) after any pricing or model change. Pro is at exactly 3.0x today.
5. **No new recurring cost without payback.** Any paid tool or plan is proposed with its monthly cost and the profit it must create.

---

## 2. Instruments (what the routine reads)

| Instrument                                    | What it gives                                                                                                                                   | Status                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `npx tsx scripts/finance-report.mts [--json]` | MRR gross/net, top-up revenue, 30-day API spend, cost per delivered video by tier, wasted spend on failed jobs, fixed costs, profit, cost ratio | New (this PR). Needs `.env.local` service role.    |
| `npx tsx scripts/margin-report.mts`           | Worst-case margin multiple per plan/top-up                                                                                                      | Exists                                             |
| `npx tsx scripts/metrics-report.mts`          | North star, activation, trial→paid, failure rate                                                                                                | Exists                                             |
| `src/config/fixed-costs.ts`                   | Owner-entered monthly fixed costs                                                                                                               | **All `null`: Tudor must fill in**                 |
| Stripe connector                              | Real MRR, churn, refunds, fees, payouts                                                                                                         | **Needs reconnect** (claude.ai connector settings) |
| Supabase connector                            | Same data as the scripts, via SQL (read-only)                                                                                                   | Connected                                          |
| Vercel connector                              | `list_billing_charges`, usage, contract commitments, runtime logs                                                                               | Connected                                          |
| Firecrawl connector                           | Reads vendor pricing pages the sandbox network blocks                                                                                           | Connected, but toggled off for chats: enable it    |

**Gap that matters most:** the DB stores one number per job (`api_cost_usd`), not per provider and not tokens. Token counts for the script step and characters for the voice step are not saved, so "tokens vs spend" can only be estimated today. First backlog item (F1) fixes that.

---

## 3. Cost model (known, 2026-10-20)

Per finished video, from `config/models.ts` list prices (not yet measured on real calls):

| Item                                             | Standard (animated stills) | Premium (AI video)                                 |
| ------------------------------------------------ | -------------------------- | -------------------------------------------------- |
| Script (Claude Sonnet 5.5, ~2k in / 1.5k out)    | ~$0.04 flat                | same                                               |
| Images (FLUX schnell $0.003 / dev $0.025 per MP) | ~$0.015 for 5 scenes       | ~$0.125                                            |
| Video clips                                      | $0 (Ken Burns, own ffmpeg) | ~$0.35 per 5s scene (Kling 2.5 Turbo Pro ~$0.07/s) |
| Voice (ElevenLabs Flash ~$0.05 / 1k chars)       | ~$0.01                     | same                                               |
| Render (own ffmpeg on Vercel)                    | ~$0.01 + function time     | same                                               |
| **15s total**                                    | **~$0.07**                 | **~$1.10 (hero-shot only: ~$0.45)**                |

Fixed: Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domain, Claude subscription (amounts unknown: §2).

Net revenue per sale = price ÷ (1 + 20% VAT) − (1.5% + €0.25) Stripe fees (EU assumption in `margin.ts`; the owner's real Stripe fee tier and VAT/OSS position should replace it).

---

## 4. How the routine works (master + sub-agents)

The master agent never does the deep research itself. It runs the instruments, then launches these sub-agents **in one message, in parallel**, each with a narrow brief, the numbers it needs and "report in ≤300 words with sources and a confidence level":

| Sub-agent                                                   | Question                                                                                                                                                                                       | Output                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Auditor**                                                 | What did the last 30 days cost and earn? Which tier, step or failure mode leaks money? Is the gate still PASS?                                                                                 | Table + top 3 leaks with € per month                                                         |
| **Provider scout (video + image)**                          | Cheaper/better image and image-to-video models and hosts than fal.ai (direct APIs, WaveSpeed, Runware, Replicate, Atlas, DeepInfra, self-hosted GPU on Modal/RunPod/Vast) at the same quality. | Candidates with $/s or $/MP, quality notes, switch effort (adapter = 1 file + 1 catalog row) |
| **Provider scout (voice + LLM)**                            | Cheaper TTS (Deepgram Aura-2, Google, Cartesia, self-hosted open models) and script LLM options (Haiku-class, prompt caching, batch API, shorter prompts).                                     | Same format                                                                                  |
| **Infra auditor**                                           | Vercel/Supabase/Sentry/Resend bills and waste (function duration, bandwidth, storage retention of old MP4s, egress, cron cost).                                                                | Savings list with the change that gets each                                                  |
| **Revenue strategist**                                      | Pricing and packaging: annual plans, top-up pricing, credit expiry, trial size (3,000 credits costs ~$0.14), upgrade nudges, referral, affiliates, churn saves, payment-failure recovery.      | Experiments ranked by profit per hour                                                        |
| **Implementer** (only when a PR-sized, safe item is picked) | Build it with tests on a `ceo-finance/<slug>` branch.                                                                                                                                          | PR                                                                                           |

The master then picks **one** item for the day (same rule as the CEO routine: **list open and recently closed PRs first; an item with an open PR is in review, not available**), updates §5 and §6, and reports a digest.

### Hard rules

- Never merge. Never touch live secrets, Stripe live mode, vendor accounts or customer prices without Tudor's explicit OK. Read-only SQL and Stripe reads are fine.
- A model/provider switch ships behind the existing provider registry and an env/catalog flag, with the old adapter kept, so it can be rolled back by config.
- Leave UI files alone while a `ceo-design/*` PR is open; money changes that need UI copy go in a separate small PR.
- If the instruments cannot run (no DB access, connector down), say so in the digest and **notify**; do not guess numbers.
- **Notify** (PushNotification) only when it matters: gate flipped to FAIL, cost ratio ≥ 1 (losing money), a cost spike > 30% week over week, a failed-job spend leak, a connector or access problem, or a PR/decision waiting on Tudor. Quiet days stay quiet.

---

## 5. Metrics log (append newest on top; paste `finance-report --json` highlights)

| Date               | Net revenue 30d                                   | API cost 30d                                                       | Fixed   | Profit | Cost ratio       | Notes                                                                                                                                  |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------ | ------- | ------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-20         | ~$52 (2 Pro subs, list-price estimate, no Stripe) | $8.19 (15 done jobs, ~$0.55 avg; 18 jobs, 0 prior-period baseline) | unknown | n/a    | ~0.16 (API only) | Via Supabase connector (script's network is blocked). Failed jobs 3, $0.00 wasted. Gate PASS (Pro 3.00x). 6 users, no top-ups checked. |
| 2026-10-20 (setup) | not measured                                      | not measured                                                       | unknown | n/a    | n/a              | No DB or Stripe access in the setup session. First run of `finance-report` fills this.                                                 |

---

## 6. Backlog (ranked by profit per hour; the routine reorders it with evidence)

| #   | Item                                                                                                                                                                                      | Why / evidence                                                                                                                       | Needs Tudor?      | Status       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------ |
| F1  | **Record cost per step** (migration: `render_jobs.cost_breakdown jsonb` with script in/out tokens, TTS chars, image count, clip seconds, per-provider USD)                                | Tokens-vs-spend and every provider comparison need it; today one number per job                                                      | Applies migration | Open         |
| F2  | Fill `fixed-costs.ts` and reconnect Stripe                                                                                                                                                | Without them profit and real MRR are unknown                                                                                         | **Yes**           | Open         |
| F3  | Measure real cost per finished video (run `live-providers-smoke.mts` with keys), then update `costUsdPerUnit`                                                                             | Margin gate runs on list prices that disagree 2x                                                                                     | Keys              | Open         |
| F4  | **Premium hero-shot variant** (AI clip on scene 1, stills elsewhere): ~$0.45 vs ~$1.10 per 15s                                                                                            | TheMasterPlan §7; makes a premium tier priceable near Standard                                                                       | Pricing OK        | Open         |
| F5  | **Video model scout**: Kling 2.5 Turbo Pro ($0.07/s on fal) vs Seedance 2.0 Fast (~$0.09/s direct, resellers lower), Kling V3 Turbo (~$0.095/s Atlas), LTX-2 (per-pixel), self-hosted Wan | Reported prices conflict by up to 3x between vendor pages; needs Firecrawl on the real pricing pages and a quality A/B on 10 prompts | No                | Open         |
| F6  | **TTS scout**: ElevenLabs Flash ~$0.05/1k chars (v4 ~$0.08) vs Deepgram Aura-2 ~$0.03, Google WaveNet ~$0.004                                                                             | Voice is ~$0.01 per video, so the win is small; only worth it if voice cost grows (Voice Studio slots are a fixed cost)              | No                | Low priority |
| F7  | Annual plans (2 months free)                                                                                                                                                              | Cash up front, lower churn; needs Stripe prices                                                                                      | **Yes**           | Open         |
| F8  | Storage retention: expire old MP4s (e.g. 30 days for free/trial users)                                                                                                                    | Supabase storage + egress grows with every render                                                                                    | Policy OK         | Open         |
| F9  | Failed-job spend: count and cap retries, check provider billing on failures                                                                                                               | Failed jobs keep their API cost; `finance-report` shows it                                                                           | No                | Open         |
| F10 | Payment-failure recovery (`past_due` emails), cancel-flow save offer                                                                                                                      | Cheapest MRR is the MRR you already have                                                                                             | No                | Open         |

---

## 7. Research notes (search snippets, 2026-10-20; vendor pages disagree, verify before acting)

- Video: fal lists Kling 2.5 Turbo Pro $0.07/s and Kling 3.0 Pro from $0.112/s; one source puts Seedance 2.0 Fast direct from ByteDance near $0.09/s, another lists Seedance 2.0 on fal at $0.30/s; Atlas Cloud lists Kling V3 Turbo from ~$0.095/s and Seedance 2.5 at $0.134/s. fal is the broadest catalog (600+ models, one key); the saving is in picking the cheapest model that is good enough, then re-hosting.
- Voice: Deepgram Aura-2 ~$0.03 per 1k chars, Google WaveNet/Standard ~$0.004, Cartesia ~$0.04–0.05, ElevenLabs Flash ~$0.05, Eleven v4 ~$0.08.
- Sources: fal.ai/learn/tools/best-image-to-video-apis-2026, ask.atlascloud.ai/cheapest-image-to-video-api, techsy.io/en/blog/best-ai-video-providers, apiframe.ai/blog/best-text-to-speech-apis-2026, smallest.ai/blog/best-elevenlabs-alternatives-in-2026-top-tts-tools-compared.

---

## 8. Tools, connectors and add-ons that would make this routine better

1. **Stripe connector (reconnect now):** real MRR, churn, refunds, disputes, fee tier, Sigma SQL for cohorts. The single biggest upgrade.
2. **Firecrawl connector (enable for chats):** reads vendor pricing pages that the routine's network blocks, replacing search snippets with primary sources.
3. **Vercel connector (connected):** `list_billing_charges` and usage give the hosting bill; add a read-only Vercel token note if the routine cannot see the right team.
4. **Supabase connector (connected, flaky from the cloud sandbox):** keep `.mcp.json`; the scripts are the fallback and need `SUPABASE_SERVICE_ROLE_KEY` in the routine's environment.
5. **Provider billing:** fal.ai, ElevenLabs and Anthropic usage dashboards have no connector. Cheapest fix: F1 (log it ourselves). Alternative: a read-only usage/admin API key per vendor in the routine's environment (fal usage API, Anthropic Admin API for token spend, ElevenLabs `/v1/user/subscription`).
6. **Optional:** Google Sheets/Drive connector for a human-readable monthly P&L; a cost observability layer (Helicone or Langfuse) for LLM token tracking if script spend grows; PostHog for funnel conversion.

## 9. Open questions for Tudor

1. Monthly bills: Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domain, Claude (fill `src/config/fixed-costs.ts`).
2. Is Stripe live yet? Reconnect the Stripe connector; which Stripe fee tier and VAT/OSS setup apply?
3. May the routine apply migration F1 (after your OK), and may it open pricing-change PRs (annual plan, top-up repricing)?
4. Routine environment needs `SUPABASE_SERVICE_ROLE_KEY` (and `NEXT_PUBLIC_SUPABASE_URL`) to run the scripts; set them in the routine's cloud environment, not in the repo.
5. Quality bar for a cheaper model: who approves the A/B (you, or a rubric the routine applies)?

## 10. Routine prompt (paste into a new claude.ai routine)

```
You are the Shortcraft Finance CEO, the master agent of the money track. Repo: TudorFnsn/Shortcraft.
Read FinancePlan.md (charter, rules, backlog), TheMasterPlan.md §7-§9, and AGENTS.md (this Next.js has breaking changes; read node_modules/next/dist/docs before touching app code).

1. Run `npm ci`, then `npx tsx scripts/finance-report.mts --json`, `npx tsx scripts/margin-report.mts`, `npx tsx scripts/metrics-report.mts --json`. If a DB read fails, try the Supabase connector (read-only SQL); if Stripe is connected, read MRR/churn/refunds/fees from it. If nothing works, say so and notify.
2. List open and recently closed PRs; skip backlog items that already have one.
3. Launch the sub-agents of FinancePlan.md §4 in ONE message, in parallel (Auditor, both Provider scouts, Infra auditor, Revenue strategist), each with a narrow brief and the numbers it needs. Use Firecrawl for vendor pricing pages when enabled.
4. Pick the single highest profit-per-hour item. If it is PR-sized and safe, implement it with tests on branch ceo-finance/<slug> and open a PR (checks green: format:check, lint, typecheck, test). Otherwise write the proposal in FinancePlan.md for Tudor.
5. Update FinancePlan.md (§5 metrics row, §6 backlog, changelog) and TheMasterPlan.md changelog in the same change. Never merge; never touch live secrets, Stripe live mode, vendor accounts or customer prices without Tudor's explicit OK.
6. Notify (PushNotification, <routine_summary>) ONLY for: gate FAIL, cost ratio >= 1, cost spike > 30%, wasted-spend leak, access/connector problems, or a decision waiting on Tudor. Lead with the one sentence that matters. Otherwise stay silent.
```

## 11. Changelog (newest on top)

- **2026-10-20** — First live numbers via Supabase connector: 2 active Pro subs, $8.19 API cost over 30d (15 done, 3 failed at $0), gate PASS. `finance-report.mts` fails here with `fetch failed` (sandbox proxy blocks Supabase REST); use the connector. Stripe still unauthorized. No backlog item started (F1 needs migration OK, F2 needs Tudor). (Finance CEO)

- **2026-10-20** — Finance track started: this plan, `features/finance/unit-economics.ts` (+5 tests), `scripts/finance-report.mts`, `config/fixed-costs.ts`. No DB access from the setup session, so no live numbers yet. (Finance CEO, setup)
