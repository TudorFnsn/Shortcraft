# FinOps CFO routine

Daily cloud routine, same shape as the CEO and Design CEO routines (see `TheMasterPlan.md` §9): one **master agent** reads the numbers, decides what matters, and hands the work to four specialist subagents in parallel. Goal: **cash return** — more net cash per month, with the margin gate still passing.

Autonomy: **PR-gated** (branch `ceo-finops/*`). It may read anything it is connected to and open PRs. It never merges, never changes prices on live Stripe, never touches live secrets, never switches a production provider. Anything that spends or moves money needs the owner's explicit OK.

## Routine prompt (paste into the claude.ai routine)

> You are the Shortcraft FinOps master agent. Read `docs/routines/finops-cfo.md`, `TheMasterPlan.md` (§7 pricing, §8 risks, §9 runbook, §10 changelog) and `AGENTS.md`. Before anything else, list open and recently closed PRs; an item with an open PR is in review, not available.
>
> 1. **Measure.** Run `npx tsx scripts/finops-report.mts --json` (needs `.env.local`; if absent, use the Supabase connector with the read-only queries in §Data below) and `npx tsx scripts/margin-report.mts`. Note MRR, MRR ratio (API cost / MRR, target ≤ 33%), cost per video by tier, net cash.
> 2. **Dispatch in parallel** (one Agent call each, `.claude/agents/finops-*.md`): `finops-revenue`, `finops-cost`, `finops-vendor-scout`, `finops-pricing`. Give each the numbers from step 1 and only its slice. Do not do their research yourself.
> 3. **Decide.** Rank their proposals by monthly cash gained ÷ effort, and discard anything that fails the margin gate or cannot be measured. Pick at most one change to implement today.
> 4. **Implement** it on a `ceo-finops/<slug>` branch behind the existing ports (a new provider is one adapter + one `MODELS` row). Run `format:check`, `lint`, `typecheck`, `test`; the margin gate must pass. Open a PR. Update `TheMasterPlan.md` (§10 changelog, §7 if prices moved).
> 5. **Report.** Send a push notification only if: MRR ratio > 33%, MRR fell, a provider cost per video rose > 15% week over week, a cheaper vendor passes the quality bar, a data source stopped working, or a PR is waiting for the owner. Otherwise stay silent.

## Specialist subagents

| Agent                 | Owns                                                                                               | Output                                               |
| --------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `finops-revenue`      | MRR, churn, trial → paid, top-up share, ARPU, annual-plan and upsell levers                        | Ranked revenue ideas with expected € per month       |
| `finops-cost`         | Realised cost per video vs credits charged, failures, retries, hosting/DB/tool bills, wasted spend | Where cash leaks and the fix                         |
| `finops-vendor-scout` | Cheaper or better video/image/voice/LLM providers than fal.ai (Kling), FLUX, ElevenLabs, Sonnet    | Candidates with price, quality evidence, swap effort |
| `finops-pricing`      | Plan prices, credit scale, margin gate, trial burn, regional pricing                               | Price changes that keep ≥ 3x and raise revenue       |

## Data (what the routine can see)

- **Supabase** (connector, project `iqvrovjwoavvmhaithwn`, read-only selects): `subscriptions`, `render_jobs.api_cost_usd` / `actual_credits` / `model_tier`, `credit_transactions`.
- **Vercel** (connector): billing charges and usage per team. Last check (2026-10-17): `costs_not_found`, i.e. no charges yet (Hobby plan or no billable usage).
- **Stripe** (connector): needs the owner to authorise it in claude.ai connector settings. Until then MRR is computed from `subscriptions` × plan prices.
- **Not connected, needs an invoice or key from the owner:** fal.ai spend (usage API or monthly invoice), ElevenLabs plan and character usage, Anthropic usage (Console cost report), Resend, Sentry, domain, Supabase plan.

## Known gaps in the numbers

- `api_cost_usd` is our own estimate at list prices, not the provider invoice. Reconcile monthly; a gap means the catalog in `config/models.ts` is wrong.
- Failed jobs record cost 0 even if a provider charged for a clip before the failure.
- Fixed monthly costs are an input: `FIXED_MONTHLY_USD=… npx tsx scripts/finops-report.mts`.

## Snapshot, 2026-10-17 (production Supabase)

17 jobs: 11 standard done (avg $0.216, ~1.8k credits), 3 premium done (avg $1.92, ~42.6k credits), 3 failed. Total API cost $8.13 across 147,809 credits (≈ $0.055 per 1k credits). 2 live subscriptions. Premium is 71% of cost from 18% of videos.

## Ideas to evaluate first (unverified, from model knowledge; the scout must confirm prices and quality)

- **Video:** premium is the cost driver. Compare Kling on fal.ai against Wan, Seedance, Hailuo/MiniMax and LTX via fal, Replicate, or direct vendor APIs; hero-shot only (AI clip on scene 1, stills elsewhere, already modelled in §7); cache and reuse clips per theme.
- **Images:** FLUX schnell is already ~$0.003. Check whether a cheaper or self-hosted option beats it at our volume (probably not yet).
- **Voice:** ElevenLabs Flash is ~$0.00075/s, small. Watch custom-voice slots instead (plan upgrade cost).
- **LLM:** Sonnet 5.5 script at ~$0.04 per video. Haiku 5.5 for scripts with a quality check, and prompt caching on the static system prompt.
- **Revenue:** annual plans (2 months free) for cash up front, top-up nudges at low balance, trial-to-paid email timing, premium priced per clip instead of per second.
