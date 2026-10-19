# FinancePlan — Shortcraft cash and margin

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`. The master plan wins on product and priority;
> this file wins on what the app costs, what it earns and how to improve both.
> Every finance PR updates this file (ledger, backlog, changelog) in the same change.
>
> Last updated: 2026-10-19 (routine defined, no measurements yet)

---

## 1. Charter

| Question  | Answer                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximise cash return.** Raise MRR and gross margin, cut cost per finished video and fixed spend, and never let a change make a plan unprofitable.                    |
| Priority  | Cash first. A saving that is certain and small beats a big one that is a guess. Quality, safety and legal limits are constraints, not trade-offs.                      |
| Autonomy  | **PR-gated.** Branches `ceo-finance/<slug>`; never merge. Read-only on Stripe, Supabase and Vercel. Any write to a live system, price change or vendor switch needs Tudor. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after the main CEO at 06:00 and Design at 09:00). Weekly deep run on Mondays.                              |
| Structure | A **DM master agent** reads this file, measures, then fans out to the specialist agents in §3 in parallel and merges their findings into one digest and at most one PR. |
| Output    | A digest (§6) pushed as a notification only when something needs Tudor. Nothing changed and nothing found means silence.                                                |

### The numbers it steers by

1. **MRR** = sum of active subscriptions at list price, net of VAT. Also: new, expansion, contraction and churned MRR; ARPU; trial → paid; paid churn.
2. **Gross margin per video** = credits charged converted to net revenue, minus measured API cost (`render_jobs.api_cost_usd`). Per tier, per length, per plan.
3. **Cost of goods per paying user per month** vs the plan price. The margin gate (`scripts/margin-report.mts`, target 3x) is the floor.
4. **Trial burn** per signup (acquisition cost) vs the trial → paid rate: payback in days.
5. **Fixed spend**: Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domains, Anthropic. Anything not tied to usage.
6. **Stripe take**: fees, refunds, disputes, failed payments and recovered payments.

---

## 2. Facts the routine starts from (2026-10-19, from `TheMasterPlan.md` §7 and `src/config/models.ts`)

- Plans EUR/mo: Starter 14.99 · Pro 29.99 · Ultra 79.99. Top-ups 12 / 29 / 59. Trial 3,000 credits (burn ≈ $0.14–0.25).
- Standard video = animated stills (Ken Burns, in-house ffmpeg): about **$0.07 per 15s**, margin about 9x. It is not where money leaks.
- Premium video = AI clips on fal.ai (default Kling 2.5 Turbo Pro, about $0.07 per billed second): about **$1.10 per 15s**, 26,504 credits charged. Pro sits at exactly 3.00x, so any measured cost increase fails the gate.
- Script writer: Claude Sonnet 5.5 (about $0.04 a script). Images: FLUX on fal.ai ($0.003 and $0.025). Voice: ElevenLabs (per character, plus custom-voice slots).
- **Every cost above is a list price, not a measurement.** Closing that gap is backlog item F1.
- Stripe is in **test mode** and Supabase's MCP failed to connect from some cloud sessions. See §5 for access.

---

## 3. The DM master agent and its specialists

The routine's first agent is the **master** (the "DM"). It does not analyse; it plans, delegates and merges. Each run:

1. Read `TheMasterPlan.md`, this file, `git log -20` and open and recent PRs. An item already in an open `ceo-finance/*` PR is in review, not available.
2. Pull fresh numbers (§5). Write them into the ledger in §4 if they changed.
3. Pick the specialists that have something to do today (do not spawn all of them every run), brief each with the goal, the files, what is already ruled out and the output format, and run them **in parallel**.
4. Verify every finding against the code or data before it is accepted. A specialist's claim is not a result.
5. Rank by **cash per week of effort**, ship at most one PR, update the backlog, send the digest.

| Specialist          | Job                                                                                                                                                                                                  | Reads                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Revenue analyst** | MRR, new/expansion/contraction/churn, ARPU, trial → paid, failed-payment recovery, refunds and disputes, price tests (anchoring, annual plan, a mid tier, top-up nudges).                            | Stripe (read), `subscriptions`, `credit_transactions`  |
| **Unit economist**  | Tokens and seconds consumed per video vs dollars spent, per step and per tier. Compares `api_cost_usd` and `actual_credits` with the catalog's `costUsdPerUnit`. Re-runs the margin gate on measured costs. | `render_jobs`, `src/config/models.ts`, `margin.ts`     |
| **Model scout**     | Finds cheaper or better providers for each slot (video, image, voice, script, render) and the release notes that matter. See §7 for the shortlist. Prices must come from the provider's page or API, not from an aggregator, and carry a date. | Web, `src/features/providers/live/*`                   |
| **Infra auditor**   | Fixed and variable platform spend: Vercel function time and bandwidth, Supabase compute, storage and egress, retention of media, cron frequency, Sentry volume, Resend volume.                         | Vercel and Supabase connectors, `vercel.json`, usage   |
| **Cost engineer**   | Turns a finding into a small tested change: caching, prompt trimming, shorter scripts, image reuse, cheaper model routing, fallbacks, retention jobs, batching. Owns the PR.                         | The repo                                               |
| **Skeptic**         | Tries to break the proposed change: margin gate, quality regression, refund risk, vendor lock, legal. Nothing ships without its pass.                                                                 | The diff and the ledger                                |

---

## 4. Ledger (the routine keeps this current; numbers carry a date and a source)

### 4.1 Unit costs, measured vs list

| Slot                | Catalog $/unit (list) | Measured $/unit | Samples | Source / date |
| ------------------- | --------------------- | --------------- | ------- | ------------- |
| Script (Sonnet 5.5) | 0.04 / script         | —               | 0       | —             |
| Image standard      | 0.003 / image         | —               | 0       | —             |
| Image premium       | 0.025 / image         | —               | 0       | —             |
| Video premium       | 0.07 / s              | —               | 0       | —             |
| Voice (ElevenLabs)  | per 1k chars          | —               | 0       | —             |
| Render (in-house)   | ~0.01 / video         | —               | 0       | —             |

### 4.2 Monthly P&L

| Month   | Net revenue | API cost | Platform (fixed) | Stripe fees | Refunds | Gross margin | MRR end | Source |
| ------- | ----------- | -------- | ---------------- | ----------- | ------- | ------------ | ------- | ------ |
| 2026-10 | —           | —        | —                | —           | —       | —            | —       | —      |

### 4.3 Fixed spend inventory

| Vendor                        | Plan / tier | €/mo | Used vs cap | Cheaper option |
| ----------------------------- | ----------- | ---- | ----------- | -------------- |
| Vercel                        | Hobby?      | ?    | ?           | ?              |
| Supabase (`iqvrovjwoavvmhaithwn`) | Free?   | ?    | ?           | ?              |
| ElevenLabs                    | ?           | ?    | ? slots     | ?              |
| Anthropic                     | pay-go      | usage | —          | batch, caching |
| fal.ai                        | pay-go      | usage | —          | see §7         |
| Resend, Sentry, domain        | ?           | ?    | ?           | ?              |

The first run fills every `?` it can reach and lists what it cannot reach under "Needs Tudor" in the digest.

---

## 5. Access the routine needs (configure once; the routine asks for anything missing)

Cloud routines can only use what is attached to the routine or the environment. Checked 2026-10-19 from the creating session:

| Need                         | Status                                                                                                              | What to do                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft` | In scope in this session                                                                                       | Attach the same repo to the new routine (branch pushes allowed for `ceo-finance/*`).                                                            |
| Supabase (read)              | The `.mcp.json` server **failed to connect** (`ERR_PROXY_TUNNEL`); the claude.ai connector was still connecting      | Attach the claude.ai Supabase connector to the routine. Add the environment domain `mcp.supabase.com` to the network allowlist if tunnels fail. |
| Stripe (read)                | Connector exists but **needs authorisation** (claude.ai connector settings)                                          | Authorise it. Later add a **restricted read-only live key**; never a full secret key.                                                           |
| Vercel (usage and billing)   | Connector present (`list_billing_charges`, `list_contract_commitments`, runtime logs)                                 | Attach to the routine. Read tools only.                                                                                                         |
| fal.ai, ElevenLabs, Anthropic spend | No connector. Dashboards only                                                                                   | Export monthly usage CSVs into a private Supabase table or paste totals into §4.2. Better: a read-only usage/billing key per vendor in the routine's secrets. |
| Web access to vendor pricing | Direct provider pages were blocked from earlier routines' networks (TheMasterPlan §7)                                 | Allow the pricing domains in the environment's network policy: `fal.ai`, `elevenlabs.io`, `replicate.com`, `runpod.io`, `together.ai`, `groq.com`, `deepinfra.com`, `fireworks.ai`, `anthropic.com`. |

Without Supabase access the routine can still work from the code, the catalog, the margin report and Stripe, and says so in the digest instead of guessing.

### Connectors, tools and add-ons that would make it better

- **Stripe** (read-only): MRR, churn, fees, disputes, failed payments. Sigma for SQL over charges and subscriptions.
- **Supabase** + `get_advisors` and `query_logs`: per-job cost rows, storage size, slow queries that cost compute.
- **Vercel**: billing charges, function duration, bandwidth, image optimisation usage.
- **Analytics** (PostHog or Vercel Web Analytics): visitor → signup → paid funnel, which the revenue analyst cannot see today.
- **Sentry**: event volume, since it is billed by volume.
- **Cost tracking in the app itself**: log provider, model, units and USD for every call (see F2). This beats every dashboard because it is per job.
- **Claude tools**: the `loop`/routine scheduler for the weekly deep run, `Workflow` for the specialist fan-out when Tudor opts in, `dataviz` for the digest charts, the `xlsx` skill for a monthly finance sheet.
- **Cheap bookkeeping**: a monthly CSV export from Stripe, fal.ai, ElevenLabs and Vercel into `docs/finance/` is enough to start.

---

## 6. Rules for the Finance CEO routine

- **Read first:** `TheMasterPlan.md` (§7 and §8), this file, `git log -20`, open and recent PRs. An item with an open PR is in review.
- **Measure before proposing.** A proposal cites a measured number from §4 or states that it is a list price. Never present a guess as a saving.
- **Cash arithmetic is explicit:** every proposal states `€ saved or earned per month at current volume`, `at 10x volume`, the one-off cost, and the payback time.
- **PR-gated.** Branch `ceo-finance/<slug>`, one item per run, never merge. Prefer improving an open `ceo-finance/*` PR.
- **Never without Tudor:** change a Stripe price or plan, switch the default provider for paying users, enable live mode, spend money (including test runs above $5), delete data, or write to any live system. Prepare the change as a PR or a one-line instruction instead.
- **Margin gate stays the floor.** No change may take any product below 3x (`scripts/margin-report.mts`). Provider swaps need an A/B on at least 10 real calls and a quality check by Tudor before they become the default.
- **Files it may change:** `src/config/models.ts` (costs and routing, not credit prices), `src/features/providers/**`, `src/features/billing/margin.ts`, `scripts/**` (finance and cost scripts), `docs/finance/**`, this file and its lines in `TheMasterPlan.md`. It does not touch UI files owned by the Design CEO, migrations (it proposes SQL in the PR body for Tudor to apply) or webhooks.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` pass in mock mode.
- **Notify only when it matters:** a margin below 3x, MRR down week over week, a cost spike over 25% vs the prior 7 days, a failed or disputed payment pattern, a saving over €50/mo ready to approve, or a blocker (missing access). Otherwise end quietly.
- **Digest format:** (1) one-sentence headline, (2) MRR and margin table with deltas, (3) what changed, (4) the PR and its payback, (5) **Needs Tudor** (decisions and access), (6) next item.

---

## 7. Backlog (ranked by expected cash per week of effort; the routine re-ranks it)

- [ ] **F1. Measure the real cost of one video, per step.** Run `scripts/live-providers-smoke.mts` (Standard and `--premium`) with the owner's keys and record the real USD per step in §4.1. Until this exists every margin number is a list price.
- [ ] **F2. Log provider usage per call.** Write model, units and USD for each provider call into `render_jobs.api_cost_usd` and a new `provider_usage` table (migration proposed in the PR, applied by Tudor). Gives tokens and seconds consumed per job against dollars spent.
- [ ] **F3. `scripts/finance-report.mts`** (read-only, same pattern as `metrics-report.mts`): MRR and its movements, margin per tier from `api_cost_usd`, trial burn vs trial → paid, API cost per active subscriber, top 10 most expensive users and jobs. Pure maths in `src/features/metrics/finance.ts` with tests.
- [ ] **F4. Premium video cost** (fal.ai is the largest variable cost). Candidates to price on the provider's own page and test on 10 clips: Kling 2.5 Turbo (current), Seedance (ByteDance) and LTX-2 Fast on fal, Wan 2.5/2.6 (open weights, runnable on Replicate, RunPod or Modal GPUs), Hailuo, Veo 3.1 Fast. Compare also the **hero-shot** variant (AI clip on scene 1 only, about $0.45 per 15s) and a render at lower resolution upscaled in the in-house ffmpeg step. Pick by cost per accepted clip, not cost per clip.
- [ ] **F5. Cheaper script and prompts.** Prompt caching on the fixed system prompt, a smaller model for the moderation pass, batch API for non-urgent work, shorter outputs. Check the real token counts first (F2).
- [ ] **F6. Voice cost.** Compare ElevenLabs Flash against other TTS (OpenAI, Cartesia, Deepgram Aura, self-hosted open models) on per-character price and on custom-voice slots, which cap sign-ups.
- [ ] **F7. Revenue levers.** Annual plans at about 2 months free (cash up front, lower churn), a failed-payment recovery flow (Stripe Smart Retries and dunning emails), top-up prompts at 80% credits used, an upsell from Standard to a Premium hero shot, a mid price between Pro and Ultra, localised prices.
- [ ] **F8. Trial economics.** Trial burn is about $0.14–0.25 per signup; compare against trial → paid. Add abuse limits (one trial per device or card fingerprint) if burn per paying user is high.
- [ ] **F9. Storage and egress.** Media retention (delete drafts and failed-job assets after N days), signed-URL caching, compress renders. Check Supabase and Vercel usage first (F10).
- [ ] **F10. Fixed-spend audit** (§4.3): downgrade or drop anything unused; check Hobby vs Pro limits before they bite.
- [ ] **F11. Affiliates and refunds.** A 30% recurring affiliate cut (TheMasterPlan §6) costs margin: model it before launching. Track refund rate against the EU withdrawal clause.

---

## 8. Links

- Finance CEO routine: created from this file (id recorded in TheMasterPlan §9 once the owner creates it).
- Margin gate: `scripts/margin-report.mts` · North star: `scripts/metrics-report.mts` · Catalog: `src/config/models.ts`.

---

## 9. Changelog (newest on top)

- **2026-10-19** — Finance track defined: charter, DM master agent and six specialists, access checklist, ledger and a ranked backlog (F1–F11). No measurements yet: every cost is still a list price. (Finance CEO, creating session)
