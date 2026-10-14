# FinancePlan — Shortcraft profit track

> **Source of truth for the money track.** Owned by the **Finance CEO** routine
> (a DM-style master agent that splits work across sub-agents, like the CEO and
> Design CEO routines). `TheMasterPlan.md` wins on product and priority; this
> file wins on cost, pricing and cash. Every finance PR updates this file
> (baseline + changelog) and adds one line to `TheMasterPlan.md` §10.
>
> Last updated: 2026-10-14

---

## 1. Charter (proposed 2026-10-14, owner to confirm)

| Question  | Answer                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goal      | Maximise **cash return**: net MRR minus API, hosting and tool spend, with the margin gate (≥ 3x worst case) kept green.                                                                          |
| Autonomy  | **PR-gated**, same as the CEO routine. Branches `ceo-finance/<slug>`; never merges; never touches live secrets, live Stripe, prices a customer sees, or provider accounts without owner's OK.    |
| Cadence   | Daily cloud routine **"Shortcraft Finance CEO"**, 07:00 UTC (after the 06:00 CEO, before the 09:00 Design CEO). Weekly deep pass on Mondays (full vendor re-price). Pause nothing: it is cheap.  |
| Scope     | Pricing, plans, credits scale, provider choice and cost, hosting/tool spend, churn/ARPU levers, new monetisation (yearly plans, affiliate, add-ons). Not UI redesign (Design CEO owns it).       |
| Conflicts | Touches `src/config/{models,plans}.ts`, `features/billing`, `features/providers`. Leaves UI files alone while a `ceo-design/*` PR is open. Lists open + recently closed PRs before picking work. |
| Evidence  | **Measured beats researched.** Prices from search snippets disagree by up to 2x (MasterPlan §7). A provider swap is only proposed with a measured cost per video from a real call.               |

## 2. Metrics it checks every run

1. **MRR ratio:** net MRR ÷ (realised API cost + fixed costs), trailing 30 days. Healthy ≥ 3x; below 2x is an alert.
2. **Gross MRR, paying subscribers, ARPU, churn**, plus trial → paid (from `metrics-report`).
3. **Cost per finished video by tier** (`render_jobs.api_cost_usd`) vs credits charged; **cost of failed jobs** (money burned, nothing delivered).
4. **Token/usage vs spend:** Anthropic tokens per script (and cache hit rate), ElevenLabs characters per video, fal.ai seconds/megapixels per video, against the invoices.
5. **Fixed costs:** Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domain, Stripe fees.
6. **Margin gate:** `npx tsx scripts/margin-report.mts` (must PASS).

Scripts: `scripts/finance-report.mts [--fixed=<usd/mo>] [--json]` (read-only: MRR, 30d API cost, margin multiple, per-tier cost), `scripts/margin-report.mts`, `scripts/metrics-report.mts`.

## 3. Master agent and sub-agents

The master agent never researches or edits itself: it reads this file, the three reports and the open PRs, then fans out, then merges findings into one PR and one digest.

| Sub-agent              | Job                                                                                                                                                                     | Tools                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Ledger analyst**     | Run the three reports; read Stripe (balance, invoices, MRR, refunds, disputes, failed payments) and Supabase (`render_jobs`, `credit_transactions`); compute section 2. | Stripe + Supabase connectors (read-only), scripts |
| **Vendor scout**       | Re-price video, image, voice and LLM vendors (fal.ai vs direct vendor APIs, Replicate, Runware, WaveSpeed, Together, DeepInfra...). Cite page + date.                   | WebSearch, WebFetch                               |
| **Cost engineer**      | Turn findings into code: adapters behind existing ports, caching, batching, cheaper tier routing, fewer retries. Run the margin gate before and after.                  | Repo, vitest                                      |
| **Pricing strategist** | Plans, top-ups, yearly discount, credit scale, annual-prepay cash timing, affiliate economics, anything that raises ARPU or cuts churn.                                 | Reports, repo                                     |
| **Infra auditor**      | Vercel (function duration, bandwidth, image optimisation), Supabase (egress, storage, retention of old media), Resend, Sentry quotas: what to downgrade, prune, cache.  | Vercel + Supabase connectors (read-only)          |
| **Skeptic**            | Tries to break each proposal (quality loss, lock-in, margin at the worst shape, Stripe/VAT effects). Anything it can't answer stays a proposal, not a PR.               | Read-only                                         |

## 4. Idea backlog (hypotheses, not decisions: each needs a measured number)

**Provider cost** (the biggest lever; fal.ai image + Premium clips are the variable spend)

- [ ] Measure real cost per Standard and Premium video from `api_cost_usd` (MasterPlan §7 says "to be measured").
- [ ] Price-compare the Premium clip model: Kling 2.5 Turbo on fal.ai vs Kling direct API, LTX-2 Fast, Wan 2.5, Seedance. Keep fal.ai as the router if the saving is under ~15%: swapping costs engineering time.
- [ ] **Hero-shot Premium** (AI clip on scene 1 only, stills elsewhere): already modelled at ≈ $0.45 per 15s; ship it as the default Premium and make full-AI "Ultra" opt-in.
- [ ] Image model: FLUX schnell vs cheaper hosts; cache and reuse images for repeated themes; smaller resolution where Ken Burns crops anyway.
- [ ] Script LLM: Haiku-class model for the script step, prompt caching for the fixed system prompt, structured output to avoid retries; compare token spend per script.
- [ ] Voice: ElevenLabs Flash vs cheaper TTS for Standard, keep ElevenLabs for Premium/designed voices; watch the custom-voice slot count.
- [ ] Never bill for failed jobs' provider calls twice: check retry paths, and stop the pipeline early on a failed moderation/scene step.

**Revenue**

- [ ] Yearly plans (cash up front, lower churn); Stripe price IDs exist as nulls in `plans.ts`.
- [ ] Credit expiry/rollover policy (unused credits are pure margin; check EU consumer-law fit before changing).
- [ ] Top-up nudges at low balance (lifecycle email exists), and "finish this video" upsell from a blocked Premium request.
- [ ] Affiliate programme (30% recurring is the MasterPlan §6 guess; model payback first).
- [ ] Add-ons: priority queue, extra saved voices, brand kit, watermark-free exports as a paid add-on.
- [ ] Reduce involuntary churn: Stripe Smart Retries, dunning emails, card-updater.

**Fixed cost**

- [ ] Right-size ElevenLabs plan, Supabase and Vercel tiers to actual usage; prune old media in Storage (retention policy).
- [ ] Trial burn (acquisition cost per signup, currently ~$0.25 on paper): measure real, cap abuse (one trial per device/card).

## 5. Baseline (fill in on the first real run)

| Date | Subscribers | Gross MRR | Net MRR | API cost 30d | Fixed 30d | Margin multiple | Cost per Standard video | Cost per Premium video |
| ---- | ----------- | --------- | ------- | ------------ | --------- | --------------- | ----------------------- | ---------------------- |
| –    | –           | –         | –       | –            | –         | –               | –                       | –                      |

Status 2026-10-14: the first report could not run from the cloud session (Supabase connector failed to connect, `.env.local` is not present). The owner pastes the first run of `scripts/finance-report.mts --fixed=<usd>` here.

## 6. Access the routine needs (what to connect)

| Need               | Why                                                                   | Status                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo        | Branches, PRs, read code                                              | In scope (`tudorfnsn/shortcraft`)                                                                                                                                     |
| Stripe connector   | MRR, invoices, refunds, disputes, failed payments (**test mode now**) | Connected (sandbox). Needs the live account, read-only restricted key, before launch                                                                                  |
| Supabase connector | `render_jobs.api_cost_usd`, credits ledger                            | Configured; **failed to connect in the 2026-10-14 cloud session** (ERR_PROXY_TUNNEL). Re-authenticate, and allow `mcp.supabase.com` in the environment network policy |
| Vercel connector   | Billing charges, function usage, bandwidth                            | Connected (`list_billing_charges`, runtime logs)                                                                                                                      |
| Fixed-cost sheet   | ElevenLabs/Resend/Sentry/domain bills aren't in any API we have       | **Owner:** paste the monthly amounts into section 5, or add a Google Sheet connector                                                                                  |
| Provider usage     | fal.ai, Anthropic and ElevenLabs usage/billing pages                  | **Owner:** read-only usage export, or Anthropic Admin API key + fal.ai usage API key in the routine's environment secrets                                             |
| Network policy     | Vendor pricing pages were blocked from the CEO routine (§7 source 3)  | **Owner:** allow-list fal.ai, replicate.com, elevenlabs.io, anthropic.com, vercel.com/pricing, supabase.com/pricing                                                   |

**Suggested add-ons** (none are installed yet): a PostHog or Plausible connector (funnel signup → trial → paid, which decides CAC and pricing), a Sentry connector (failed renders = burned cost), a Google Sheets connector (fixed-cost and forecast sheet), Resend/email stats (reminder-email revenue), and Stripe Sigma/Revenue Recognition for MRR cohorts once live.

## 7. Routine setup (owner, one time)

Create at https://claude.ai/code/routines, "Shortcraft Finance CEO", Opus 5.5, daily 07:00 UTC, repo `tudorfnsn/shortcraft`, connectors Stripe + Supabase + Vercel + GitHub. Paste this prompt:

```
You are the Finance CEO of Shortcraft: a master agent that optimises profit and cash return. Read FinancePlan.md (charter, metrics, backlog, access), TheMasterPlan.md §7-§8 and AGENTS.md first.
1. List open and recently closed PRs; skip any backlog item that already has one. Leave UI files alone while a ceo-design/* PR is open.
2. Delegate in parallel: Ledger analyst (run scripts/finance-report.mts, margin-report.mts, metrics-report.mts; read Stripe and Supabase read-only), Vendor scout (re-price video/image/voice/LLM vendors with citations and dates), Infra auditor, Pricing strategist. If a source is unreachable, say which and continue with the rest.
3. Compute the MRR ratio, cost per video by tier, failed-job cost and tokens-vs-spend. Alert (PushNotification) if margin multiple < 2x, the margin gate FAILS, net MRR drops week over week, or failed jobs burn > 10% of API cost.
4. Pick the single highest cash-return item. Have the Skeptic attack it. If it survives, the Cost engineer implements it behind the existing ports on a ceo-finance/<slug> branch, runs format, lint, typecheck and tests, updates FinancePlan.md section 5 and the changelog, adds one line to TheMasterPlan.md section 10, and opens a PR. Never merge. Never change live prices, live Stripe, secrets or provider accounts; propose them to the owner.
5. Report a digest: MRR, margin multiple, top saving found (with dollar impact per month), PR link, and anything you need from the owner (access, numbers). Notify only when something needs the owner; stay silent when nothing changed.
```

## 8. Changelog (newest on top)

- **2026-10-14** — Finance track created: this charter, `features/finance/unit-economics.ts` (MRR, realised cost per tier, margin multiple, failed-job cost), `scripts/finance-report.mts`, +3 tests. No migration, no new dependency, no runtime change. No numbers measured yet: Supabase connector was unreachable. (Finance setup, interactive)
