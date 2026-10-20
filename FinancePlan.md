# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on cost, pricing, monetization and cash. Every finance PR updates this
> file (findings + changelog) in the same change.
>
> Last updated: 2026-10-20 (routine designed; no live data read yet)

---

## 1. Charter

**Goal:** maximise cash return. In order: (1) grow MRR, (2) cut cost per finished
video without hurting what creators see, (3) cut fixed costs, (4) never let the
margin gate fall below 3x.

| Question   | Answer                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomy   | **PR-gated**, like the other routines. Branches `ceo-finance/<slug>`; never merge. Any live-money write needs the owner's OK.                        |
| Cadence    | Daily cloud routine "Shortcraft Finance CEO", 07:00 UTC (after the CEO at 06:00, before Design at 09:00). Weekly deep review on Mondays.             |
| Scope      | Pricing and plans, model/provider costs, hosting and SaaS bills, conversion and churn levers, payments and tax, credit economy.                      |
| Not scope  | UI files (Design CEO's: `DesignPlan.md` §5). Feature work that isn't a money lever (main CEO).                                                       |
| Hard rules | Never touch live secrets or Stripe live mode. Never invent a cost: unknown stays `null`. Never ship a change that fails `scripts/margin-report.mts`. |

## 2. How the routine works (master agent + sub-agents)

The master agent (the routine itself) does the cheap, serial part, then fans out.

1. **Orient:** read this file, `TheMasterPlan.md` §7–§8, and list open + recently closed PRs (an item with an open PR is in review, not available).
2. **Measure** (read-only, in this order, stop a branch if its source is unreachable and say so):
   - `npx tsx scripts/finance-report.mts --days=30 --json` (MRR, cost per finished video by tier, failed-render waste, gross margin, fixed costs).
   - `npx tsx scripts/metrics-report.mts --json` (north star, activation, trial → paid).
   - `npx tsx scripts/margin-report.mts` (gate and headroom).
   - Stripe connector (read-only): MRR, new/churned subscriptions, refunds, disputes, top-up revenue, fees.
   - Vercel connector: `list_billing_charges`, usage by project, runtime errors. Supabase connector: DB size, storage size, egress, advisors.
3. **Split** into the five workstreams below. Spawn one sub-agent per workstream that has something to do today (skip the rest; do not spawn for the sake of it). Each gets: the numbers, the files it may touch, what is already ruled out, and a required output (finding + proposed change + expected $/month effect + how to verify).
4. **Pick one** change with the best expected cash return per unit of risk. Implement it as a PR with tests. Everything else goes into §5 as a ranked finding.
5. **Report:** update §4 numbers and §5, append the changelog, push a PR. Send a push notification only when something needs the owner (see §7).

| #   | Workstream (sub-agent) | Looks at                                                                                                                                                                                  |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Unit economics**     | Cost per finished video vs credits charged, by tier and length; failed-render waste; margin gate headroom; catalog `costUsdPerUnit` vs invoices.                                          |
| B   | **Provider costs**     | fal.ai, ElevenLabs, Anthropic: cheaper or equal-quality alternatives (§6), prompt caching, model downgrade for easy steps, batch/async discounts, reseller prices.                        |
| C   | **Revenue / MRR**      | Plan prices and grants, annual plan, top-up packs, upgrade nudges, trial size and burn, win-back and dunning, churn reasons, referral/affiliate economics.                                |
| D   | **Fixed and platform** | Vercel, Supabase, Resend, Sentry, domain, ElevenLabs plan: what to downgrade, what must be upgraded before it caps growth (voice slots, Supabase Pro), storage retention and egress (R2). |
| E   | **Payments and tax**   | Stripe fees, Stripe Tax vs manual VAT, FX, refunds, disputes, failed-payment recovery, payout timing.                                                                                     |

Sub-agents are read-only except the one implementing the chosen PR. Anything they
claim about a price must carry a source URL and a date; a search snippet is a
lead, not a number (TheMasterPlan §7 note 3).

## 3. Measurement gaps to close (highest value first)

1. **Per-step cost and token usage is not stored.** `render_jobs.api_cost_usd` is one total per job, computed from list prices, not invoices. The Anthropic adapter already receives `usage.input_tokens/output_tokens` (`live/anthropic-script.ts`) and drops them. Without a per-step record we cannot answer "tokens used vs money spent" or find which step to optimise. **Proposed (needs the owner to apply the migration):** a `job_costs` table `(job_id, step, provider, model, units, unit_kind, input_tokens, output_tokens, cost_usd, created_at)`, written by the orchestrator as each step settles; `finance-report` then groups by provider/model.
2. **Invoiced spend vs computed spend.** Owner sends the fal.ai, ElevenLabs, Anthropic, Vercel, Supabase totals for one month (or pastes usage pages). Until then margins are list-price estimates.
3. **Fixed costs** in `src/config/ops-costs.ts` has `null` for the ElevenLabs plan and the domain.
4. **Top-up revenue** is not money in the DB (the ledger holds credits). The routine reads it from Stripe and passes `--topups-eur`.
5. **Subscription history isn't stored**, so churn and MRR movement need Stripe (Sigma if available) or a snapshot table.

## 4. Numbers (the routine overwrites this block each run)

_No live read yet._ Last known, from TheMasterPlan (2026-10-08, three real renders, list-price costs): Standard 15s ≈ **$0.037**, Standard 30s ≈ **$0.049**, Premium 30s ≈ **$1.92** (priced at $0.12/s for AI video; Kling 2.5 Turbo Pro lists ~$0.07/s, so likely lower). Margin gate: Starter 9.4x, **Pro 3.00x (zero headroom)**, Ultra 3.23x, top-ups 4.0–5.9x. Trial burn $0.14.

## 5. Findings and ideas, ranked (the routine maintains this list)

Prices below are **unverified leads** from search snippets (2026-10-20); sources disagree, so measure on real calls before acting.

1. **Premium video is the only expensive thing, and Pro has zero headroom.** Re-price the catalog at the measured Kling cost (~$0.07/s vs the $0.12/s assumed): raises Pro's multiple without touching customer prices. Needs the owner's fal.ai invoice number. _Effect:_ unlocks the gate; allows the hero-shot tier.
2. **Hero-shot Premium** (AI clip on the hook scene only, stills elsewhere): ≈ $0.45 per 15s vs ≈ $1.10 all-AI. Cheap enough to price near Standard, widening the paid funnel. Already modelled in §7 of the master plan.
3. **Cheaper image-to-video candidates to benchmark against Kling on the same 5 prompts** (cost per second, 720p, audio off): Seedance 2.0 Fast (leads quote $0.022–0.04/s; direct ByteDance ModelArk is cheaper than fal, which one source lists at $0.30/s for Seedance 2.0 at 720p), Wan 2.6 (~$0.05/s), LTX-2 (fal lists $0.0018 per megapixel of video). Gate to adopt: ≥30% cheaper at equal look on our 5 prompts, and the adapter stays behind `FAL_VIDEO_MODEL` or a new `ProviderRegistry` row. Sources: [fal.ai best image-to-video APIs](https://fal.ai/learn/tools/best-image-to-video-apis-2026), [devtk.ai pricing](https://devtk.ai/en/blog/ai-video-generation-pricing-2026/), [teamday.ai comparison](https://teamday.ai/blog/ai-image-video-api-providers-comparison-2026).
4. **Voiceover is the largest non-video variable cost on Standard.** ElevenLabs Flash is quoted at $0.05 per 1k characters; leads for cheaper voice: Deepgram Aura-2 (~$0.03/1k, preset voices only, no cloning), OpenAI TTS (~$0.015–0.03/1k), Google Standard/WaveNet ($0.004/1k). Voice Studio's saved voices depend on ElevenLabs, so a cheaper engine could back the default catalog voices only. Needs a blind listening test by the owner. Sources: [apiframe TTS comparison](https://apiframe.ai/blog/best-text-to-speech-apis-2026), [forasoft ElevenLabs alternatives](https://www.forasoft.com/blog/article/elevenlabs-alternatives).
5. **Script step:** ~$0.04 per generation on Sonnet-class. Test prompt caching on the fixed system prompt and a Haiku-class model for short formats; record tokens first (§3.1) so the saving is measured.
6. **Annual plans** (2 months free): lifts cash up front and cuts churn; Stripe prices only, no new code beyond `/pricing` toggle (UI waits for the Design CEO).
7. **Failed-render waste:** the report prints API spend on failed jobs. If non-zero, add cheaper pre-flight checks before the expensive steps.
8. **Fixed costs:** stay on Hobby and Supabase free until the first of: Supabase storage near 1 GB, ElevenLabs voice slots near the cap, Vercel function limits. Then upgrade the one that blocks growth, not all. Move media to Cloudflare R2 (no egress fees) behind `MediaStore` once egress shows up.
9. **Stripe fees:** the margin gate assumes 1.5% + €0.25; confirm against the live account (EU cards vs others) and decide Stripe Tax vs manual VAT before the first live euro.

## 6. Tools, connectors and add-ons that would help the routine

Already connected (claude.ai connectors, per TheMasterPlan §9): **Supabase** (read-only SQL, advisors, logs), **Stripe** (sandbox only so far), **Vercel**, **GitHub**. Ask the owner to:

- **Connect Stripe live in read-only/restricted mode** (a restricted key with read on Charges, Subscriptions, Invoices, Balance, Payouts, Refunds, Disputes) so MRR, churn and fees are real. Sigma, if enabled, gives cohort and MRR-movement SQL.
- **Supabase connector reliability:** it failed to connect from this cloud session (`ERR_PROXY_TUNNEL`), so the first run could not read the DB. Re-authenticate it, or give the environment a read-only Postgres role (`finance_readonly`: `select` on `render_jobs`, `subscriptions`, `credit_transactions`, `profiles`) and put `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or the read-only role) in the routine's environment so `scripts/*-report.mts` run. Prefer the read-only role.
- **Provider usage:** read-only usage/billing access for fal.ai, ElevenLabs and Anthropic (Admin API usage and cost reports) or a monthly paste of the totals. Without this, costs stay list-price estimates.
- **Network access** for the routine's environment to provider pricing pages (fal.ai, bytedance/BytePlus, elevenlabs.io, deepgram.com, openai.com). The October routine was blocked from several (TheMasterPlan §7), which is why prices are snippets.
- **Optional add-ons:** a PostHog connector (funnel: visit → signup → first video → paid), a Sentry connector (render failures cost money), a Google Sheets/Docs connector for a monthly P&L the owner can read, and an FX source (ECB rate) to replace the fixed 1.08 assumption.

## 7. When to notify the owner

Send a push notification (and only then) when: the margin gate fails or Pro/Ultra drop under 3.1x; failed-render waste exceeds 10% of variable cost; a fixed cost is about to cap growth; MRR falls week over week; a provider alternative is ≥30% cheaper and needs an owner decision; or the routine could not read a data source it needs (access denied, connector down). A quiet healthy run sends nothing.

## 8. Routine prompt (paste into the routine; keep in sync with this file)

> You are the Shortcraft Finance CEO, a daily PR-gated routine for github.com/TudorFnsn/Shortcraft. Read `FinancePlan.md`, `TheMasterPlan.md` (§1, §7, §8, §9) and `AGENTS.md` first (this Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing code). List open and recently closed PRs; skip anything in review. Run the measurements in FinancePlan §2 step 2 (read-only; never write to Supabase, Stripe or any provider; never use live secrets beyond read-only reports). Act as a master agent: split the work across sub-agents per FinancePlan §2, one per workstream with something to do today, each told the numbers, files it may touch, what is ruled out, and the output required (finding, change, $/month effect, verification). Optimise for cash return: MRR first, then cost per finished video, then fixed costs, while the margin gate (`npx tsx scripts/margin-report.mts`) stays ≥ 3x. Every price claim needs a source URL and date; unknown stays unknown. Implement the single best change on `ceo-finance/<slug>` with tests (`npm run format:check && npm run lint && npm run typecheck && npm test`), update FinancePlan §4–§5 and the TheMasterPlan changelog, and open a PR; never merge and never touch UI files. Send a PushNotification per FinancePlan §7 when something needs the owner, or when the run could not read a source it needs; stay silent on a healthy quiet run.

## 9. Changelog (newest on top)

- **2026-10-20** — Finance track created: this plan, `features/finance/unit-economics.ts` (MRR, cost per finished video by tier, failed-render waste, gross margin, fixed costs; +6 tests), `scripts/finance-report.mts` (read-only), `config/ops-costs.ts` (fixed costs, two still unknown). No migration, no new dependency. The first run could not read the live DB (Supabase connector `ERR_PROXY_TUNNEL`, Stripe not authorised), so §4 holds the last known numbers only. (Finance CEO, interactive)
