# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file
> wins on costs, pricing levers and vendor choices. Every finance PR updates this
> file (baseline, shortlist, changelog) in the same change.
>
> Last updated: 2026-10-14

---

## 1. Charter

**Goal:** maximise cash return. Every run answers three questions with numbers:
(1) What is the **MRR ratio**? (2) What does a finished video cost us versus what
the credits earn? (3) What is the one change that most improves (1) or (2)?

**Definitions** (code: `src/features/finance/finance-report.ts`):

- **MRR** = live subscriptions × plan price, net of VAT and Stripe fees, in USD.
- **MRR ratio** = MRR ÷ total monthly cost (API + fixed). ≥ 1.0x means subscriptions alone pay for the app. **Cash ratio** adds top-ups. Gross margin and monthly profit are reported next to it.
- **Cost per finished video** and **API USD per 1,000 credits**, by tier, from `render_jobs`.
- Costs the database can't see (plans, domain, tools) live in `src/config/finance-costs.ts`; `null` = unknown, and the report lists the gaps.

**Guard rails (non-negotiable):** PR-gated, never merges, never touches live secrets, no Stripe/Supabase/provider writes without the owner's explicit OK, margin gate must keep passing (≥ 3x on every product), quality of the videos is not traded away for a cheaper line item unless the owner approves.

**Autonomy:** read-only analysis + PR-gated code on `ceo-finance/<slug>`. Pricing changes, live Stripe changes and vendor contracts are owner decisions: the routine proposes them with numbers, in the digest.

---

## 2. How the routine works (master + specialists)

One daily run, **Finance CEO** (the master). It does no analysis itself beyond reading state; it splits work to the specialists in `.claude/agents/`, in parallel:

| Specialist                  | Job                                                                                    | Writes? |
| --------------------------- | -------------------------------------------------------------------------------------- | ------- |
| `finance-cost-auditor`      | Runs the finance report, reconciles `api_cost_usd` with real vendor spend, finds leaks | no      |
| `finance-vendor-scout`      | Researches cheaper/better providers + new techniques, prices them against the catalog  | no      |
| `finance-revenue-optimizer` | MRR, conversion, churn, pricing/packaging levers, Stripe analytics                     | no      |
| `finance-implementer`       | Builds ONE approved change on `ceo-finance/*` with tests, opens a PR                   | PR only |

Master loop: read this file + `TheMasterPlan.md` §7 and list open/recent PRs (an item with an open PR is in review, skip it) → fan out the three read-only specialists in one message → merge their findings into §3–§5 → pick the single highest cash-per-effort item that needs no owner decision → hand it to `finance-implementer` → update this file and the master plan changelog → notify the owner only if there is something to act on (a decision, a failing gate, a number that moved, or a blocked connector).

### Routine prompt (paste into claude.ai → Routines → New routine)

```
You are the Finance CEO for Shortcraft (repo TudorFnsn/Shortcraft). Read FinancePlan.md,
TheMasterPlan.md (§7 and §9) and AGENTS.md first. Run the loop in FinancePlan.md §2.

1. List open and recently closed PRs; skip anything already in review.
2. In ONE message, launch finance-cost-auditor, finance-vendor-scout and
   finance-revenue-optimizer in parallel, each with the question you want answered today
   and the baseline from FinancePlan.md §3.
3. Merge their findings into FinancePlan.md (§3 baseline, §5 shortlist, §6 owner asks).
4. Pick the one change with the best cash return per effort that needs no owner decision.
   Hand it to finance-implementer (branch ceo-finance/<slug>, tests, margin gate green,
   PR, never merge).
5. Report a digest: MRR, MRR ratio, cash ratio, gross margin, cost per finished video,
   USD per 1,000 credits, the change you shipped, decisions you need from the owner.
6. Send a push notification only when the owner has something to act on. Quiet otherwise.

Never merge, never use live secrets, never write to Stripe/Supabase/providers without the
owner's explicit OK. If a connector (Stripe, Supabase, Vercel, GitHub) fails, say which one,
fall back to what you can read, and list it under owner asks.
```

Suggested settings: Opus-class model, daily 07:00 UTC (after the CEO at 06:00, before Design at 09:00), repo `TudorFnsn/Shortcraft`, connectors Stripe + Supabase + Vercel + GitHub.

---

## 3. Baseline (2026-10-14, from code and the master plan; no live revenue data yet)

- Stripe is in **test mode**: MRR is **$0** until live go-live (`TheMasterPlan` §5 checklist). No acquisition or vendor change moves the north star as much as shipping live billing.
- **Standard** (animated stills): ~$0.037 per 15s / 3-scene video, ~$0.05 for 30s (measured, 2026-10-08), charging 1,768–3,096 credits. ElevenLabs voice, one Sonnet script call and ~$0.003 FLUX images are the whole bill, so **fal.ai is not a cost driver in Standard**.
- **Premium** (AI clips): $1.92 for a 30s video (priced at a conservative $0.12/s; Kling 2.5 Turbo Pro lists ~$0.07/s, so true cost is likely ~$1.10 per 15s). **This is where the fal.ai bill and the margin risk live.** Pro is at exactly 3.0x on the gate.
- Margin gate: Starter 9.4x, Pro 3.00x, Ultra 3.23x, top-ups 4.0–5.9x; trial burn $0.14 per signup.
- Fixed costs: Vercel Hobby $0, Supabase free $0; other lines unknown (see `finance-costs.ts`).
- **Gaps in measurement:** `api_cost_usd` is usage × list price, not an invoice; there is no per-step cost breakdown or Anthropic token count per job (only the total). Provider dashboards are the truth.

---

## 4. Measurement upgrades (build in this order)

1. [x] `scripts/finance-report.mts` + `features/finance` — MRR, MRR ratio, cash ratio, gross margin, cost per finished video and per 1,000 credits by tier, failed-job spend. _(2026-10-14)_
2. [ ] **Reconcile with invoices:** owner sends one month of fal.ai, ElevenLabs, Anthropic, Vercel and Supabase spend (or enables the connectors below); the catalog `costUsdPerUnit` is then replaced by measured values.
3. [ ] **Per-step cost + token log** (additive migration, owner-applied): `render_cost_lines(job_id, step, provider, units, usd, input_tokens, output_tokens)` so "tokens used vs money spent" is a query, not a guess.
4. [ ] **Stripe revenue feed:** MRR from Stripe subscriptions (not our table), churn, refunds, failed payments, fee totals, once live.
5. [ ] Weekly digest section "Money" in the routine output, with the 4-week trend.

---

## 5. Vendor and technique shortlist (hypotheses; the scout verifies price, quality, licence)

| Slot       | Today                                     | Candidates to price (all UNVERIFIED until the scout confirms)                                                                                              |
| ---------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI video   | Kling 2.5 Turbo Pro via fal.ai (~$0.07/s) | Cheaper fal models (LTX-2 Fast, Wan 2.x, Seedance), Kling/MiniMax direct APIs, open-weight on Modal/RunPod serverless GPUs; hero-shot only (AI on scene 1) |
| Image      | FLUX schnell $0.003 / dev $0.025          | Already cheap; check FLUX.2/other small models, self-hosted only at volume                                                                                 |
| Voice      | ElevenLabs Flash ~$0.05/1k chars          | Cartesia, OpenAI/Google TTS, self-hosted Kokoro for Standard; keep ElevenLabs for designed voices                                                          |
| Script LLM | Sonnet 5.5 ~$0.04/video                   | Haiku-class model for drafts, prompt caching, Batch API for non-urgent jobs (verify with `claude-api` skill)                                               |
| Render     | in-house ffmpeg ~$0.01                    | Done; watch function duration cost once volume exists                                                                                                      |
| Storage    | Supabase Storage                          | Cloudflare R2 (no egress fees) behind `MediaStore`; retention policy to delete old MP4s                                                                    |
| Payments   | Stripe cards                              | Local methods (SEPA, iDEAL, Bancontact) lower fees in EU; Stripe Tax vs Paddle/Lemon Squeezy as merchant of record (higher fee, no VAT admin)              |

**Ruled out / done:** hosted render API (replaced by ffmpeg), AI video in Standard (replaced by Ken Burns stills).

---

## 6. Owner asks (the routine fills in what's missing; answer when you can)

1. **Go-live date for Stripe** and whether an account for live mode will be added to the connector (needed for real MRR).
2. **One month of real spend:** fal.ai, ElevenLabs (plan + overage), Anthropic, Vercel, Supabase, Resend, domain, Sentry. Or screenshots; the routine will fill `finance-costs.ts`.
3. **Targets:** monthly profit goal, acceptable gross margin floor (currently 3x gate ≈ 67%), and whether Premium may run at lower margin to win customers.
4. **Pricing authority:** may the routine open PRs that change plan prices/credit grants (you still approve and apply in Stripe)?
5. **Sample size:** current number of real (non-test) users and paying subs, if any.

### Connectors, tools and add-ons that would make the routine better

- **Already used:** GitHub, Supabase (it failed to connect in the first session: re-authenticate), Stripe (sandbox only), Vercel.
- **Stripe live account** on the connector (MRR, churn, fees, failed payments; Sigma for cohorts).
- **Vercel billing** (`list_billing_charges` is available on the Vercel connector) for hosting and function spend.
- **Provider usage/billing access:** fal.ai, ElevenLabs and Anthropic usage exports (CSV in the repo's `docs/finance/` or API keys with read-only usage scope). Anthropic Admin API usage/cost reports give real token counts.
- **Sentry** and **PostHog** connectors, for failure cost and funnel (visitor → signup → paid).
- **Google Sheets/Drive** connector, if you'd rather keep invoices there.
- **Claude Code skills:** `claude-api` (caching, Batch API, model choice for the script step), `xlsx` (investor-style monthly P&L), `dataviz` (trend charts in the digest).

---

## 7. Changelog (newest on top)

- **2026-10-14** — Finance track created (interactive): charter, `FinancePlan.md`, four specialist subagents in `.claude/agents/`, `features/finance` (MRR, MRR ratio, cash ratio, gross margin, cost per video and per 1,000 credits, failed-job spend) with 5 tests, `scripts/finance-report.mts` (read-only), `config/finance-costs.ts` (owner-filled fixed costs). The cloud routine itself must be created by the owner (§2 prompt).
