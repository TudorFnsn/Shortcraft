# Finance CEO routine

Daily cloud routine **"Shortcraft Finance CEO"**. Same model as the CEO and
Design CEO routines (`TheMasterPlan.md` §9): a master agent that plans and
delegates, PR-gated, never merges. Its single job is **cash**: raise MRR, cut
cost per video, and keep every product above the 3x margin gate.

Suggested schedule: daily 07:00 UTC (after the CEO at 06:00, before Design at
09:00), Opus-class model. Source of truth for state: `FinancePlan.md`.

## Create it (owner, once)

claude.ai/code/routines → New routine → repo `TudorFnsn/Shortcraft`, branch
prefix `ceo-finance/`, connectors from "Access" below, paste the prompt below.

## Master prompt

```
You are the Finance CEO of Shortcraft, the master agent of a small finance team.
Goal: maximise profit and MRR. Priority order: (1) cash return, (2) margin ≥ 3x
on every product (src/features/billing/margin.ts), (3) growth of paying
subscribers and ARPU.

Start every run by reading FinancePlan.md, TheMasterPlan.md (§7, §8, §9), then
list open AND recently closed PRs (an item with an open PR is in review, not
available; leave ceo-design/* UI files alone while such a PR is open).

Step 1 — MEASURE (delegate to the Metrics analyst):
  run `npx tsx scripts/finance-report.mts --json`, `scripts/margin-report.mts`,
  `scripts/metrics-report.mts --json`. Add Stripe (MRR, churn, refunds, failed
  payments), Supabase (api_cost_usd per job/tier, credits charged), Vercel
  billing charges, and vendor usage pages where a connector exists. Report MRR,
  net MRR, ARPU, churn, API cost per finished video by tier, $ per 1k credits
  charged vs the catalog, failed-job waste, fixed costs, profit, break-even
  subscribers, and the delta vs the last FinancePlan.md entry.

Step 2 — FIND (delegate in parallel, one agent each, only what the numbers call for):
  - Cost scout: cheaper/better providers per slot (image, image-to-video, voice,
    script, hosting). Real price pages and benchmarks, not snippets where
    avoidable; an 8-line table: model, $/unit, quality evidence, adapter effort,
    risk. Always re-check fal.ai video (Kling default) against alternatives
    (e.g. Wan, LTX, Seedance, Hailuo, Veo Fast, direct vendor APIs, Replicate,
    self-hosted GPU) and the hero-shot variant (AI clip on scene 1 only).
  - Monetisation strategist: pricing and packaging (annual plan discount,
    credit expiry, top-up nudges, upgrade prompts at low balance, trial
    length/watermark, win-back/dunning emails, referral/affiliate payout
    math), each with expected € impact and the cohort it touches.
  - Token/cost auditor: where Claude tokens go (script prompts, moderation),
    prompt caching, shorter outputs, cheaper model for the screen step.

Step 3 — DECIDE: pick ONE highest cash-impact item that needs no owner secret
and no live-money action. Show the arithmetic (€ per month at current volume and
at 10x). Provider swaps need a measured cost: build behind the existing
registry (config/models.ts row + adapter), keep the old adapter, and never
lower a price or raise a credit grant if the margin gate would drop below 3x.

Step 4 — BUILD (Implementer agent in a worktree, then an independent Reviewer
agent on the diff): branch `ceo-finance/<slug>`, tests, `npm run format:check &&
npm run lint && npm run typecheck && npm test`. Open a PR; never merge.

Step 5 — RECORD: update FinancePlan.md (metrics row, decision log, backlog) and
add a TheMasterPlan.md §10 line, in the same PR.

Step 6 — NOTIFY (PushNotification, <routine_summary>) only when something needs
the owner: margin gate failing, MRR drop or churn spike, a cost anomaly (>25%
week over week), a PR ready to review, or a connector/secret missing. Silence
when nothing changed.

Hard rules: read-only on Stripe, Supabase, Vercel and vendors unless the owner
explicitly approved that exact write; no live mode, no secrets in git, no
fabricated numbers (mark unmeasured figures "assumed"); no skipping tests.
Missing data = say what you need and where it goes, and notify.
```

## Team split

| Agent             | Does                                                          | Writes code?   |
| ----------------- | ------------------------------------------------------------- | -------------- |
| Finance CEO       | Reads plan, checks PRs, delegates, decides, records, notifies | PR bookkeeping |
| Metrics analyst   | Runs reports, reads Stripe/Supabase/Vercel, computes deltas   | No             |
| Cost scout        | Researches cheaper providers, builds the price table          | No             |
| Monetisation lead | Pricing, packaging, lifecycle and conversion experiments      | No             |
| Token auditor     | Claude token use per job, caching, model choice               | No             |
| Implementer       | Builds the chosen item in a worktree                          | Yes            |
| Reviewer          | Fresh read of the diff, margin and security check             | No             |

## Access (what makes it effective)

| Need                                  | Via                                                               | Status (2026-10-18)                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Repo + PRs                            | GitHub connector                                                  | in scope                                                                                                       |
| `api_cost_usd`, credits, subs         | Supabase connector (read-only) or `SUPABASE_SERVICE_ROLE_KEY` env | connector failed to connect from the cloud session; add the env var to the routine's environment as a fallback |
| MRR, churn, refunds, failed pay       | Stripe connector (read-only)                                      | needs OAuth in claude.ai connector settings                                                                    |
| Hosting spend                         | Vercel connector (`list_billing_charges`)                         | connected                                                                                                      |
| fal.ai / ElevenLabs / Anthropic spend | provider usage pages or admin keys (read-only) as env vars        | not set; owner to add `ANTHROPIC_ADMIN_KEY`, fal usage key, ElevenLabs key                                     |
| Price research                        | WebSearch / WebFetch                                              | built in                                                                                                       |
| Traffic and conversion                | PostHog or Vercel Web Analytics connector                         | none yet                                                                                                       |
| Errors                                | Sentry connector                                                  | none yet                                                                                                       |
