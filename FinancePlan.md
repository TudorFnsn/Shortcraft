# FinancePlan — Shortcraft profit track

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md` (which wins on product and priority; §7 there
> holds the pricing and margin-gate history). This file wins on cost, revenue,
> vendor choice and what gets measured. Every finance PR updates this file
> (ledger, backlog, changelog) in the same change.
>
> Last updated: 2026-10-19 (charter created)

---

## 1. Charter (owner-configured 2026-10-19, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit; cash return first.** Raise MRR, raise gross margin per video, cut every avoidable cost (AI vendors, hosting, tooling, fees).                                           |
| Always    | Check the **MRR ratio** (MRR vs total monthly spend) at the start of every run and say whether it moved.                                                                               |
| Look for  | New ideas and fresh tech: cheaper or better video/image/voice/LLM models, new vendors, caching, batching, cheaper hosting, pricing and packaging changes, upsells, annual plans.        |
| Known pain | **fal.ai video looks expensive.** Find cheaper or better options (direct vendor APIs, open-weight models on a GPU host, other aggregators) and prove them on real calls.            |
| Measure   | Tokens and units used per video vs dollars spent per video; hosting and every other recurring payment; what each paying user costs vs pays.                                           |
| Autonomy  | **Analysis + PR-gated code**, same as the other routines. Branches `ceo-finance/<slug>`; never merge. Any write to live systems (Stripe objects, prices, migrations, vendor accounts, live mode) needs Tudor's explicit OK first. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the main CEO 06:00 and the Design CEO 09:00). Weekly deep run on Mondays (full vendor re-scan).                       |
| Quality   | Quality of the product must not drop silently. A cheaper model ships only with a side-by-side sample and Tudor's OK when output quality changes.                                       |

---

## 2. The finance dashboard (every run fills this in)

Read-only inputs, in order of trust:

1. `npx tsx scripts/margin-report.mts` — gate on catalog prices (no secrets).
2. `npx tsx scripts/metrics-report.mts --json` — paying creators, activation, trial → paid, failure rate (needs `.env.local` service role).
3. **Stripe connector** (read-only): active subscriptions, MRR, churn, refunds, fees, failed payments, Sigma if available. _Currently needs authorization, and the account is test mode only (§7)._
4. **Supabase connector** (read-only SQL): `jobs.api_cost_usd`, credits burned (`credit_transactions`), per-model usage, failed/refunded renders.
5. **Vercel connector**: `list_billing_charges`, usage, function duration and invocation counts.
6. Vendor dashboards/invoices the owner pastes into §3 (fal.ai, Anthropic, ElevenLabs, Supabase, Vercel, Resend, Sentry, domain).

Report these numbers each run (mark `n/a` honestly rather than guessing):

| Metric                              | Definition                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| **MRR**                             | Sum of active subscription prices, monthly-normalised, net of discounts (Stripe)        |
| **Monthly spend**                   | All recurring vendor costs + variable API cost last 30 days                             |
| **MRR ratio**                       | MRR ÷ monthly spend (target > 3; < 1 means we burn cash)                                |
| **Gross margin / video**            | Credits charged in USD (net of Stripe fees) − `api_cost_usd`, by quality tier           |
| **Cost / video by step**            | script tokens in/out, images, clip seconds, voice characters, render                    |
| **Fixed monthly cost**              | Hosting, DB, email, monitoring, domain, seats (§3)                                       |
| **Trial burn**                      | API cost of free trial credits per signup, ÷ trial → paid rate = CAC from the free tier |
| **Break-even paying users**         | Fixed cost ÷ average contribution margin per paying user                                |
| **ARPU / churn / payback**          | From Stripe; payback = acquisition cost ÷ monthly contribution margin                   |

---

## 3. Cost ledger (owner fills in actuals; the routine keeps it current)

Costs the repo can see today. Everything marked `?` is a question for Tudor: paste the number or connect the source.

| Line                    | Vendor / plan today                                   | Monthly cost | Source                    | Cheaper path to test                                          |
| ----------------------- | ----------------------------------------------------- | ------------ | ------------------------- | ------------------------------------------------------------- |
| AI video clips          | fal.ai (`FAL_VIDEO_MODEL`, Premium tier only)         | variable     | `jobs.api_cost_usd`       | See §5 V1                                                     |
| AI images (per scene)   | fal.ai image model                                    | variable     | `jobs.api_cost_usd`       | See §5 V2                                                     |
| Script LLM              | Anthropic `claude-sonnet-5-5`, structured JSON        | variable     | `usage` already priced in `anthropic-script.ts` | See §5 V3 (Haiku-class tier, prompt caching) |
| Voiceover               | ElevenLabs (stock + designed voices, custom slots)    | `?` plan     | ElevenLabs invoice        | See §5 V4                                                     |
| Render                  | In-house ffmpeg on Vercel functions                   | in Vercel    | Vercel billing            | Already ~$0.01 per video                                      |
| Hosting                 | Vercel (Hobby, per `TheMasterPlan` decision 2026-10-11) | `?`          | Vercel connector          | Hobby forbids commercial use: confirm plan before real revenue |
| Database / storage / auth | Supabase `ShortCraft` (eu-west-1)                   | `?`          | Supabase dashboard        | Storage egress and retention policy (§5 V6)                   |
| Email                   | Resend (lifecycle emails)                             | `?`          | Resend                    | Free tier until volume                                        |
| Errors                  | Sentry (errors only)                                  | `?`          | Sentry                    | Free tier                                                     |
| Payments                | Stripe fees (≈ 1.5% + €0.25 EU cards; more non-EU)    | % of revenue | Stripe                    | Annual plans cut the per-charge fixed fee                     |
| Tooling                 | Claude Code seats, routines, domain, design tools     | `?`          | Owner                     | —                                                             |

---

## 4. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7 pricing, §8 risks, §9 runbook), then this file, then `git log -20`, open and recent PRs (list through the GitHub connector), `scripts/margin-report.mts` output, and `src/config/models.ts` (the price catalog).
- **Step 1, always:** compute the §2 dashboard, compare with the last row of §7 below, and lead the digest with **MRR, monthly spend and the MRR ratio** plus the change since last run.
- **One item per run:** take the top unchecked item in §5 that is not already in an open `ceo-finance/*` PR. Prefer finishing an open finance PR over a new one. On Mondays also run the vendor re-scan (§6) and add dated findings to §8.
- **Research method:** use WebSearch/WebFetch on vendor pricing pages, model leaderboards and changelogs. Record price, unit, date and URL. Pricing pages that block the routine's network are marked `unverified` (the 2026-10-04 research disagreed by up to 2x between sources). **Never switch a vendor on a web price alone:** add an adapter behind the existing provider interface, run `scripts/live-providers-smoke.mts` style measurement on real calls (needs Tudor to provide a key), and compare cost and quality against the current model.
- **Money rules:** never lower a price, grant free credits, change a Stripe price/product, apply a migration, rotate a key or enable live mode without Tudor's explicit OK in the PR or a comment. Pricing changes are proposed as a table (before/after margin multiple per plan from `margin-report.mts`) and stay unmerged until approved.
- **Margin gate stays on:** `scripts/margin-report.mts` must keep passing (Pro currently sits at 3.0x). A change that makes it fail is a rejected change. Any cost-saving that reduces quality needs a sample and Tudor's OK.
- **Files it may change:** this file, `src/config/models.ts`, `src/features/providers/**` (new adapters behind the interface, never the interface itself without the CEO), `src/features/billing/**` margin/pricing code and tests, `src/features/render/pricing.ts`, `scripts/**` (read-only reporting), and the Finance lines of `TheMasterPlan.md`. It leaves UI files to the Design CEO and unrelated product work to the main CEO.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` all pass in mock mode.
- **Output (digest):** (1) MRR / spend / MRR ratio and delta, (2) cost per video by step vs revenue per video, (3) the one change made or proposed with its estimated monthly savings or revenue in dollars, (4) top 3 savings/revenue ideas ranked by cash impact, (5) what is blocked on Tudor (keys, connector auth, numbers), (6) next item. **Send a push notification only when something needs Tudor or a number crossed a threshold** (MRR ratio < 1, margin gate failing, a vendor price jump, an invoice anomaly, a missing connector). A quiet healthy run stays silent.

---

## 5. Backlog (priority order: biggest cash impact first)

Status: `[ ]` open · `[~]` in progress/PR · `[x]` done · `[?]` blocked on Tudor.

- [ ] **F0 Measure before optimising.** Today only a per-job total `api_cost_usd` is stored (`jobs.api_cost_usd`), so the cost split by step and the tokens used per video cannot be answered from the DB. Add a `job_cost_events` table (job_id, step, provider, model, unit, quantity, usd, created_at; RLS: no client access, service role writes) written by the orchestrator whenever a provider returns `costUsd`, including `usage.input_tokens/output_tokens` for the script step, clip seconds, image count and voice characters. Add `scripts/finance-report.mts` (read-only) that prints cost per video by step, margin per tier and the §2 dashboard rows computable from the DB. **Migration needs Tudor's OK to apply.**
- [?] **F1 Connect the money sources.** Authorize the Stripe connector (read-only; MRR, churn, fees, failed payments); confirm Supabase MCP reconnects (it failed to connect on 2026-10-19: `ERR_PROXY_TUNNEL`); add Vercel billing read. Ask Tudor for the vendor invoices in §3 marked `?`.
- [ ] **V1 AI video cost (the fal.ai question).** Premium costs about $2.30 for 15 s (`TheMasterPlan` §7). Research and compare per-second price at 720p/9:16, image-to-video quality and rate limits for: current fal.ai model; fal.ai cheaper models (LTX family, Wan 2.x, Hailuo/Minimax, Kling lower tiers, Seedance); direct vendor APIs (often cheaper than aggregator margins); other hosts (Replicate, Runware, WaveSpeed, Novita, DeepInfra, together.ai); self-hosted open-weight models on pay-per-second GPUs (Modal, RunPod, Vast) with batching. Output: a dated table in §8 and, for the best two, a provider adapter behind the interface plus a side-by-side clip sample for Tudor.
- [ ] **V2 Image cost.** Compare FLUX schnell/dev, Imagen, Seedream, Recraft, Runware pricing; test reusing one image across 2 scenes, lower resolution for 9:16 stills, and a prompt cache for repeat themes.
- [ ] **V3 Script LLM cost.** Measure real tokens per script. Try a Haiku-class model for Standard, keep Sonnet for Premium, add prompt caching for the static system prompt and a response-length cap. Estimated saving per video comes from F0 data.
- [ ] **V4 Voice cost.** Compare ElevenLabs Flash/Turbo vs other TTS (OpenAI, Google, Cartesia, Deepgram Aura, Fish Audio, open-weight Kokoro/Orpheus) per 1k characters; cache narration by hash for re-voice; check the custom-voice slot cost against saved-voice limits.
- [ ] **V5 Revenue levers (MRR).** With the Stripe numbers: annual plan at about 2 months free (cash up front, lower churn, fewer fixed fees); a cheaper entry tier or a pay-as-you-go top-up bundle if Starter is the cliff; usage-based Premium add-on priced from measured cost; failed-payment recovery (Stripe smart retries + dunning email); cancel-flow offer (pause, downgrade) via the billing portal; referral credits paid only on conversion; trial tuned so trial burn ÷ trial → paid stays below one month of Starter margin. Every proposal comes with a before/after table from the margin report.
- [ ] **V6 Storage and hosting.** Retention policy for finished MP4s and intermediate scene clips/images (delete intermediates after N days, expire free-tier videos), compressed output bitrate, Supabase egress and Vercel function duration. Confirm Vercel plan is allowed for commercial use before launch (Hobby is non-commercial) and price the Pro upgrade against revenue.
- [ ] **V7 Fees and waste.** Stripe fee mix, refund and chargeback rate, failed-render refunds (cost already spent but credits returned), retries that double-bill a vendor, abandoned jobs after clips were generated. Add idempotent vendor calls where a retry re-spends.
- [ ] **V8 Tooling spend.** List every subscription (Claude, design, domain, monitoring). Cancel or downgrade what the numbers don't justify; pause the Design CEO routine once D4 ships (already noted in `DesignPlan`).

---

## 6. Vendor re-scan checklist (Mondays)

For each slot, record the cheapest acceptable option, price per unit, date, URL, and `verified`/`unverified`.

- **Video:** image-to-video, 5–10 s, 720p vertical. Unit: $/second of output.
- **Image:** 9:16, about 1024 px. Unit: $/image.
- **Voice:** narration quality, 10+ languages if the roadmap needs them. Unit: $/1k characters.
- **LLM:** structured JSON script. Unit: $/Mtok in/out, with cache discount.
- **Infra:** Vercel vs Cloudflare/Fly/Railway for the app, Supabase plan limits, object storage (R2 has no egress fees) for finished videos.
- **Watch:** price drops, new open-weight video models, batch/async discounts, startup or credit programs (fal, Anthropic, ElevenLabs, Vercel, Supabase, Stripe Atlas-style perks) that cut cost with no engineering.

---

## 7. Finance snapshots (append newest on top)

| Date       | MRR  | Monthly spend | MRR ratio | Gross margin / video (Std / Premium) | Note                        |
| ---------- | ---- | ------------- | --------- | ------------------------------------ | --------------------------- |
| 2026-10-19 | n/a  | n/a           | n/a       | catalog gate: Standard $0.07–0.13 cost; Premium $2.30–3.80 | Charter created. No live revenue data reachable yet (Stripe unauthorized, Stripe is test mode). |

---

## 8. Findings log (dated vendor and price research; append newest on top)

_Empty. First entries come from the first routine run (V1)._

---

## 9. Setup: what Tudor needs to connect

The routine can only be as good as its inputs. In priority order:

1. **Stripe connector (read-only)**: claude.ai → Settings → Connectors → Stripe → Authorize. Without it there is no MRR. Also tell the routine when the account goes **live** so it switches from sandbox figures.
2. **Supabase connector**: re-authorize if it shows disconnected; the routine needs read-only SQL for cost and usage tables. Alternative: put a service-role `.env.local` in the routine's environment so `scripts/*-report.mts` run.
3. **Vercel connector** (billing charges, usage, runtime errors) and, optionally, **Sentry** (error volume vs wasted renders).
4. **Vendor spend:** fal.ai, Anthropic, ElevenLabs, Resend usage pages or monthly invoices pasted into §3; or an API key with usage-read scope in the routine environment.
5. **Network access:** the environment's network policy must allow vendor pricing pages (`fal.ai`, `elevenlabs.io`, `anthropic.com`, `replicate.com`, `runpod.io`, `modal.com`, `vercel.com`, `supabase.com`, `stripe.com`). The 2026-10-04 research was partly blocked.
6. **Measurement keys (optional, for V1 to V4):** a small funded key per candidate vendor, capped at a few dollars, so the routine can test real clips instead of trusting list prices.

Useful add-ons (suggested, none installed): Stripe MCP (MRR/churn), Supabase MCP (SQL), Vercel MCP (billing), a spreadsheet connector or Google Sheets for the cost ledger, Slack or email for the digest, and PostHog (funnel from visit → paid) once there is traffic.

---

## 10. Routine

- **Name:** "Shortcraft Finance CEO" · trigger id: _set after creation_ · model: Opus-class · 12:00 UTC daily · PR-gated, branches `ceo-finance/<slug>`.
- **Prompt to register (paste into the new routine):**

  > You are the Shortcraft Finance CEO, the master agent of the money track. Read `FinancePlan.md` in the repo and follow its §4 rules exactly. Start by computing the §2 dashboard (MRR, monthly spend, MRR ratio) and compare with the last snapshot in §7. Split the work across subagents in parallel: (a) data collector: Stripe, Supabase, Vercel numbers and the repo reports; (b) vendor researcher: web price research for the §5 item of the day, with sources and dates; (c) engineer: implement the adapter, report script or margin change behind the existing interfaces, on a `ceo-finance/<slug>` branch, with tests; (d) reviewer: run the bar (`format:check`, `lint`, `typecheck`, `test`, `next build`) and verify the margin gate still passes. Merge their results yourself, update `FinancePlan.md` (snapshot row, ledger, findings, changelog) and the Finance lines of `TheMasterPlan.md`, open one PR, never merge, and never touch live systems or prices without Tudor's OK. Send a push notification only when Tudor must act or a threshold is crossed (MRR ratio < 1, margin gate failing, a vendor price jump, a missing connector); otherwise stay silent. Finish with the §4 digest.

---

## 11. Changelog (append newest on top)

- 2026-10-19 — Charter, dashboard, cost ledger, backlog F0–V8 and the routine prompt created (owner request). No code changed.

## 12. Decision log

- 2026-10-19 — Separate routine and file instead of folding finance into `TheMasterPlan`: the main CEO optimises the product and the Design CEO the UI; money needs its own cadence, its own read-only data path and a strict approval gate on prices and vendors.
