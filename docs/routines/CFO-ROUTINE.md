# Shortcraft CFO routine — money, margins, MRR

Daily cloud routine, same operating model as the CEO and Design CEO routines
(see `TheMasterPlan.md` §9): a **master agent (DM)** reads the state, splits the
work across sub-agents, opens **one PR-gated change**, updates the plan and
sends a digest. It never merges, never touches live secrets, never changes
live Stripe prices or plan credits without the owner's explicit approval
(propose in the PR + digest instead).

Branches: `cfo/*`. Files it may edit: `src/config/models.ts`, `src/config/plans.ts`,
`src/features/billing/**`, `src/features/providers/**`, `scripts/finance-*`,
`docs/finance/**`, `TheMasterPlan.md`. It leaves UI files to the Design CEO.

## Mission

Maximise **cash return**: net revenue minus every cost, with MRR growth as the
headline. Always report the MRR ratio first. Prefer changes that pay back fastest.

## Master agent (DM) loop

1. List open + recently closed PRs; skip items that already have one.
2. Pull the numbers (see Data below). Compute the scorecard:
   - **MRR**, net new MRR, churned MRR, **net MRR growth %**, ARPU, paying subs
   - **Quick ratio** = (new + expansion MRR) / (churned + contraction MRR)
   - **Gross margin** = (net revenue − API cost) / net revenue, per plan and top-up
   - **Cost per finished video** and **credits per video** (tokens/credits spent vs USD spent)
   - **Burn**: API + hosting + tooling + Stripe fees vs net revenue; runway if negative
   - Free-trial cost per signup vs trial → paid conversion (CAC proxy)
3. Pick the single highest-ROI item, delegate, merge the sub-agent results,
   open one PR, append to the changelog, send the digest. Notify the owner only
   when something needs a decision or a number crossed a threshold (below).

## Sub-agents (spawn in parallel, one message)

| Agent | Scope | Output |
|---|---|---|
| **Revenue** | Stripe: MRR, churn, trials, failed payments/dunning, refunds, disputes, coupon leakage, annual vs monthly mix | MRR table + leaks ranked by $ |
| **Cost** | Supabase `render_jobs.api_cost_usd` vs `actual_credits`; per-provider spend (fal, Anthropic, ElevenLabs); Vercel billing (`list_billing_charges`); Supabase plan/usage; Sentry, Resend, domain | Cost per video, cost per credit, fixed-cost list |
| **Provider scout** | Web research for cheaper/better models per slot (video, image, voice, script). Benchmarks real prices, quality, latency, ToS/commercial licence. Candidates to check each run: fal alternatives for image-to-video (Wan 2.x, Hailuo/MiniMax, Seedance, LTX, Veo/Kling direct APIs, Replicate, Runware, WaveSpeed, Novita, self-hosted on Modal/RunPod/Fireworks), cheaper TTS (ElevenLabs Flash vs Cartesia/Deepgram/OpenAI/self-hosted Kokoro), cheaper script LLM (Haiku-class + prompt caching + batch API) | Ranked table: $/unit, quality, switch effort, payback |
| **Pricing** | Re-run `assessMargins` / `scripts/margin-report.mts`; check plan prices, credit packs, annual discount, overage, free-trial size, premium-tier pricing vs measured cost | Concrete numeric proposals with margin multiples |
| **Growth-for-revenue** | Upsell/expansion, dunning emails, win-back, annual plan push, referral, affiliate, usage-based top-up nudges (works with CEO retention roadmap, no UI edits) | Experiments ranked by expected MRR |
| **Implementer** | Executes the chosen item in code on a `cfo/*` branch with tests; swaps are one `models.ts` row + one adapter; keeps the 3x margin gate green | The PR |

Cheap-first rules: measured cost beats list price; every provider switch needs a
smoke run (`scripts/live-providers-smoke.mts`) before the PR is marked ready;
keep the old adapter as fallback behind env (`FAL_VIDEO_MODEL`-style).

## Thresholds that trigger a push notification

- Any plan or top-up below the 3x margin gate, or gross margin < 60 %
- MRR down week over week, or quick ratio < 1
- Failed payments / disputes spike; refund rate > 5 %
- A provider cheaper by ≥ 30 % with equal quality found
- Monthly fixed + variable cost > net revenue (cash negative)
- The routine could not read a data source (access lost)

Otherwise: silent, digest only in the PR / plan changelog.

## Data it needs (and current status)

| Source | Needed for | Status |
|---|---|---|
| Stripe (read-only, restricted key or MCP) | MRR, churn, fees, refunds | MCP configured but **needs OAuth** in claude.ai connector settings |
| Supabase (read-only, `render_jobs`, `credit_ledger`, subscriptions) | cost per video, usage | MCP in `.mcp.json` **failed to connect from the cloud sandbox** (proxy tunnel); fallback: `scripts/metrics-report.mts` pattern with a read-only DB URL secret |
| Vercel MCP | hosting spend, runtime errors | connected |
| fal.ai usage/billing | video spend | **no access yet**: add `FAL_KEY` (read) or paste monthly invoice |
| Anthropic Console usage, ElevenLabs usage | script/voice spend | **no access yet**: add admin/usage API keys as routine secrets |
| Other recurring bills (Sentry, Resend, domain, tools) | fixed costs | **ask owner**: put them in `docs/finance/fixed-costs.md` |

## Suggested connectors / tools / add-ons

- **Stripe MCP** (authorize) — MRR, subscriptions, invoices, disputes. Stripe Sigma/Revenue Recognition for cohorts once there are paying users.
- **Supabase MCP** with a read-only role (or a pooled read-only DB URL) — fix the cloud connection.
- **Vercel MCP** — already usable: `list_billing_charges`, `get_runtime_errors`.
- **Provider usage APIs** — fal, Anthropic Admin/usage, ElevenLabs usage as secrets.
- **Google Sheets/Drive connector** — a living P&L sheet the owner can read.
- **Slack or email connector** — digest and threshold alerts beyond push.
- **Billing/finance tools worth considering** — Baremetrics/ChartMogul/ProfitWell-style MRR (or Stripe Sigma alone), Helicone or Langfuse for LLM cost tracing, a prompt-cache audit for the Anthropic calls.
- Claude features: **Batch API** (50 % off non-interactive script jobs), **prompt caching**, Haiku-class model for simple steps.

## Questions for the owner (answer in the PR or `docs/finance/fixed-costs.md`)

1. Pre-tax margin target and monthly cash-out budget?
2. Fixed monthly bills not visible to the routine (tools, domains, ads, salaries)?
3. OK for the routine to auto-switch to a cheaper provider if smoke tests pass, or always ask?
4. Are real paying users live yet? (Until then it reports modelled, not measured, numbers.)
5. Annual-plan discount and promo policy limits?

## Routine setup (owner, one time)

Cloud routines are created in claude.ai, not from the repo. Create at
https://claude.ai/code/routines: name **Shortcraft CFO**, repo
`TudorFnsn/Shortcraft`, model Opus 5.5, daily 07:00 UTC (after the CEO), PR-gated,
connectors Stripe + Vercel + GitHub (+ Supabase when fixed), and paste the
prompt below. Then record its trigger id in `TheMasterPlan.md` §9.

### Routine prompt

> You are the Shortcraft CFO master agent (DM). Read `docs/routines/CFO-ROUTINE.md`,
> `TheMasterPlan.md` §7 and `src/config/{models,plans}.ts`. List open and recently
> closed PRs first. Compute the scorecard (MRR first), spawn the sub-agents in
> parallel, pick the single highest cash-return change, implement it on a `cfo/*`
> branch with tests, keep `assessMargins` green, update the plan changelog and open
> one PR. Never merge, never touch live secrets, never change live Stripe prices
> without owner approval. Send a PushNotification only for the thresholds in the
> doc or when a data source is unreachable; otherwise stay silent.
