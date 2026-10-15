# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority,
> this file wins on cost, pricing and cash. Every finance PR updates this file
> (baseline, roadmap, changelog) in the same change.
>
> Last updated: 2026-10-15 (charter + first baseline; no code yet)

---

## 1. Charter

**Goal: maximum cash return.** Raise MRR and cash margin, cut cost per video and fixed
spend, and never let a change push a product under the margin gate (3x, `features/billing/margin.ts`).

| Question           | Answer                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metric it steers   | **MRR**, then gross margin per video, then net cash (revenue − every vendor bill). Tie-break: cash now beats cash later.                                                          |
| Cadence            | Daily cloud routine **"Shortcraft Finance CFO"**, 07:00 UTC (after the main CEO at 06:00, before Design at 09:00). Cron: `0 7 * * *`.                                              |
| Shape              | **DM master agent** (the CFO) reads the plan and the numbers, picks the biggest cash lever, and splits the work across sub-agents in parallel (see §3). It integrates their output.   |
| Autonomy           | **PR-gated.** Branches `ceo-finance/<slug>`; never merges, never touches live secrets, never changes a live Stripe object, price or migration without the owner's explicit OK.    |
| May change         | `src/config/models.ts`, `src/config/plans.ts`, `src/features/providers/**` (new adapters behind a flag), `src/features/billing/margin.ts`, `scripts/finance-*.mts`, this file, finance lines of `TheMasterPlan.md`. |
| Must not change    | UI files (Design CEO owns them), Stripe live mode, migrations (propose SQL in the PR body; the owner applies), anything that lowers a plan's margin multiple below 3x.            |
| Pricing changes    | Proposed in a PR with the before/after margin table and a revenue-impact estimate. Pricing visible to customers is the owner's call, never auto-applied.                            |
| Overlap rule       | Before picking work, list open + recently closed PRs (all `ceo*` branches). An item with an open PR is in review. Leave UI files alone while a `ceo-design/*` PR is open.            |

---

## 2. Baseline (2026-10-15, from the repo; **researched, not measured**)

Source: `src/config/models.ts`, `src/config/plans.ts`, `TheMasterPlan.md` §7.

**Where one video's API money goes (15s Standard, 3 scenes, ≈ $0.07):**

| Line                              | Cost   | Share | Note                                                              |
| --------------------------------- | ------ | ----- | ----------------------------------------------------------------- |
| Script (Claude Sonnet 5.5)        | $0.04  | ~57%  | ~2k in / 1.5k out. **Biggest Standard line.** Cache + shrink it.  |
| Images (FLUX schnell, 3 × $0.003) | $0.009 | ~13%  | Already cheap. Little to win.                                     |
| Voice (ElevenLabs Flash)          | ~$0.011| ~16%  | ~15 chars/s. $0.05/1k chars list. Alternatives are 1.5–3x cheaper.|
| Render (in-house ffmpeg)          | $0.01  | ~14%  | Compute bound, conservative. Measure on Vercel.                   |
| Ken Burns "video"                 | $0     | —     | No model call.                                                    |

**fal.ai is not the Standard cost.** Standard uses fal only for FLUX images ($0.003). fal's
real weight is **Premium AI video** (Kling 2.5 Turbo Pro, ~$0.07/s billed, gate assumes
$0.12/scene-second): ≈ $1.10–2.30 per 15s video. So the video-model hunt is a Premium and
"hero shot" question, and the **script step** is the first lever for Standard margin.

**Customer price vs cost:** Standard carries ~9x on Starter; **Pro sits at exactly 3.0x** (the
gate's floor), Ultra 3.23x, top-ups 4.0–5.9x. Any measured cost increase on Premium fails the gate.

**Fixed monthly costs (to be filled from invoices, see §6):** Vercel plan, Supabase plan, ElevenLabs
plan (custom-voice slots), Resend, Sentry, domain, Stripe fees (1.5% + €0.25 EEA cards, in the margin model).

**Unknown today (the CFO's first job):** real `api_cost_usd` per job from `render_jobs`, real
token counts, real plan mix, churn, free-trial burn, and the vendor bills.

### Candidate swaps (search snippets 2026-10-15, vendor-authored, **verify before acting**)

| Slot            | Today                         | Candidates                                                                                            | Why / risk                                                                 |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Premium video   | Kling 2.5 Turbo Pro $0.07/s   | Seedance 2.0 Fast/Mini (~$0.02–0.05/s), Kling 3.0 Turbo (~$0.03–0.10/s), Grok Imagine ($0.07/s), LTX-2, Wan | Prices conflict by 2–10x across sources; quality for faceless b-roll must be compared on our own prompts. |
| Video host      | fal.ai                        | Atlas Cloud, WaveSpeed, Replicate, direct vendor APIs (BytePlus for Seedance)                         | Same model is often cheaper off fal. Adapter layer already isolates this.  |
| Voice           | ElevenLabs Flash $40–50/1M ch | Deepgram Aura-2 (~$30/1M), Inworld TTS Mini ($25/1M), OpenAI tts-1 ($15/1M), Google/Polly standard (~$4/1M), Cartesia | Cheaper, but we need **word timings** for captions and designed voices (Voice Studio). Keep ElevenLabs for designed voices; test a cheap default voice. |
| Script          | Sonnet 5.5 $2/$10 per MTok    | Haiku 5.5 for drafts, prompt caching for the static system prompt, Batch API for non-urgent jobs      | Script is 57% of Standard cost; a cache hit on the system prompt is the cheapest win. |
| Images          | FLUX schnell $0.003           | Keep. Premium FLUX dev $0.025: test whether schnell + upscale is good enough.                         | Little to gain on Standard.                                                |
| Hero-shot video | n/a                           | AI clip on scene 1 only (~$0.45/15s) priced near Standard                                              | New product tier, higher ARPU than Standard at a similar cost.             |

Sources: [fal best image-to-video APIs 2026](https://fal.ai/learn/tools/best-image-to-video-apis-2026), [Atlas Cloud cheapest image-to-video API](https://ask.atlascloud.ai/cheapest-image-to-video-api), [devtk video API pricing](https://devtk.ai/en/blog/ai-video-generation-pricing-2026/), [apiframe TTS roundup](https://apiframe.ai/blog/best-text-to-speech-apis-2026), [gradium TTS pricing guide](https://gradium.ai/content/how-to-compare-tts-pricing-across-providers-2026).

---

## 3. How the routine works (DM master agent + sub-agents)

The CFO is the master. It does not do the legwork itself; it delegates in parallel with the
Agent tool, gives each sub-agent a narrow brief and read-only access unless the brief says otherwise,
then reviews and merges their output into one PR and one digest. Keep it to ≤ 5 sub-agents a run.

1. **Master reads** `TheMasterPlan.md` §7–§9, this file, `git log -20`, open and recent PRs (`ceo*`), and the latest numbers (see 2).
2. **Master picks one lever** (highest expected cash per day of work) and decides which sub-agents it needs:

| Sub-agent        | Job                                                                                                                                              | Access                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| **Revenue**      | MRR, ARPU, plan mix, new/expansion/churned MRR, trial→paid, refunds and failed payments, top-up share. Proposes pricing, annual plan, dunning, upsell. | Stripe connector (read), Supabase (read)  |
| **Unit cost**    | Cost per video by tier from `render_jobs.api_cost_usd`; tokens per script (input, output, cache hits); cost per step; overruns vs the credit hold; failed-job waste. | Supabase (read), repo                    |
| **Vendors**      | Re-price every provider slot (§2 table): fetch live pricing pages, compare, and run the smoke script on a candidate if a key is present. Never swaps a live model. | Firecrawl, WebSearch, repo               |
| **Fixed costs**  | Vercel, Supabase, ElevenLabs, Resend, Sentry bills vs usage; unused seats/plans; downgrade or tier opportunities; cold-storage/retention savings for MP4s. | Vercel connector (billing), Supabase (read) |
| **Builder**      | Implements the master's chosen change on `ceo-finance/<slug>` with tests; runs `format:check, lint, typecheck, test, next build` in mock mode.    | Repo write, no secrets                   |

3. **Master integrates:** checks the margin gate still passes (`scripts/margin-report.mts`), writes the
   before/after table, updates §2 and the changelog, opens **one** PR, and sends the digest.
4. **Notify only on news:** a PushNotification when MRR moves ±5% week on week, a product falls under 3x,
   a vendor bill spikes > 25%, a saving ≥ $50/mo is ready for approval, or the routine could not run (a connector or access failed). Quiet days send nothing.

### Output (digest)

MRR and change, gross margin/video by tier, cash in vs out this month, top 3 cost lines, what shipped (PR link),
what needs Tudor (approvals, keys, invoices), next lever and its expected $/month.

---

## 4. Roadmap (top unchecked item that has no open PR)

Order = expected cash per effort. Cheap measurement first, because every number above is a list price.

- [ ] **F1 Measure.** `scripts/finance-report.mts` (read-only, like `metrics-report.mts`): cost per job and per step by tier, script tokens in/out, cost vs hold, MRR from Stripe, plan mix. Pure math in `features/finance/`, tested. Replace the `costUsdPerUnit` guesses with measured medians.
- [ ] **F2 Script cost.** Prompt caching on the static system prompt, trim output tokens, test Haiku 5.5 for the first draft; compare quality on 20 saved topics. Expected: −40–70% on the 57% line.
- [ ] **F3 Cheap voice default.** Adapter for a cheaper TTS with word timings behind a flag; ElevenLabs stays for designed voices. A/B listen test written up for the owner.
- [ ] **F4 Premium video re-source.** Adapter for the cheapest model that passes a blind quality check; keep fal as fallback. Re-run the gate; if headroom appears, raise Pro above 3.0x or cut Premium credits to win share.
- [ ] **F5 Hero-shot tier.** AI clip on scene 1, stills for the rest. Price between Standard and Premium. Needs a UI row (hand to Design CEO, do not touch UI).
- [ ] **F6 Revenue levers (owner decisions, PR proposes only).** Annual plan with ~2 months free, Stripe Smart Retries + dunning emails, cancel-flow offer (pause / downgrade), top-up nudge at 20% credits left, trial credits sized to the measured burn.
- [ ] **F7 Fixed-cost audit.** Invoices vs usage per vendor; MP4 retention policy (storage cost grows forever); cron frequency vs Vercel invocations.
- [ ] **F8 Margin dashboard.** Weekly digest as a Claude artifact or `docs/finance/` snapshot the owner can read on a phone.

---

## 5. Rules for the Finance CFO routine

- **Read first:** `TheMasterPlan.md`, this file, `git log -20`, open and recent PRs.
- **One lever per run.** Prefer improving an open `ceo-finance/*` PR over a new one.
- **Measured beats researched.** Never cite a list price as fact without the source and date; mark estimates.
- **Margin gate is a hard stop.** No change may leave any plan or top-up under 3x on its worst-case job. Report the table every time.
- **Money safety:** read-only on Stripe, Supabase and Vercel unless the owner says otherwise. No live-mode changes, no spending on paid API tests above $5 without approval (log what was spent).
- **No customer-visible price change without approval.** Propose it with the revenue-impact estimate.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.

---

## 6. What the routine needs from Tudor (it will ask for these; none are blocking)

1. **Read access to real numbers.** The Supabase connector failed to connect from the cloud session on 2026-10-15 (`ERR_PROXY_TUNNEL`). Reconnect it, or give a read-only Postgres role (`finance_ro`: select on `render_jobs`, `credit_transactions`, `subscriptions`, `profiles`) as a Vault secret.
2. **Stripe live (read-only).** The connector is the sandbox account. A restricted live key (read: balances, charges, subscriptions, invoices, disputes) lets the Revenue agent see real MRR once you go live.
3. **Vendor bills.** Paste or drop monthly invoices (fal.ai, Anthropic, ElevenLabs, Vercel, Supabase, Resend, Sentry, domain). Better: usage/admin API keys, read-only: Anthropic Admin API (cost report), fal.ai usage API, ElevenLabs usage, Vercel billing (connector exists).
4. **Which price changes are open.** Is annual billing, a cheaper voice default and a hero-shot tier acceptable to ship?
5. **Spend allowance** for quality tests of candidate models (suggested: $20 total).

### Connectors, tools and add-ons that would help

| Tool                                        | Status                         | Use                                                                                         |
| ------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| Stripe connector                            | connected (sandbox)            | MRR, churn, refunds, Sigma queries. Point at live (read-only) at launch.                    |
| Supabase connector                          | connected, failed in this run  | Cost per job and token tables. Needs the retry above.                                       |
| Vercel connector                            | connected                      | `list_billing_charges`, `list_contract_commitments`, usage vs plan for the fixed-cost audit. |
| Firecrawl connector                         | connected                      | Pull live vendor pricing pages (direct fetches were blocked before). The Vendors agent uses it. |
| Google Sheets / Drive connector             | not connected                  | Optional: a living cost sheet and invoice folder the routine can read.                       |
| Gmail connector                             | not connected                  | Optional, read-only: find vendor invoices and receipts automatically.                        |
| fal.ai, Anthropic, ElevenLabs usage APIs    | no connector                   | Add as env secrets for the routine (read-only keys), or as custom MCP servers.               |
| PostHog (or Vercel Analytics)               | not connected                  | Visitor→signup→paid funnel; the revenue side of CAC.                                         |
| Anthropic **prompt caching** + Batch API    | API feature                    | F2: cuts script cost without changing quality.                                               |
| `ccusage`-style cost logging in-app         | to build in F1                 | Log tokens and dollars per provider call to a `provider_usage` table (migration proposed for owner approval). |

---

## 7. Changelog (newest on top)

- **2026-10-15** — Finance track created: this file, charter, baseline, roadmap F1–F8, and the routine design (master CFO + 5 sub-agents). No code, no migration. Routine to be created in claude.ai/code/routines from the prompt in `docs/finance/cfo-routine-prompt.md`. (interactive/scheduled setup)
