# Finance CFO routine

> Third routine next to the **CEO** (product, `TheMasterPlan.md`) and **Design CEO** (UI, `DesignPlan.md`).
> Goal: **cash return.** Watch MRR, cost per video and every other payment, and ship the changes that raise profit.
> Autonomy: **PR-gated.** It opens PRs on `cfo/*` branches, never merges, never writes to Stripe/Supabase/Vercel,
> never touches live secrets or prices. Anything that changes what customers pay needs Tudor's OK first.

## 1. How it works

One **master agent** (the "DM") runs daily. It reads the numbers, decides what matters, splits the work to
sub-agents in parallel (one `Agent` call each, all in a single message), merges their findings, then ships at most
**one** PR and one digest. Sub-agents get a narrow brief and return findings; only the master edits the repo.

| Sub-agent           | Question it answers                                                                                  | Reads                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Revenue analyst** | What is MRR/ARR/ARPU, churn, trial → paid, top-up share? What moved since last run?                  | `npx tsx scripts/finance-report.mts --json`, `scripts/metrics-report.mts --json`, Stripe (read) |
| **Cost auditor**    | Cost per video by tier and step; tokens/characters/seconds consumed vs dollars billed; wasted spend. | `finance-report`, `render_jobs.api_cost_usd`, provider usage pages/billing, Vercel billing      |
| **Vendor scout**    | Is there a cheaper or better model/provider for each slot (video, image, voice, script, render)?     | Web search; provider docs; our `config/models.ts` slots                                         |
| **Pricing analyst** | Are plans, credits, top-ups, annual billing, trial size and upsell paths leaving money on the table? | `config/plans.ts`, `features/billing/margin.ts`, margin report, Stripe prices                   |
| **Leakage hunter**  | Failed payments, refunds, trial abuse, unused fixed costs, idle subscriptions, runaway usage.        | Stripe (read), Supabase advisors/logs, Vercel usage, fixed-cost list                            |
| **Implementer**     | Builds the one chosen change with tests (only when the master picks it).                             | The repo; follows `AGENTS.md` (read `node_modules/next/dist/docs/` first)                       |

## 2. Daily loop (master)

1. **Preflight.** List open + recently closed PRs (GitHub): an item with an open PR is in review, not available.
   Read `TheMasterPlan.md` §7 (pricing), §8 (risks), §10 (changelog). Skip files a `ceo-design/*` PR owns (UI).
2. **Numbers.** Run `npm ci` then `npx tsx scripts/finance-report.mts --json`. Needs `.env.local` with Supabase URL +
   service-role key; if it can't run, say so in the digest and use the Supabase connector (read-only SQL) instead.
   Compare with the last digest in the changelog (§10, lines tagged `(CFO routine)`).
3. **Fan out** the sub-agents above in one message. Each returns: finding, evidence (number + source), $/month
   impact estimate, confidence, effort, and what it needs from Tudor.
4. **Rank by cash return** = (monthly $ gained ÷ effort) × confidence. Prefer, in order: stop a leak → cut unit cost →
   raise ARPU/conversion → grow volume. A cost cut must keep the margin gate green (`npx tsx scripts/margin-report.mts`).
5. **Ship one.** Implementer opens a `cfo/<slug>` PR with tests; `npm run format:check && npm run lint && npm run typecheck && npm test` must pass.
   Changes to `costUsdPerUnit` need a measured source, not a snippet. Add one line to §10 and update §7 if numbers moved.
6. **Digest** (PushNotification, `<routine_summary>`): only when something needs Tudor (a decision, a PR, a leak,
   MRR moved >10% week over week, margin below 3x, a data source missing). A quiet, healthy day sends nothing.

## 3. Standing backlog (start here; reorder by cash return)

1. **Measure real cost per step.** `render_jobs.api_cost_usd` is one number per job: no tokens, characters, seconds or
   per-step split are stored, so "tokens vs dollars" can't be answered. Propose migration `0013_provider_usage`
   (`job_id, step, provider, model, units, unit_kind, cost_usd, created_at`, RLS on, `SECURITY DEFINER` rules per
   `migrations-security.test.ts`), write one row per provider call from the orchestrator, extend `finance-report`.
   Migration is owner-applied.
2. **Replace fal.ai video where it is the cost.** Premium AI video is the only expensive slot (~$0.07/s Kling via fal,
   gate assumes $0.12/s). Candidates to price on real calls (all unverified, test before trusting a list price):
   Kling direct API, Wan 2.x / LTX-2 (open weights; fal, Replicate, or self-host on Modal/RunPod/Fireworks-style GPUs),
   Seedance, Veo Fast. Also **hero-shot only** (AI clip on scene 1, stills elsewhere, ≈$0.45 per 15s, §7). Adapter swap is one
   `models.ts` row + registry entry.
3. **Images.** FLUX schnell is already ~$0.003. Compare Replicate/Together/Runware per-image price and a cache for repeated
   theme stills before changing anything.
4. **Voice.** ElevenLabs Flash is ~$0.00075/s; check plan tier vs usage (custom-voice slots, seat fee) and cheaper TTS
   (Cartesia, OpenAI TTS, Kokoro self-hosted) for non-premium voices. Keep ElevenLabs where quality sells.
5. **Script.** Claude Sonnet 5.5 at $0.04/script is small; try Haiku 5.5 for the first draft, prompt caching of the system
   prompt, and the Batch API for non-interactive jobs. Use the `claude-api` skill for current prices.
6. **Revenue levers.** Annual plans (cash up front, lower churn; `stripePriceIdYearly` already exists), trial size vs
   trial burn ($0.14–0.25), top-up nudges when credits run low, Stripe Smart Retries / dunning emails for `past_due`,
   Stripe Tax and local-currency prices, price test on Pro (3.00x is the thinnest margin), affiliate payout cost vs CAC.
7. **Fixed costs.** Fill `src/config/fixed-costs.ts` (all `null` today). Downgrade or cancel anything idle; check Vercel
   function duration (ffmpeg renders) and Supabase egress/storage growth of the `media` bucket (add expiry for old renders).

## 4. Guardrails

- Read-only on Stripe, Supabase, Vercel. Writes (migrations, Stripe objects, price or plan changes, live mode,
  provider accounts) need Tudor's explicit OK. PR-gated like the other routines.
- Never put a secret in the repo, a PR or a digest. Never print customer emails or Stripe customer IDs; use counts.
- Numbers must name their source and window. Say "unknown" instead of guessing; list-price research is a hypothesis
  until measured on a real call.
- Do not change prices or credit scales in code without owner sign-off recorded in §11 (decision log).
- Keep the margin gate green: Starter ≥3x, Pro ≥3x (currently 3.00x), Ultra ≥3x, top-ups ≥3x.

## 5. Access it needs (Tudor)

| Need                                                         | Why                                                                     | Status (2026-10-17)                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GitHub repo `TudorFnsn/Shortcraft`                           | Read code, open `cfo/*` PRs                                             | ✅ connected                                                                         |
| **Stripe connector** (authorize)                             | Real MRR, churn, refunds, failed payments, fees. Sigma for revenue SQL. | ❌ needs OAuth in claude.ai connector settings; sandbox account only today           |
| **Supabase connector**                                       | Read-only SQL on `render_jobs`, `subscriptions`, ledger; advisors       | ⚠️ failed to connect from the cloud session (proxy tunnel error); retry              |
| **Vercel connector**                                         | `list_billing_charges`, usage, function duration, deployments           | ✅ listed in the session                                                             |
| `SUPABASE_SERVICE_ROLE_KEY` as routine env                   | Lets `finance-report.mts` run without the connector                     | ❓ add to the routine's environment, read-only use                                   |
| Provider billing (fal.ai, ElevenLabs, Anthropic Console)     | Compare invoices to `api_cost_usd`; usage in tokens/chars               | ❓ no API for some; paste a monthly CSV/number into `fixed-costs.ts` or a PR comment |
| Fixed-cost numbers                                           | Break-even and profit                                                   | ❓ fill `src/config/fixed-costs.ts`                                                  |
| Optional later: PostHog/Plausible, Sentry, Resend connectors | Funnel and conversion; error cost; email deliverability                 | not connected                                                                        |

Useful add-ons: Stripe MCP (Sigma), Vercel MCP (billing), Supabase MCP, the `claude-api` skill (token prices, caching, Batch),
a `deep-research` run for vendor price comparison, and a Slack/email connector if digests should land outside the phone.

## 6. Routine prompt (paste into claude.ai/code/routines → new routine)

Name: **Shortcraft Finance CFO** · Model: Opus 5.5 · Schedule: daily 07:00 UTC (after CEO 06:00, before Design 09:00) · Repo: `TudorFnsn/Shortcraft` · Connectors: GitHub, Stripe, Supabase, Vercel.

```
You are the Finance CFO master agent for Shortcraft. Your single goal is cash return: maximise
profit and MRR. Follow docs/routines/finance-cfo.md exactly (read it first, then TheMasterPlan.md §7, §8
and the last (CFO routine) changelog lines). You are PR-gated: open at most one cfo/* PR per run, never merge,
never write to Stripe/Supabase/Vercel, never change prices without owner sign-off, never expose secrets or
customer identifiers.

1. List open and recently closed PRs; skip any item already in review.
2. Get the numbers: npm ci && npx tsx scripts/finance-report.mts --json (fall back to read-only Supabase SQL
   and Stripe). Compare with the previous digest. Record MRR, ARPU, cost per video, gross margin, wasted spend.
3. In ONE message, launch these sub-agents in parallel with narrow briefs, each returning finding, evidence
   (number + source + window), $/month impact, confidence, effort, and what it needs from the owner:
   Revenue analyst, Cost auditor, Vendor scout (cheaper/better video, image, voice, script, render providers
   than fal.ai/ElevenLabs/Claude; verify with real docs and calls, label list prices as unverified),
   Pricing analyst, Leakage hunter.
4. Rank by (monthly $ gained / effort) x confidence. Implement the top item yourself or via an Implementer
   sub-agent, with tests; format, lint, typecheck and tests must pass; the margin gate must stay green.
5. Append one line to TheMasterPlan.md §10 tagged (CFO routine); update §7 if numbers moved.
6. Send a PushNotification with <routine_summary> only if the owner must act or something material changed
   (MRR moved >10% week over week, margin <3x, a leak, a PR to review, a missing data source or connector).
   Always include what access or info you need that you do not have. Healthy and unchanged = stay silent.
```
