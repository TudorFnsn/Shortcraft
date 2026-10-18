# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine
> (a DM-style master agent that splits work across specialist agents). It sits
> under `TheMasterPlan.md`: the master plan wins on product and priority; this
> file wins on pricing, cost and cash. Every finance PR updates this file
> (ledger, roadmap, changelog) in the same change.
>
> Last updated: 2026-10-18 (charter written, routine not yet registered)

---

## 1. Charter (from the owner, 2026-10-18)

**Goal:** maximise profit and cash return. Every run checks the MRR picture,
then proposes or implements changes that monetise the app better, and hunts for
cheaper or better providers (the owner thinks fal.ai video is expensive).

| Question   | Answer                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Priority   | **Cash return first**, then margin, then growth of MRR. A saving that costs retention is not a saving.                                          |
| Autonomy   | **PR-gated**, same as the other routines: branches `ceo-finance/<slug>`, never merges, never touches live secrets or live Stripe.                 |
| Cadence    | Daily cloud routine "Shortcraft Finance CEO", **12:00 UTC** (after the main CEO at 06:00 and the Design CEO at 09:00). Weekly deep dive on Mondays. |
| Scope      | Pricing and plans, unit economics per video, provider cost and swaps, hosting and SaaS bills, churn and trial economics, upsell and top-up flow.   |
| Off limits | Changing a live Stripe price, refunding, or switching a production provider without the owner's OK. Proposals only; the PR carries the evidence.   |

## 2. The numbers the routine must produce every run

1. **MRR bridge:** new + expansion − contraction − churn = net new MRR. Active paying subscribers, ARPU, trial → paid, logo and revenue churn.
2. **Unit economics per video:** revenue earned (credits burned × net € per credit) against `render_jobs.api_cost_usd`, split by tier (Standard vs Premium), length and plan. Cost per finished video by line: script (tokens in/out), images, AI video seconds, voice characters, render compute.
3. **Fixed and semi-fixed bills:** Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domain, Stripe fees, anything else on a card. Total monthly burn and months of runway at current cash.
4. **Margin gate:** `npx tsx scripts/margin-report.mts` (must pass; the gate is 3x worst case). Plus _realised_ margin from real jobs, which the gate cannot see.
5. **Leaks:** failed renders that still cost money (provider charged, job refunded), trial burn per signup vs conversion, unused-credit liability, refunds and disputes.

Headline line for the digest: `MRR €x (Δ), burn €y, net €z/mo, realised margin n%, cost/video $c, top lever: …`.

## 3. Agent roster (master agent splits work)

The master agent reads this file, `TheMasterPlan.md` §7 and the last digest, then
fans out only the specialists the day needs (parallel `Agent` calls, each with a
narrow brief and an explicit output format). It merges results, picks **one**
highest-return item, and ships it as a PR. Do not spawn all five every day.

| Agent                | Job                                                                                                                                                                       | Reads                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Revenue analyst**  | MRR bridge, churn, trial → paid, cohort revenue, top-up behaviour. Flags plans with low revenue per credit.                                                              | Stripe (read), `scripts/metrics-report.mts`, Supabase `subscriptions` |
| **Cost auditor**     | Real cost per video from `render_jobs.api_cost_usd` and provider usage APIs; compares with `costUsdPerUnit` in `src/config/models.ts` and reports drift.                 | Supabase (read), provider usage APIs, `margin.ts`                  |
| **Provider scout**   | Finds cheaper or better models/vendors per slot (video, image, voice, script, render) and fresh tech. Quotes list prices with source URL and date; never guesses.          | Web, provider docs, `FinancePlan.md` §5 watchlist                  |
| **Pricing strategist** | Plan/top-up/credit-scale proposals, annual plan, trial size, paywall placement, upsell triggers, regional pricing. Models each change against the margin gate.            | Analyst outputs, `config/plans.ts`, `margin.ts`                    |
| **Implementer**      | Builds the chosen change on `ceo-finance/<slug>` (new adapter behind `ProviderRegistry`, catalog row, config or script) and runs the full bar. One PR per run.            | Repo                                                               |

## 4. Roadmap (top unchecked item, not already in an open `ceo-finance/*` PR)

- [ ] **F0 Access check.** Verify and report which of §6 is reachable; list gaps in the digest. No code.
- [ ] **F1 Cost ledger.** Persist per-step provider usage (provider, model, units, tokens, USD, job id) in a new `provider_usage` table (migration, owner applies) and write it from each adapter. `api_cost_usd` today is one number per job; this makes cost by line auditable and lets drift against list prices be measured.
- [ ] **F2 `scripts/finance-report.mts`.** Read-only: MRR bridge from Stripe, realised margin and cost/video from Supabase, fixed bills from a checked-in `config/vendors.ts` (name, monthly €, renewal date). `--json` for the digest. Pure math in `features/finance/` with tests.
- [ ] **F3 Premium video cost.** Benchmark Kling 2.5 Turbo (current) against cheaper image-to-video options on the same 10 scene prompts: cost/s, clip quality, failure rate, latency. Candidates to price (verify, do not trust this list): LTX-Video / LTX-2 Fast, Wan 2.x (fal or Replicate, or self-host on serverless GPU), Hailuo, Seedance, Veo Fast tiers, Runway/Luma. Deliver as a catalog row + adapter behind a flag, plus the evidence table. Owner flips the default.
- [ ] **F4 Cheaper Standard tier extras.** Self-hosted or cheaper image gen (FLUX schnell on Replicate/Together/Runware vs fal), image caching and reuse across scenes, shorter scene counts, `claude-haiku-5-5` for script drafting with Sonnet only on retry (prompt caching on the system prompt). Measure the script cost share first; it may be noise.
- [ ] **F5 Voice cost.** ElevenLabs Flash vs alternatives (Cartesia, Deepgram Aura, OpenAI TTS, Kokoro self-hosted) and the custom-voice slot cost per saved voice. Keep word timings quality (captions depend on it).
- [ ] **F6 Pricing experiments.** Annual plan (2 months free), first-month discount vs trial credits, credit rollover cap, top-up nudge when balance < one video, Premium sold as a separate add-on, win-back email for cancelled subscribers (lifecycle cron exists).
- [ ] **F7 Fixed-bill diet.** Vercel Hobby/Pro fit, Supabase plan fit, Sentry volume, anything idle. Report only; owner cancels.
- [ ] **F8 Weekly finance digest** wired into the weekly digest email or the CEO routine, so numbers land without a person running scripts.

## 5. Watchlist (provider scout seeds; prices unverified until a run quotes a source)

| Slot         | Today                                              | Look at                                                                              |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| AI video     | fal.ai Kling 2.5 Turbo Pro, ~$0.07/billed s, 5s clips | Cheaper fal models, direct vendor APIs (often below the fal resale price), Replicate, self-host Wan/LTX on serverless GPU; fixed-clip waste (bills 5s for a 3s scene) |
| Images       | fal FLUX schnell $0.003/MP, dev $0.025/MP          | Runware, Together, Replicate, fal batch; cache identical prompts                       |
| Voice        | ElevenLabs Flash, ~$0.05/1k chars                  | Cartesia, Deepgram, OpenAI TTS, open-source on a small GPU; keep ElevenLabs for Voice Studio only |
| Script       | Claude Sonnet 5.5, ~$0.04/video                     | Haiku 5.5 + prompt caching, batch API where latency allows                            |
| Render       | in-house ffmpeg on Vercel function                 | Fine at ~$0.01; re-check function GB-seconds once real renders run                     |

Rule for any swap: same 10-prompt benchmark, quality reviewed by the owner on a canvas or clip pack, cost measured on real calls, rollout behind an env flag with the old adapter kept.

## 6. Access the routine needs (and how to get it)

| Need                              | Status (2026-10-18)                              | What to do                                                                                      |
| --------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| GitHub repo (read, branch, PR)    | Connected                                        | none                                                                                            |
| Supabase (read-only SQL)          | **Failed to connect this session** (`ERR_PROXY_TUNNEL`); worked earlier per the master plan | Re-authorise the claude.ai Supabase connector; routine's network policy must allow `mcp.supabase.com`. Give it a **read-only** role |
| Stripe                            | **Needs authorisation**; sandbox account only    | Authorise the Stripe connector. Switch to **live, restricted read-only key** once there are paying users |
| Vercel billing/usage              | Connected (has `list_billing_charges`, `list_contract_commitments`) | none; used for hosting cost                                                                     |
| fal.ai usage and spend            | Not available                                    | Create an **admin/usage-read key**, add as `FAL_ADMIN_KEY` in the routine environment           |
| Anthropic cost                    | Not available                                    | Admin API key (`ANTHROPIC_ADMIN_KEY`) for the usage/cost report endpoints                       |
| ElevenLabs usage and plan         | Not available                                    | The existing key can read subscription/usage; add to routine env (read-only use)                |
| Fixed bills, cash balance         | Not in any system                                | Owner fills `config/vendors.ts` (name, €/month, renewal) and the cash balance in §7 once        |
| Product analytics (funnel)        | None                                             | PostHog connector or export; until then funnel = Supabase signups + jobs                         |
| Web search/fetch                  | Available; provider pages were blocked by the network allowlist before | Add provider domains (fal.ai, replicate.com, runware.ai, together.ai, elevenlabs.io, cartesia.ai, anthropic.com/pricing) to the routine's allowlist |

Helpful Claude add-ons to install for this routine: the **Stripe**, **Supabase** and **Vercel** connectors (already in use), a **PostHog** or **Plausible** connector for funnel data, a **Google Sheets** connector if the owner keeps bills in a sheet, and the `xlsx` skill if monthly reports should be exported. Optional: Slack/Gmail connector so the digest reaches the owner beyond push.

## 7. Ledger (owner-maintained inputs; the routine updates the rest)

| Item                       | Value            | As of | Source        |
| -------------------------- | ---------------- | ----- | ------------- |
| Cash balance (EUR)         | _owner to fill_  |       | owner         |
| Monthly fixed bills (EUR)  | _owner to fill_  |       | `config/vendors.ts` |
| Paying subscribers         | 0 (pre-launch, sandbox) | 2026-10-18 | metrics-report |
| MRR (EUR)                  | 0                | 2026-10-18 | Stripe        |
| Realised margin            | not measured (no real jobs billed) |  |               |
| Modelled worst-case multiple | Starter 5.3x · Pro 3.2x · Ultra 3.4x · top-ups 4.2–6.2x (TheMasterPlan §7, margin gate PASS) | 2026-10-05 | `margin.ts` |

Baseline facts already known: Standard video ≈ $0.07 for 15s; Premium 15s ≈ $2.30 API cost at 27.6k credits (AI video is the dominant cost and the biggest lever); trial burn $0.25 per signup; `costUsdPerUnit` figures are researched list prices, not measured, and can disagree by up to 2x.

## 8. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7, §9, changelog), this file, `git log -20`, open and recent PRs (list them via the GitHub tools; an item with an open PR is in review, not available), then run the access check from §6.
- **Evidence over opinion:** every number cites its source (query, report, URL, date). Prices from search snippets are marked unverified. Never invent a price, cost or revenue figure; write "unknown" and say what would resolve it.
- **One item per run**, top unchecked in §4, unless a leak (§2.5) is actively losing money, which jumps the queue.
- **Money safety:** read-only on Stripe and Supabase. No writes, no migrations applied, no live keys, no refunds. Migrations are written and left for the owner. Never log or print secrets.
- **Files it may change:** `FinancePlan.md`, `src/config/models.ts`, `src/config/plans.ts` and `src/features/billing/margin.ts` (only with the margin gate passing in the same PR), `src/features/providers/**` (new adapters behind a flag, old kept), `src/features/finance/**`, `scripts/finance-report.mts`, `config/vendors.ts`, `supabase/migrations/**` (new files only), tests, and the finance lines of `TheMasterPlan.md`. Leaves UI files to the Design CEO.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode, and `npx tsx scripts/margin-report.mts` passes. A price change that drops any product under 3x does not ship.
- **Do not trade retention for savings:** a cheaper model that lowers output quality is a proposal for the owner with sample clips, not an auto-swap.
- **Notify only on signal:** push the owner when MRR falls week over week, realised margin < 2x, a provider bill spikes > 30% vs trailing 7 days, a cheaper provider is verified at ≥ 30% saving, the access check fails, or a PR needs their decision. A quiet healthy run sends nothing.
- **Output:** digest with the headline line (§2), what moved, PR links, what waits on the owner, next item.

## 9. Routine prompt (paste into the new claude.ai routine)

```
You are the Shortcraft Finance CEO, the master agent of the finance track for
github.com/TudorFnsn/Shortcraft. Read FinancePlan.md, then follow its §8 rules
exactly. Steps: (1) read FinancePlan.md, TheMasterPlan.md §7/§9, git log, open
and recent PRs; (2) run the §6 access check and note gaps; (3) decide which
specialist agents today needs (Revenue analyst, Cost auditor, Provider scout,
Pricing strategist) and run them in parallel with narrow briefs and explicit
output formats; (4) merge their findings into the §2 headline numbers;
(5) pick the single highest-cash-return item from §4 (or a live leak), and have
the Implementer ship it as a PR on ceo-finance/<slug> with the full bar and
the margin gate green; (6) update FinancePlan.md (ledger, roadmap, changelog)
and the finance lines of TheMasterPlan.md in the same PR; (7) PushNotification
only on the §8 signals, with a <routine_summary> that leads with the single most
important sentence. Never merge, never write to Stripe or Supabase, never
print secrets, never invent numbers.
```

Suggested settings: model Opus 5.5 for the master agent, Sonnet 5.5 or Haiku 5.5 for the scout and analyst sub-agents (cheap, parallel), daily 12:00 UTC, environment with the §6 env vars, network allowlist per §6.

## 10. Changelog (newest on top)

- **2026-10-18** — Finance track created: charter, agent roster, roadmap F0–F8, access list and routine prompt. No code changes. The routine itself must be registered at https://claude.ai/code/routines (no routine-creation tool was available to the session that wrote this). (Finance CEO setup)
