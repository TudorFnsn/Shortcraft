# FinancePlan: Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine
> (`.claude/routines/finance-ceo.md`). Product and priority calls stay in
> `TheMasterPlan.md`; this file holds the numbers, the cost levers and the log.
>
> Created: 2026-10-18

## 1. Charter

Maximize **cash return**: MRR growth and gross margin, in that order of attention, while protecting the north star (weekly paying-retained creators). Cash comes before polish: a change that saves or earns money beats one that doesn't.

Hard limits (the routine never crosses these): the 3x margin gate (`assertMarginGate`), the AI label, prompt moderation, refund-on-failure, no dark patterns, no live-secret access, no live price/plan/Stripe changes without the owner, no merging.

## 2. Operating loop (master agent + specialists)

```
finance-ceo (master)
  ├─ unit-economics-analyst  cost per video, tokens/$ per tier, waste, margin by plan
  ├─ provider-scout          cheaper/better models and techniques (fal.ai vs others)
  ├─ revenue-growth          MRR, ARPU, trial→paid, churn, pricing, yearly plans
  └─ cost-auditor            Vercel, Supabase, Stripe fees, ElevenLabs, storage, egress
```

1. Gather numbers (`scripts/finance-report.mts --json`, `scripts/metrics-report.mts --json`, Stripe, Vercel, Supabase).
2. Fan out the four specialists in parallel, each with the numbers and one question.
3. Rank proposals by monthly cash impact × confidence ÷ effort; reject anything that breaks the limits above.
4. Ship at most one PR (`ceo-finance/*`); put owner decisions in the digest with a recommendation.
5. Update §3 to §5 and the log; notify only on the triggers in the routine prompt.

## 3. KPIs (update every run)

| KPI                                   | Value                                             | Source                     | As of      |
| ------------------------------------- | ------------------------------------------------- | -------------------------- | ---------- |
| MRR (Stripe)                          | not measured                                      | Stripe connector           | –          |
| MRR (internal, list price)            | not measured                                      | `finance-report.mts`       | –          |
| Paying subscribers                    | not measured                                      | `finance-report.mts`       | –          |
| API cost per 15s Standard video       | $0.037 (3 scenes, measured 2026-10-08)            | `render_jobs`              | 2026-10-08 |
| API cost per 30s Premium video        | $1.92 at catalog $0.12/s (true cost likely lower) | `render_jobs`              | 2026-10-08 |
| Fixed monthly cost                    | unknown                                           | owner, §4                  | –          |
| Monthly contribution (MRR − all cost) | unknown                                           | needs the three rows above | –          |
| Margin gate                           | Starter 9.4x, Pro 3.0x, Ultra 3.2x                | `margin-report.mts`        | 2026-10-05 |

## 4. Cost ledger (owner fills in; the routine cannot see invoices)

| Vendor                   | Plan / basis                                | $/month | Source                           |
| ------------------------ | ------------------------------------------- | ------- | -------------------------------- |
| Vercel                   | Hobby (decided 2026-10-11)                  | ?       | connector `list_billing_charges` |
| Supabase                 | Free (Pro-only features unavailable)        | ?       | dashboard                        |
| fal.ai                   | usage                                       | ?       | dashboard                        |
| Anthropic                | usage (Sonnet 5.5 scripts)                  | ?       | console                          |
| ElevenLabs               | plan + custom-voice slots                   | ?       | dashboard                        |
| Stripe                   | ~1.5% + €0.25 EU cards, plus Tax if enabled | ?       | dashboard                        |
| Resend / Sentry / domain | free tiers?                                 | ?       | dashboard                        |

## 5. Findings and lever list (seed from the 2026-10-18 setup run)

**Facts from the repo.** Standard (animated stills) costs ~$0.04 to $0.05 per video against 1,768 to 3,096 credits charged: the margin there is large. The money risk is **Premium**: $1.92 per 30s video at the catalog's conservative $0.12/s, Pro has zero headroom, and the true Kling bill is unmeasured. No token counts are stored; `render_jobs.api_cost_usd` is usage × list price, not invoices.

**Is fal.ai expensive?** Not at list price. fal's own guide shows Kling 2.5 Turbo Pro at about $0.07/s and LTX-2 at about $0.0018/MP; resellers quote Wan 2.5/2.6 at $0.07 to $0.15/s and Seedance 2.0 Fast at $0.09/s, so no alternative is clearly cheaper at equal quality and the sources disagree by 2x. The bigger lever is **how much AI video each Premium video uses**, not the vendor. (Search snippets, 2026-10-18; verify on vendor pages before acting.)

Ranked levers to test (provider-scout and unit-economics-analyst own the measurements):

1. **Hero-shot Premium** (AI clip on the hook scene, stills elsewhere): ~$0.45 vs ~$1.10 per 15s; frees Pro headroom or allows a cheaper Premium price.
2. **Measure real Kling cost** (owner runs `live-providers-smoke.mts --premium`, sends fal dashboard totals), then lower the catalog's $0.12/s if it is really ~$0.07/s: unlocks ~40% more Premium per plan or margin.
3. **Cheaper clip models for the non-hero scenes**: LTX-2 class (per-megapixel pricing) or Wan; run a ≤$5 A/B on quality.
4. **Script cost**: Haiku-class model or prompt caching for the fixed system prompt (script is ~$0.04 of a $0.04 to $0.05 Standard video, i.e. most of the Standard cost).
5. **Failed-job waste**: `finance-report.mts` shows dollars spent on jobs that were refunded; cut with earlier validation.
6. **Storage**: `media` bucket retention policy and the R2 move (already on the roadmap) before egress or free-tier limits bite.
7. **Revenue**: yearly plans (cash up front), trial-to-paid tuning, Stripe dunning/failed-payment recovery, affiliate at 30% only if margin allows. All need MRR and churn data first.

## 6. Access, blind spots and what to connect

| Source                                | Status (2026-10-18)                                                                                                                                                                | Unblocks                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| GitHub (this repo)                    | **connected**, read/write on `TudorFnsn/Shortcraft`                                                                                                                                | PRs, plan updates                               |
| Supabase connector                    | **connected** in claude.ai (the project-scoped `.mcp.json` server failed with a proxy error this run)                                                                              | `render_jobs`, `subscriptions`, usage, advisors |
| Vercel connector                      | **connected**                                                                                                                                                                      | billing charges, runtime logs                   |
| Stripe connector                      | **needs reconnect** (claude.ai → Settings → Connectors → Stripe → Reconnect)                                                                                                       | MRR, churn, trial conversion, fees, balance     |
| `.env.local` / service role           | **absent in cloud runs**: `finance-report.mts` cannot run there. Use the Supabase connector's read-only SQL with the same queries, or give the routine a read-only DB role (below) | the report script                               |
| fal.ai / Anthropic / ElevenLabs spend | **no connector.** Owner pastes monthly totals into §4                                                                                                                              | invoiced vs catalog cost                        |
| Fixed costs (§4)                      | unknown                                                                                                                                                                            | contribution and coverage                       |

Recommended additions:

- **Stripe, reconnected (read-only restricted key if offered):** the only way to see real MRR/churn.
- **Read-only Postgres role** for the routine (select on `render_jobs`, `subscriptions`, `credit_transactions`, `profiles`) so reports don't need the service role.
- **PostHog connector** once PostHog is wired (funnels, paywall hits, attribution by channel).
- **Firecrawl** (already connected, currently off for chat): turn it on so the provider-scout can read vendor pricing pages the sandbox network blocks.
- **Google Sheets/Drive** (optional): a shared cost ledger the owner can edit from a phone.
- **Anthropic Admin/usage API key** (read-only, in routine env) for token counts by model; until then token counts are a blind spot.
- Worth a look: Claude Code `/loop` for the weekly cash digest; the Anthropic Batch API (50% off) and prompt caching for the script step.

## 7. Open questions for the owner

1. Fixed monthly costs and the three provider totals for 2026-10 (§4).
2. Reconnect Stripe; add the live account at go-live.
3. Is a Premium **hero-shot** tier acceptable as the default Premium shape (TheMasterPlan §5, "Decide the Premium shape")?
4. May the routine open price/plan PRs (still owner-merged), or only report on them?
5. Schedule: daily 07:00 UTC is proposed; weekly may be enough until there are paying users.

## 8. Log (newest first)

- **2026-10-18** — Finance track created: charter, master + four specialist agents (`.claude/agents/`), routine prompt (`.claude/routines/finance-ceo.md`), `features/finance/unit-economics.ts` (MRR, cost per video by tier, waste, coverage; +4 tests) and `scripts/finance-report.mts` (read-only). Baseline MRR is **not measured**: Stripe needs reconnecting and this run had no database credentials. (Finance setup, scheduled run)
