# FinancePlan — Shortcraft profit track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority; this file
> wins on cost, pricing and cash. Every finance PR updates this file (state,
> backlog, changelog) in the same change.
>
> Last updated: 2026-10-14 (routine defined, no live data read yet)

---

## 1. Charter

**Goal: maximize cash return.** Grow MRR, cut the cost of every video, never
sell a credit below the margin gate (revenue >= 3x worst-case API cost), and
prioritize whatever returns cash soonest.

| Question       | Answer                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomy       | **PR-gated**, like the other routines. Branches `finance/<slug>`; never merge; never touch live secrets, live prices or Stripe objects.   |
| Cadence        | Daily cloud routine "Shortcraft Finance CEO", proposed 07:00 UTC (after the main CEO at 06:00, before Design at 09:00).                   |
| Shape          | A **master agent** reads the numbers, picks the work, and splits it across the specialists in `.claude/agents/finance-*.md` in parallel.  |
| Cash priority  | 1) stop leaks (failed-job spend, over-burn) 2) lower unit cost 3) raise revenue per user 4) new revenue streams.                          |
| Owner sign-off | Needed for any change to customer prices, plan grants, credit rates, vendor switch in production, or new paid services. Tudor sets `[✓]`. |

## 2. The numbers (refresh every run)

Run read-only, from the repo root:

- `npx tsx scripts/finance-report.mts --fixed=<usd/month>`: MRR, net revenue after VAT and Stripe fees, API cost, cost per finished video, failed-job waste, revenue/API-cost ratio, profit after fixed costs (last 30 days).
- `npx tsx scripts/margin-report.mts`: the worst-case gate per plan and top-up (must PASS).
- `npx tsx scripts/metrics-report.mts`: north star, activation, trial to paid, failure rate.

**MRR ratio** = net revenue / API cost (target >= 3x) and net revenue / (API + fixed
costs) (target > 1). Report both, with the trend against the previous run.

**Known blind spots** (fix these first; each is a backlog item below):

- `render_jobs.api_cost_usd` is one total per job: no per-provider split and no token counts. The Anthropic `usage` is computed in `anthropic-script.ts` but not stored.
- Fixed costs (Vercel, Supabase, ElevenLabs plan, Resend, Sentry, domain) are not in the repo. The owner supplies them (§7) or a billing connector does.
- Costs in `config/models.ts` are list prices, not measured (TheMasterPlan §7).

## 3. How the routine runs (master agent playbook)

1. **Read:** `TheMasterPlan.md` §7-§9, this file, `git log -20`, open and recently closed PRs (`finance/*` and others: an item with an open PR is in review, not available).
2. **Measure:** run the three scripts. If the DB is unreachable (the Supabase connector failed from the cloud before), say so, use the catalog, and mark every number "estimate".
3. **Split, in parallel,** one message with several Agent calls:
   - `finance-costs`: cost per video per step, leaks, measured vs list.
   - `finance-vendors`: one slot per run (rotate: video, image, voice, script LLM, hosting), cheaper vendors with dated prices.
   - `finance-revenue`: MRR, churn, conversion, credit utilization, pricing levers (Stripe read-only if connected).
4. **Decide:** pick the single highest cash-per-effort item from §5. Give a recommendation, not a survey.
5. **Build:** hand it to `finance-implementer` (one item, one `finance/<slug>` PR) only if it needs no owner sign-off; otherwise write the proposal into §5 with numbers and ask Tudor.
6. **Record:** update §2 snapshot, §5 backlog, §8 changelog, and the Finance line in `TheMasterPlan.md` §9.
7. **Notify** (PushNotification, `<routine_summary>`) only when something needs Tudor: the margin gate fails, revenue/API cost drops under 3x, profit turns negative, a vendor price jumps, an owner decision or missing access blocks the run, or a PR is ready. Stay silent on an unchanged healthy run.

## 4. Quality bar for vendor swaps

A cheaper model replaces the current one only if: commercial-use license, 9:16 output at the current resolution, no watermark, an adapter fits the `ProviderPort` in `src/features/providers/`, and a side-by-side sample the owner approves (Tudor judges quality). Ship behind an env var (like `FAL_VIDEO_MODEL`) with the old model as the fallback. A swap is not "done" until its measured cost replaces the list price in `models.ts`.

## 5. Backlog (priority = cash impact / effort; the routine edits this)

Candidates, all **unverified** until `finance-vendors` confirms a current price:

- [ ] **F1 Instrument costs.** Persist a per-step cost breakdown and Anthropic input/output tokens per job (new migration, owner applies it) so cost per step is measured, not estimated. Prerequisite for everything else.
- [ ] **F2 Cheaper script step.** Test Haiku-class model and prompt caching for the script; the script is ~$0.04/video, so low priority unless volume is high.
- [ ] **F3 Hero-shot Premium.** AI clip on the hook scene only (~$0.45 per 15s vs ~$1.10), priced near Standard (TheMasterPlan §7). Biggest lever on Premium cost.
- [ ] **F4 Premium video vendor scan.** fal.ai Kling 2.5 Turbo (~$0.07/s) vs LTX, Wan, Seedance, Hailuo, direct vendor APIs, Replicate/WaveSpeed/Runware aggregators, self-hosted open weights on rented GPU. Need measured cost per 5s clip and a sample.
- [ ] **F5 Image cost.** FLUX schnell is $0.003/image already; check cache/reuse of images across re-voices and series before switching vendors.
- [ ] **F6 Fail-fast and retry caps.** Cap provider retries and stop spending on a job once it can't finish; failed-job API cost should trend to ~0.
- [ ] **F7 Revenue levers** (each needs owner sign-off): annual plans (cash up front), unused-credit expiry policy, top-up upsell at low balance, trial watermark and size, Premium add-on pack, affiliate payout cap, dunning emails for failed payments.
- [ ] **F8 Fixed-cost audit.** Free-tier headroom on Vercel/Supabase/Resend/Sentry; the ElevenLabs plan's custom-voice slots vs saved-voice limits.

## 6. Rules and files

- **Files it may change:** `src/config/models.ts` (costs only, with a measured source), `src/features/billing/margin.ts`, `src/features/metrics/**`, `src/features/providers/**` (new adapters behind env vars), `scripts/*report*.mts`, `tests/**`, this file, and the Finance lines of `TheMasterPlan.md`. Plan prices, credit rates and migrations are **proposals** until Tudor marks `[✓]`.
- **Never:** merge, push to `main`, enable live providers, create or edit Stripe prices/coupons, rotate or print secrets, change anything that lowers the margin gate.
- **Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` in mock mode, and `margin-report.mts` still PASSES.
- **Writes** through connectors (Supabase, Stripe, Vercel) need the owner's explicit OK (TheMasterPlan §9 rule). Reads are fine.

## 7. Access and tools (what the routine needs)

| Need                         | State (2026-10-14)                                                    | Action for Tudor                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Repo + PRs                   | GitHub connector, scope `tudorfnsn/shortcraft`                        | Attach the repo to the routine with push access.                                                                                     |
| Supabase (job costs)         | Connector failed to connect in the cloud session (`ERR_PROXY_TUNNEL`) | Re-authenticate it; or add `SUPABASE_URL`/service key as routine env vars; or paste a monthly export.                                |
| Stripe (MRR, churn)          | Connector available, **sandbox account only**                         | Connect the **live** account read-only (restricted key) when real subscribers exist.                                                 |
| Vercel (hosting $)           | Connector available                                                   | Allow `list_billing_charges`, `list_contract_commitments` reads.                                                                     |
| fal.ai spend                 | none                                                                  | Give a read-only admin key as `FAL_ADMIN_KEY`, or paste the monthly usage page.                                                      |
| Anthropic / ElevenLabs spend | none                                                                  | Anthropic Admin API usage/cost report key; ElevenLabs usage page export.                                                             |
| Fixed monthly costs          | unknown                                                               | Fill `FIXED_COSTS_USD_MONTHLY` and the table below.                                                                                  |
| Network                      | Vendor pricing pages were blocked from earlier routines               | Allow `fal.ai`, `replicate.com`, `elevenlabs.io`, `anthropic.com`, `vercel.com`, `supabase.com` in the environment's network policy. |

Fixed costs table (owner fills): Vercel __ · Supabase __ · ElevenLabs plan __ · Resend __ · Sentry __ · domain __ · other __ (USD/month).

**Suggested additions** (none installed by this change):

- Connectors: a spreadsheet/Google Sheets connector for a cost ledger; a Slack or email connector for the digest; PostHog for funnel and conversion; a Sentry connector to tie failure spend to errors.
- Claude tools: `ArtifactData`/Artifact dashboard of the weekly finance numbers; the `dataviz` skill for charts; `deep-research` for vendor scans; `ListConnectors`/`SuggestConnectors` at the start of each run to see what is attached.

## 8. Changelog (newest on top)

- **2026-10-14** — Finance track created: charter, master-agent playbook, four specialist agents (`.claude/agents/finance-*.md`), `scripts/finance-report.mts` + `features/metrics/finance.ts` (+4 tests). No live data read yet; Supabase connector was unreachable. (Finance routine, setup)
