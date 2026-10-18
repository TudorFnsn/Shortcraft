# FinancePlan — Shortcraft profit & cash return

> **Source of truth for the money track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`: the master plan wins on product and priority,
> this file wins on costs, pricing evidence and vendor choices. Every Finance PR
> updates this file (ledger + changelog) in the same change.
>
> Last updated: 2026-10-18 (track created; no measured data yet)

---

## 1. Charter (owner-configured 2026-10-18, do not change without Tudor)

| Question   | Owner's answer                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal       | **Maximum profit and fastest cash return.** Watch MRR, find revenue upside, cut cost per video, drop vendors that cost more than they earn.                                            |
| Scope      | Every payment in and out: Stripe revenue, per-video provider cost (fal.ai, Anthropic, ElevenLabs), hosting (Vercel, Supabase), email, errors, domains, ads.                            |
| Known pain | fal.ai (AI video) "seems expensive". Find cheaper/better video, image, voice and script options and prove them with numbers.                                                           |
| Autonomy   | **PR-gated.** Branches `ceo-finance/<slug>`; never merge; never touch live secrets, live Stripe or vendor accounts. Any spend, plan change or price change in Stripe needs Tudor's OK. |
| Cadence    | Weekly cloud routine **"Shortcraft Finance CEO"** (Mondays 07:00 UTC, after the main CEO). Notifies the owner only when something needs a decision or a number moved.                  |
| Output     | A digest (numbers + one recommendation) and at most one PR a run.                                                                                                                      |

### Rules

1. **Cash first, then margin, then growth.** Rank every idea by _expected € per month ÷ effort_, and say how confident the number is.
2. **Measure before you switch.** A price from a search snippet is a hypothesis (the 2026-10 price research disagreed by up to 2x). Switching a provider needs a measured run on real calls (`scripts/live-providers-smoke.mts`) and quality compared side by side.
3. **The margin gate stays the floor.** `features/billing/margin.ts` (3x on worst case) must pass after any change; the finance report adds the _measured_ multiple.
4. **Quality is a cost too.** A cheaper model that raises failures, refunds or churn is not cheaper. Compare cost per _finished, kept_ video.
5. **Never invent numbers.** Missing data goes to §5 (open questions) and to the owner, not into the report.
6. **Breakage is margin.** Unused credits are profit; don't "fix" low utilisation by giving credits away. Do check that unused credits don't create refund or chargeback risk.

---

## 2. How to measure (run first, every run)

```
npx tsx scripts/finance-report.mts          # table
npx tsx scripts/finance-report.mts --json   # for the digest
npx tsx scripts/metrics-report.mts --json   # north star, activation, trial -> paid
npx tsx scripts/margin-report.mts           # the 3x gate on catalog prices
```

The finance report is read-only. It needs `.env.local` with the Supabase URL and service-role key. In a cloud session without them, read the same tables with the Supabase connector (`render_jobs`, `credit_transactions`, `subscriptions`) and apply the formulas in `src/features/finance/unit-economics.ts` by hand.

Numbers it produces: MRR (list and net of VAT + Stripe fees), ARPU, 30-day cash revenue, measured API cost, cost per finished video per tier, API cost per 1,000 credits, credit utilisation, failed-job cost share, fixed-cost burn, profit, break-even subscribers.

**Tokens vs spend.** Anthropic usage is not stored per job today (only the summed `api_cost_usd`). Until a usage table exists, reconcile against the Anthropic Console / Usage API for the same window. Open item F3 adds per-provider cost columns so this stops being manual.

---

## 3. Cost map (where money leaves)

| Line                                | Driver                                                | Today (list/plan, unmeasured)     | Lever                                                            |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| fal.ai Kling video (Premium)        | ~$0.35 per 5s clip, ~$1.10 per 15s Premium video      | Biggest per-video cost            | Hero-shot only, cheaper model, batch/volume pricing, cache reuse |
| fal.ai FLUX images                  | $0.003 (schnell) / $0.025 (dev) per image             | Small                             | Fine as is; check schnell quality vs cost                        |
| ElevenLabs voice                    | Flash ~$0.05/1k chars + plan fee + custom-voice slots | Plan fee is fixed                 | Right-size plan; cache previews; cheaper TTS for Standard        |
| Anthropic script                    | ~$0.04 per script (Sonnet-class)                      | Small                             | Prompt caching, Haiku-class model, shorter prompts               |
| Render                              | in-house ffmpeg, ~$0.01                               | Small                             | Watch function duration cost on Vercel                           |
| Stripe                              | 1.5% + €0.25 (EEA) per charge                         | Fixed %                           | Annual plans cut the fixed fee; fewer small top-ups              |
| Vercel / Supabase / Resend / Sentry | Fixed monthly                                         | See `src/config/finance-costs.ts` | Stay on free tiers until a limit is hit                          |

Fixed costs in `src/config/finance-costs.ts` are **plan prices marked `unknown`** until Tudor supplies invoices (see §5).

---

## 4. Backlog (rank by €/month ÷ effort; each needs a measured number before it ships)

| ID  | Item                                                                                                                                                                                                                                                                                                                                       | Type               | Status           | Expected effect                              | Needs                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| F1  | Finance report + unit-economics module                                                                                                                                                                                                                                                                                                     | Tooling            | Built 2026-10-18 | Baseline for everything below                | none                                                                   |
| F2  | Real fixed costs in `finance-costs.ts`                                                                                                                                                                                                                                                                                                     | Data               | Blocked          | Honest profit and break-even                 | Tudor: vendor bills                                                    |
| F3  | Per-provider cost per job (`api_cost_usd` split into fal / anthropic / elevenlabs, plus token counts)                                                                                                                                                                                                                                      | Migration          | Idea             | Tokens vs spend without the Console          | Tudor applies migration                                                |
| F4  | fal.ai alternatives for Premium video: test candidates side by side on the same 10 prompts (cost, quality, failure rate, latency). Candidates to check, all **unverified**: Wan 2.x, LTX-2, Seedance, Hailuo, Veo 3.x Fast, Runway, Luma; direct provider APIs vs fal.ai markup; Replicate, Together, Runpod/Modal self-hosted open models | Research + adapter | Idea             | Cut Premium cost 30–70% if quality holds     | `FAL_KEY` plus a key per candidate, owner OK to spend a few € on tests |
| F5  | Hero-shot Premium (AI clip on scene 1 only) priced near Standard                                                                                                                                                                                                                                                                           | Pricing + pipeline | Idea             | ~$0.45 vs ~$1.10 per 15s video               | none to design; measured run to confirm                                |
| F6  | Annual plans (2 months free)                                                                                                                                                                                                                                                                                                               | Stripe             | Idea             | Cash up front, lower churn, fewer fixed fees | Tudor: Stripe prices                                                   |
| F7  | Price test: Starter €14.99 vs €19.99 on new signups only                                                                                                                                                                                                                                                                                   | Pricing            | Idea             | MRR per signup up if conversion holds        | Traffic first; owner approval                                          |
| F8  | Trial burn cap and abuse check (trial credits cost real money)                                                                                                                                                                                                                                                                             | Guardrail          | Idea             | Cuts acquisition cost                        | none                                                                   |
| F9  | Cheaper script model (Haiku-class) for Standard, Sonnet for Premium                                                                                                                                                                                                                                                                        | Adapter            | Idea             | Small, near-zero risk                        | Quality check                                                          |
| F10 | Prompt caching on the Anthropic script call                                                                                                                                                                                                                                                                                                | Adapter            | Idea             | Small                                        | none                                                                   |
| F11 | Failed-job cost: refund policy already refunds credits; find which step burns provider money before failing                                                                                                                                                                                                                                | Reliability        | Idea             | Cuts waste                                   | Needs data (F3)                                                        |
| F12 | Affiliate and ad CAC vs first-month net revenue                                                                                                                                                                                                                                                                                            | Growth             | Idea             | Stops bad spend                              | Ad data                                                                |

---

## 5. Open questions for the owner (the routine adds here; Tudor answers in a PR comment or the file)

1. **Vendor bills.** Last invoice amount for Vercel, Supabase, ElevenLabs, Resend, Sentry, domain, fal.ai, Anthropic (or a screenshot of each billing page). Needed for F2.
2. **Is Stripe live?** The connected account is the sandbox. MRR is only real once the live account is selling.
3. **Spend allowance** for provider tests (suggested: €10 per run, hard cap €30 per month).
4. **Keys for tests:** `FAL_KEY` (pending in the master plan) and, for F4, any alternative provider key you are willing to create.
5. **Ad spend and affiliate payouts**: are there any yet? If so, where are they reported?

## 6. Connectors and tools that would make this routine better

Already available: **GitHub** (repo), **Supabase** (read-only SQL on live data; failed to connect from the cloud session on 2026-10-18, retry or reauthorize), **Vercel** (billing charges, usage, runtime logs, observability), **Stripe** (**needs authorization**: claude.ai connector settings; keep it read-only/test until live).

Worth adding, in order of value:

1. **Stripe, authorized** with read access to live balance, subscriptions, invoices, refunds and disputes. This gives real MRR, churn and refunds instead of inferred ones.
2. **Anthropic Console usage/cost** (Admin API key, read-only) so token spend per model and workspace lands in the report.
3. **fal.ai usage/billing** (dashboard export or API key with usage scope) to reconcile `api_cost_usd` against real invoices.
4. **ElevenLabs usage** (subscription endpoint) for characters used against the plan, and custom-voice slot count.
5. **PostHog or Plausible** (privacy-friendly) for signup → paid funnels and CAC by channel.
6. **A spreadsheet or Notion/Drive connector** where Tudor keeps invoices, so the routine can read them without pasting.
7. **Sentry connector** to tie error spikes to wasted provider spend.

Cheap, non-connector helpers: Claude's `WebSearch`/`WebFetch` for price pages, the repo's `live-providers-smoke.mts` for measured runs, and a simple saved prompt set (`docs/finance/benchmark-prompts.md`, to be created with F4) so model comparisons are repeatable.

---

## 7. Run ledger (newest on top; one line per run: date, MRR, profit, multiple, decision)

- **2026-10-18** — Track created. No live metrics yet (cloud session had no database access). Built F1. (Finance CEO, interactive)

## 8. Changelog (newest on top)

- **2026-10-18** — `FinancePlan.md`, `scripts/finance-report.mts`, `features/finance/unit-economics.ts` (+4 tests), `config/finance-costs.ts`, routine prompt in `docs/routines/finance-ceo.md`. No migration, no dependency, no runtime change.
