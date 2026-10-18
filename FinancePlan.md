# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine
> (prompt: `docs/routines/finance-ceo.md`). It sits under `TheMasterPlan.md`:
> the master plan wins on product and priority; this file wins on cost, pricing
> and cash. Every finance PR updates this file (numbers + changelog) in the same
> change.
>
> Last updated: 2026-10-18 (created; no measured data yet)

---

## 1. Charter (owner-configured 2026-10-18, do not change without Tudor)

| Question  | Owner's answer                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal      | **Maximum profit, cash return first.** Watch MRR, cut cost per video, find better monetisation.                                                                |
| Scope     | Pricing, plans, credits, margin gate, provider choice and cost (fal.ai first), hosting/tooling spend, upsell and retention levers that move MRR.               |
| Autonomy  | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe objects or production data.           |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 12:00 UTC (after Design CEO 09:00 and main CEO 06:00). Weekly deep review on Mondays.                        |
| Shape     | A **master agent** reads the numbers, then splits work across sub-agents in parallel (see the routine prompt). The master merges findings and opens ≤1 PR/day. |
| Deliver   | A digest every run (PushNotification only when something needs the owner: MRR drop, margin gate at risk, a ≥20% cheaper provider proven, a decision needed).   |
| Ask first | Anything that spends money, changes live prices, or switches a production provider. Present it as a decision with numbers; the owner approves.                 |

### Rules

1. **Measure before you migrate.** A provider swap needs a measured cost per finished video on real calls (`scripts/live-providers-smoke.mts`), not a price-page snippet. List prices disagree by up to 2x.
2. **The margin gate stays law.** `npx tsx scripts/margin-report.mts` must pass (≥3x worst case) after every pricing or model change. Do not weaken it to get a number.
3. **Quality is a cost.** A cheaper model that lowers completion or retention can lose money. Compare cost per _finished, usable_ video, and say what quality was checked.
4. **Cash over vanity.** Prefer the lever that returns cash soonest: stop waste (failed-job spend, free-trial burn), then price/packaging, then cheaper models, then growth.
5. **No data, no claim.** If a number is missing, say so and add it to §6 (data needs).

---

## 2. Metrics (what the routine reads each run)

| Metric                                         | Source                                                                             | Status                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| MRR (net, USD), subs by plan                   | `npx tsx scripts/finance-report.mts` (DB) → Stripe Sigma when live                 | Script ready; needs read-only DB path        |
| Variable API cost per tier                     | `render_jobs.api_cost_usd` (same script)                                           | Ready                                        |
| Cost per 1k credits charged                    | same script (`costPer1kCredits`)                                                   | Ready                                        |
| Failed-job spend                               | same script (`failedCostUsd`)                                                      | Ready                                        |
| Margin gate multiples                          | `npx tsx scripts/margin-report.mts`                                                | Ready (uses catalog, not measured costs)     |
| North star, activation, trial→paid             | `npx tsx scripts/metrics-report.mts`                                               | Ready                                        |
| Real cash, refunds, disputes, churn            | Stripe connector / Sigma                                                           | Sandbox only until live account is connected |
| Tokens per video (Claude script)               | **Not stored.** Add `usage` (input/output tokens) to the script step's cost record | Gap, see §6                                  |
| Hosting spend (Vercel, Supabase)               | Vercel `list_billing_charges` / Supabase billing                                   | Connector available, owner approves reads    |
| Provider invoices (fal, ElevenLabs, Anthropic) | Provider dashboards                                                                | Owner pastes monthly totals into §4          |

**Headline ratios** (compute and record every run in §5):
`net MRR ÷ (variable cost + fixed cost)`, gross margin %, cost per finished 15s Standard and 15s Premium video, share of spend that is failed jobs, trial burn per signup vs trial→paid.

---

## 3. Cost model (current catalog, unmeasured)

From `src/config/models.ts` and TheMasterPlan §7. Costs are researched list prices, not measured.

| Step             | Provider today              | Cost basis                         | Notes                                                                    |
| ---------------- | --------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Script           | Anthropic Sonnet 5.5        | ~$0.04 per script                  | Tokens per call not recorded yet (§6)                                    |
| Image (Standard) | fal.ai FLUX schnell         | $0.003 / image                     | Cheap; check Replicate/Together/Runware for parity                       |
| Image (Premium)  | fal.ai FLUX dev             | $0.025 / image                     |                                                                          |
| Video (Standard) | In-house Ken Burns (ffmpeg) | $0                                 | Already the cheap path                                                   |
| Video (Premium)  | fal.ai Kling 2.5 Turbo Pro  | ~$0.07 per billed second, 5s clips | **The big cost.** ~$1.10 per 15s video; conservative $0.12/s in the gate |
| Voice            | ElevenLabs Flash            | ~$0.05 / 1k chars                  | Plan slot limits cap saved voices                                        |
| Render           | In-house ffmpeg on Vercel   | ~$0.01                             |                                                                          |

**Where the money goes:** Premium AI video dominates cost per video (≈15x a Standard video). Standard is already ~9x margin. So the leverage is (a) cheaper Premium video, (b) steering users to the hero-shot variant, (c) price Premium by measured cost.

---

## 4. Fixed monthly costs (owner fills in; the routine asks if blank)

| Item                      | Monthly (USD) | Source / notes                                                                                   |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| Vercel (Hobby)            | 0             | Hobby today; Pro is $20/seat if commercial use needs it. **Check ToS: Hobby is non-commercial.** |
| Supabase                  | ?             | Free vs Pro ($25)                                                                                |
| ElevenLabs plan           | ?             | Needs custom-voice slots                                                                         |
| Resend                    | 0             | Free tier (100/day)                                                                              |
| Sentry                    | ?             |                                                                                                  |
| Domain                    | ?             |                                                                                                  |
| fal.ai / Anthropic prepay | ?             | Variable, but note prepaid balances as cash out                                                  |
| **Total fixed**           | **?**         | Pass to `finance-report.mts --fixed=<total>`                                                     |

---

## 5. Candidate levers (the routine ranks and works these; newest evidence wins)

Order = expected cash return per unit of effort. Each needs a number before it becomes a PR.

1. **Stop waste.** Failed-job spend and trial burn (`failedCostUsd`, trial burn $0.14–0.25 per signup). Refund/retry policy, fail early before paid steps, moderation before spend.
2. **Premium video provider swap.** fal.ai Kling is ~$1.10 per 15s. Benchmark, on the same 5 prompts, cost per usable 5s clip and visual quality for: fal-hosted cheaper models (Wan 2.x, LTX-2, Seedance Lite/Fast, Hailuo), direct provider APIs (Kling, MiniMax/Hailuo, Runway, Luma, Veo Fast), aggregators and GPU-per-second hosts (Replicate, Runware, Together, Modal/RunPod self-hosted open weights). Candidates are **unverified leads**, not facts; the routine verifies each on current pricing pages.
3. **Hero-shot Premium.** AI clip on scene 1 only, stills elsewhere: ~$0.45 per 15s video. Price close to Standard; likely the best upsell per dollar.
4. **Cache and reuse.** Reuse images/clips across re-voice and variations; anthropic prompt caching on the script system prompt; batch where the provider has a batch discount.
5. **Pricing and packaging.** Annual plans (cash up front, lower churn), a credit-expiry/rollover policy, top-up bundle price ladder, a Premium add-on instead of burning Pro credits, usage-based overage. Raise prices only with a measured conversion signal.
6. **Retention and expansion.** Churn reasons, dunning (Stripe smart retries), pause instead of cancel, upgrade nudges when a user hits plan limits.
7. **Cost of the stack.** Hosting tier choices, image CDN/storage egress, Supabase storage lifecycle (delete expired renders), Sentry sampling.

---

## 6. Data and access the routine needs (ask the owner for anything missing)

| Need                               | Why                                  | Status / how to grant                                                                                                                                                  |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo access (read + branch push)   | PRs                                  | Granted (`TudorFnsn/Shortcraft`)                                                                                                                                       |
| Supabase read-only                 | MRR, cost per job                    | Connector failed from this session (proxy tunnel error 2026-10-18). Owner: re-auth the Supabase connector; ideally a **read-only Postgres role** + view `finance_jobs` |
| Stripe **live** account, read-only | Real MRR, churn, refunds, disputes   | Connector sees the sandbox only and needs re-auth. Owner: add the live account (restricted read-only key)                                                              |
| Vercel billing read                | Hosting cost                         | Vercel connector is available (`list_billing_charges`, `get_runtime_logs`)                                                                                             |
| Provider invoices                  | fal.ai, ElevenLabs, Anthropic totals | Owner pastes monthly totals into §4 (no billing APIs are connected); or add provider usage exports                                                                     |
| Anthropic usage per request        | Tokens per video                     | Code gap: record `usage.input_tokens/output_tokens` per script call in the job cost record. First PR candidate                                                         |
| Sandbox fal/ElevenLabs budget      | Measure real costs                   | Owner sets a hard $ cap on fal.ai and ElevenLabs keys before the routine runs `live-providers-smoke.mts`                                                               |
| Price pages                        | Verify provider prices               | WebFetch/WebSearch; if a host blocks the routine's network, ask the owner for the page or invoice                                                                      |

**Suggested connectors and tools** (owner decides; each is read-only first):

- **Stripe (live, restricted read key)**: MRR/churn/refunds/dunning, Sigma queries. Highest value.
- **Supabase (re-auth)** or a read-only DB role for `finance-report.mts`.
- **Vercel** (already connected): billing charges, runtime errors that cause failed-job spend.
- **PostHog or Plausible** (later): signup → paid funnel and pricing-page conversion for price tests.
- **Sentry connector**: errors that burn paid steps.
- **Google Sheets connector**: a running cost/MRR ledger the owner can read on a phone.
- **A cost-tracking MCP or skill** (search the registry on first run: `SearchMcpRegistry` for "billing", "finops", "stripe"), and `SuggestConnectors` for anything the routine finds missing.

---

## 7. Changelog (newest on top)

- **2026-10-18** — Finance track created: `FinancePlan.md`, routine prompt `docs/routines/finance-ceo.md`, `src/features/metrics/finance.ts` (+ tests) and `scripts/finance-report.mts` (read-only MRR, cost per tier, cost per 1k credits, failed-job spend). No measured data yet; first run should fill §4 and §6. (Finance CEO setup, interactive)
