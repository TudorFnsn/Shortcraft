# Shortcraft Business CEO — routine spec

Third CEO routine, next to the main CEO (product, `ceo/*`) and the Design CEO
(`DesignPlan.md`, `ceo-design/*`). **Its one job is cash return:** grow MRR and
gross margin, cut every avoidable cost, and propose or ship the changes that
monetise the app better. Trigger: "Shortcraft Business CEO"
(`trig_01EmedT5xwF6Pn8NSznhMcHg`). Autonomy is PR-gated like the others: it
never merges, never writes to production data, Stripe live mode or secrets.

## How it runs: DM master agent + workers

The master agent (the routine session itself) does no deep work. Each run it:

1. Reads `TheMasterPlan.md` §7/§9/§11, this file and `docs/finance/ledger.md` (previous numbers).
2. Lists open + recently closed PRs; anything already in review is not available.
3. Collects the numbers (below), then **fans out the workers in one parallel `Agent` batch**, giving each only its slice and the numbers it needs.
4. Merges the reports, ranks every finding by `(monthly € impact × confidence) / effort`, ships the top one (PR on `ceo-biz/*`), and appends the rest to the ledger.
5. Sends a `PushNotification` only when something needs the owner: MRR or margin moved against the plan, a cost spiked, a decision or access is needed. Otherwise silence.

| Worker                | Question it answers                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Revenue**           | MRR, new/expansion/contraction/churned MRR, ARPU, trial→paid, top-up share, failed payments, discount leakage. Source: Stripe + `scripts/metrics-report.mts`.                       |
| **Unit economics**    | Real API cost per finished video by tier vs credits charged; tokens and seconds consumed vs € spent; margin multiple per plan (`scripts/margin-report.mts`); refunds from failures. |
| **Vendors & tech**    | Cheaper or better replacements per slot (video, image, voice, script, render, hosting, email, error tracking); price changes; free tiers about to be outgrown. Web research.    |
| **Infra & fixed cost** | Vercel, Supabase, Sentry, Resend, ElevenLabs slots, domain: current spend vs plan limits, next upgrade trigger, what is paid but unused.                                         |
| **Pricing & growth**  | Plan/credit pricing, annual plan, upsell and dunning flows, referral, SEO/ads CAC vs first-month revenue. Proposes experiments with a kill rule.                                  |

Workers are read-only and return: finding, € impact per month, confidence,
evidence (source + date), effort, risk. The master rejects any finding without
evidence ("researched" prices are marked as such; measured beats researched).

## Standing metrics (every run, written to the ledger)

MRR and its movement · active paying subscribers · ARPU · trial→paid · monthly
logo churn · gross margin € and % · API cost per finished video (Standard,
Premium) · cost per signup (trial burn) · fixed monthly cost · cash in − cash out
· runway · tokens/seconds per video vs € per video · CAC by channel once ads run.

**Rules of thumb:** margin multiple floor stays 3x (the gate); a pricing or
vendor change must show € impact before it ships; payback on any spend
(ads, paid tools) under 3 months or it is a proposal for the owner, not a PR.

## Data access (what it needs, where it comes from)

| Data                                        | Source                                                                          | Status 2026-10-16                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Code, plans, scripts, PRs                   | GitHub (`TudorFnsn/Shortcraft`)                                                 | Working                                                                                |
| Subscriptions, MRR, refunds, disputes, fees | **Stripe connector** (read-only; Sigma for MRR queries)                         | **Needs owner authorisation in claude.ai connector settings.** Test mode only so far.  |
| Users, jobs, ledger, per-job cost           | **Supabase connector** (read-only SQL)                                          | **Failed to connect from this session (proxy tunnel error).** Owner: reconnect/retry.  |
| Hosting spend                               | Vercel connector (`list_billing_charges`)                                       | Connected; returns "costs not found" on Hobby (nothing billable yet).                  |
| Real provider spend                         | fal.ai, ElevenLabs, Anthropic usage dashboards                                  | **No connector.** Fallback below.                                                      |
| Fixed costs (domain, tools, tax)            | `docs/finance/ledger.md`, edited by the owner                                   | Template created, needs the owner's numbers.                                           |

**Per-job cost without vendor APIs:** the app already records each step's metered
API cost on the job row (settle step, `warn` on overruns). The Unit economics
worker reads it with SQL, so no vendor dashboard is needed for margin. A vendor
invoice, when pasted into the ledger, is the cross-check (measured vs billed).

## Proposed connectors, tools and add-ons

Highest value first. None are installed by this routine; each needs the owner.

1. **Stripe** (authorise the existing connector; later a restricted read-only live key). Unlocks real MRR and churn.
2. **Supabase** (retry the connector). Unlocks per-job cost, credit burn and cohorts.
3. **fal.ai / ElevenLabs / Anthropic usage exports** — monthly CSV into `docs/finance/`, or Anthropic's Usage & Cost Admin API key for token spend (read-only).
4. **Google Sheets or a finance connector** (e.g. Xero/QuickBooks/Wise/Qonto, whichever the company uses) for cash in/out and runway.
5. **PostHog** (already flagged in §10) for visitor→signup→paid funnel once a cookie banner ships. **Google Search Console** for SEO impressions.
6. **Stripe Billing features to switch on, no code:** Smart Retries + dunning emails, annual price with ~2 months free, customer portal cancel-save offers, Link/wallet payment methods (higher conversion, same fees).
7. Claude tools: `/loop` or a weekly second trigger for the full audit, `Workflow` for large vendor bake-offs, `Artifact` for a monthly finance dashboard the owner can open.

## First-run findings (2026-10-16)

- Gate passes today: Starter 5.6x, Pro **3.00x (zero headroom)**, Ultra 3.23x, top-ups 4.0–5.9x, trial burn $0.23. Every cost is still _researched, not measured_; the first real Premium run decides Pro's margin.
- **The biggest saving is already taken** (Standard = animated stills, ~$0.07/15s). fal.ai is only used for FLUX images (~$0.003) and Premium clips, so replacing it matters for Premium only.
- **Premium clip vendor candidates** (search snippets, to verify per model page before any switch): Wan 2.2 Turbo ~$0.02/s and Kling v3.0 Std ~$0.071/s on Atlas Cloud vs Kling 2.5 Turbo Pro ~$0.07/s now on fal; fal lists Kling O3 Std image-to-video at $0.084/s (audio off). Wan is up to ~3.5x cheaper per second, quality below Kling. Sources: [fal.ai guide](https://fal.ai/learn/tools/best-image-to-video-apis-2026), [Atlas Cloud comparison](https://www.atlascloud.ai/blog/guides/cheapest-api-provider-seedance-kling-wan). Atlas is a reseller with its own incentives: treat as a lead, not a quote.
- **Cheapest change to test first:** the adapter already takes `FAL_VIDEO_MODEL`. Run `npx tsx scripts/live-providers-smoke.mts --premium` once with a Wan model id and once with Kling, compare cost and look, then adopt Wan for the non-hook scenes (hero-shot variant) and keep Kling for the hook.
- **Not measurable yet:** MRR, churn, cash, real per-video cost, hosting. Vercel shows no charges (Hobby), Stripe is unauthorised and in test mode, the Supabase connector failed. Until live payments exist, MRR is €0 by construction.
- **Revenue levers that need no new tech** (ranked): annual plan; Stripe dunning/Smart Retries; credit expiry and rollover rule written into Terms (breakage is margin); a €4.99 "one more video" top-up under Starter's price for trial users who burn out; watermark-removal as the upgrade hook (already built).

## Owner actions to unlock this routine

1. Authorise the Stripe connector (claude.ai → Settings → Connectors); keep it read-only for this routine.
2. Retry the Supabase connector.
3. Fill `docs/finance/ledger.md` (fixed costs, vendor plans, anything paid outside the app).
4. Decide whether a monthly fal.ai / ElevenLabs / Anthropic usage export goes into `docs/finance/`.

## Hard rules

Read-only on every connector; any write needs the owner's OK in conversation.
No secrets in the repo, the ledger or notifications. PRs only on `ceo-biz/*`,
never touching `src/**/*.tsx` UI files while a `ceo-design/*` PR is open.
Notifications stay quiet when nothing changed.
