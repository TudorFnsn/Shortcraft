# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md` (which wins on product and priority). Every
> finance PR updates this file (metrics log + backlog) in the same change.
>
> Last updated: 2026-10-19 (routine defined, first baseline pending live data)

---

## 1. Charter (owner request, 2026-10-19)

Maximise profit and cash return. Every run: check the MRR picture, find what
costs more than it should, find what could earn more, and ship or propose the
best change. Prioritise cash in over polish.

## 2. How the routine works

A **master agent** (`.claude/agents/finance-cfo.md`) reads this file, gathers the
numbers once, then dispatches sub-agents **in parallel** and merges the result:

| Agent                     | Job                                                                         |
| ------------------------- | --------------------------------------------------------------------------- |
| `finance-cfo` (master)    | Gather data, dispatch, rank by $/month, decide, report                      |
| `finance-revenue-analyst` | MRR, churn, trial → paid, ARPU, pricing/packaging ideas                     |
| `finance-cost-analyst`    | Cost per video, tokens/credits vs dollars, hosting + SaaS bills, waste      |
| `finance-vendor-scout`    | Cheaper/better providers and techniques (video, image, voice, LLM, hosting) |
| `finance-implementer`     | Builds ONE approved, small change on a `ceo-finance/*` branch with tests    |

Cadence: daily, **07:00 UTC** (after the main CEO at 06:00; before Design at 09:00).
Model: Opus. Create it at https://claude.ai/code/routines with the prompt in §9.

## 3. Autonomy and rules

- **PR-gated.** Branches `ceo-finance/<slug>`. Never merge, never touch live secrets.
- **Read-only on money systems.** Stripe, Supabase, Vercel: reads only. Any write
  (migration, price/product change, live mode, plan change) needs the owner's OK.
- **Prices are the owner's call.** The routine proposes with numbers; it never edits `plans.ts` prices.
- **The 3x margin gate stays.** `npx tsx scripts/margin-report.mts` must pass on any PR. Provider swaps change defaults only after a **measured** cost (`scripts/live-providers-smoke.mts`), never on list prices alone.
- Before picking work: list open + recently closed PRs; an open `ceo-finance/*` PR means the item is in review.
- One code change per run at most. Everything else goes to §7 as a ranked proposal.
- Label unverified prices (aggregator/vendor-written) as such; prefer official pages.

## 4. Data access

| Source                                   | What it gives                                                                      | Status                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npx tsx scripts/finance-report.mts`     | MRR, net revenue, API cost by tier, free-user and failed-job burn, margin multiple | built; needs `.env.local` (Supabase URL + service role)                                          |
| `npx tsx scripts/margin-report.mts`      | Worst-case price gate                                                              | works with no secrets                                                                            |
| `npx tsx scripts/metrics-report.mts`     | Activation, trial → paid, retention                                                | needs `.env.local`                                                                               |
| Stripe connector                         | Real MRR, churn, refunds, disputes, fees (Sigma)                                   | **needs OAuth in claude.ai connectors**; account is sandbox, so figures are test data until live |
| Supabase connector                       | Same data as SQL, no local secrets                                                 | configured in `.mcp.json`; was unreachable from the first cloud session (proxy error)            |
| Vercel connector                         | Usage, billing charges (`list_billing_charges`), runtime errors                    | attached in the first session                                                                    |
| fal.ai / ElevenLabs / Anthropic consoles | Invoices, usage by model                                                           | **no connector**: owner pastes a monthly export into §6 (or provides read-only usage keys)       |

Gaps to close (see §5): per-provider and per-token cost are not stored, only
`render_jobs.api_cost_usd` per job.

## 5. Information the routine needs from the owner

1. Real monthly bills: Vercel plan, Supabase plan, ElevenLabs plan (and custom-voice slots), Resend, Sentry, domain, any other SaaS. Paste into §6 once, then on change.
2. Whether Stripe live mode is on, and the first live numbers (the sandbox shows none).
3. A read-only usage export (or API key) from fal.ai, ElevenLabs and the Anthropic console, monthly.
4. Target: break-even date, monthly profit goal, and max acceptable free-trial burn per signup.
5. Permission to apply a migration that stores per-provider cost and tokens per job (proposed in §7, item 2).

## 6. Metrics log (newest on top; the routine appends a row each run)

| Date       | MRR gross € | Net revenue 30d $ | API cost 30d $ | Revenue / cost | Notes                                                                                                           |
| ---------- | ----------- | ----------------- | -------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-10-19 | n/a         | n/a               | n/a            | n/a            | No live data reachable yet (no `.env.local`, Stripe unauthorised, Supabase connector failed). Static gate only. |

Fixed costs (owner to fill): _unknown_.

## 7. Backlog (ranked by expected $/month; the routine reorders it)

1. **Measure real provider cost** with `live-providers-smoke.mts` (Kling, FLUX, ElevenLabs, Claude). Everything below is guesswork until this exists. _Owner: run once with live keys._
2. **Store cost per step** (provider, units, tokens in/out, USD) in a `job_costs` table so tokens-vs-dollars and per-provider spend are queryable. Needs a migration (owner OK).
3. **Premium video price check.** Kling 2.5 Turbo Pro is ~$0.07/s list but the catalog assumes $0.12/s conservative. Measure; if confirmed, Pro margin rises from the 3.00x floor, which allows more credits per plan or a lower Premium credit price.
4. **Hero-shot Premium** (AI clip on scene 1 only, stills for the rest): ~$0.45 per 15s vs ~$1.10. Candidate for a cheaper Premium tier that still looks like video.
5. **Cheaper video model scouting** (unverified, from search snippets 2026-10-19; check official pages): fal.ai's own roundup lists Grok Imagine Video ~$0.07/s with audio and Kling 2.6 Pro ~$0.14/s; Atlas Cloud lists Wan 2.7 ~$0.10/s and Seedance 2.0 ~$0.127/s versus fal's ~$0.30/s for Seedance 2.0. Replicate and LTX prices were not found. Resolution and audio differ, so compare like for like. Sources: https://fal.ai/learn/tools/best-image-to-video-apis-2026 and https://www.atlascloud.ai/blog/case-studies/Top-5-ai-video-apis-compared-speed-latency-and-cost-per-second-2026
6. **Script step**: ~$0.04 per video on Sonnet 5.5. Check prompt caching on the fixed system prompt and whether a smaller Claude model passes quality; small absolute saving, low risk.
7. **Free-trial burn**: trial is 3,000 credits (~$0.25 at the gate). Watch signup → paid; cap Premium for trial users if burn grows.
8. **Revenue ideas to evaluate**: annual plans (cash up front, lower churn), credit expiry/rollover policy, top-up upsell at low balance, affiliate payout math (30% recurring in the master plan), watermark removal as a small add-on.

## 8. Reporting

- Each run ends with a digest: MRR, net revenue, API cost, margin multiple, top 3 ranked items, what needs the owner.
- **Notify (PushNotification) only when** MRR drops, revenue/cost falls under 3x, daily API cost spikes, a cheaper provider saves more than the owner-set threshold, a PR is ready for review, or the routine could not reach its data. No notification on "nothing changed".

## 9. Routine prompt (paste into claude.ai/code/routines)

> You are the Shortcraft Finance CFO routine. Act as the `finance-cfo` master agent
> defined in `.claude/agents/finance-cfo.md`. Read `FinancePlan.md` and `TheMasterPlan.md` §7
> first and follow FinancePlan §3 rules (PR-gated, read-only on money systems, 3x margin gate).
> Gather numbers once, dispatch the revenue, cost and vendor sub-agents in parallel, merge into
> a ranked list by $/month, implement at most one small item via `finance-implementer` on a
> `ceo-finance/*` branch, update FinancePlan §6/§7 and the TheMasterPlan changelog, and send
> the digest. Notify per FinancePlan §8. Repo: TudorFnsn/Shortcraft. Connectors: GitHub, Supabase, Stripe, Vercel.

## 10. Suggested connectors and tools

- **Stripe** (authorise it): real MRR, churn, refunds, Sigma queries. Highest value.
- **Supabase** (fix the connection): direct read of jobs, subscriptions and the ledger.
- **Vercel**: billing charges and usage; already attached.
- **Sentry**: failed-render cost leaks (retries that burn provider money).
- **Google Sheets / Drive** connector: a place for the owner's monthly bill export and a running P&L.
- **Slack or email** connector: so the digest lands where the owner reads it (PushNotification already covers urgent items).
- Skills: `xlsx` for a monthly P&L workbook, `dataviz` for the cost/margin charts.
