# FinancePlan — Shortcraft money track

> **Source of truth for the money track.** Owned by the **Finance CFO** routine.
> It sits under `TheMasterPlan.md`. The master plan wins on product and
> priority; this file wins on cost, pricing, vendor choice and cash. Every
> finance PR updates this file (ledger, roadmap, changelog) in the same change.
>
> Last updated: 2026-10-14 (routine created; no measurements yet)

---

## 1. Charter (set up 2026-10-14, change only with Tudor)

| Question  | Answer                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mission   | Maximise **cash return**: more MRR, a higher gross margin per video, a lower cost of running the app. Every other payment is a candidate for cutting.                    |
| Always    | Check the **MRR ratio** first, every run (§3), before choosing work.                                                                                                     |
| Autonomy  | **Analyse freely, change through PRs.** Branches `cfo/<slug>`; never merge; never touch live secrets, live Stripe, or paid vendor accounts. Price changes need Tudor's OK. |
| Cadence   | Daily cloud routine **"Shortcraft Finance CFO"**, 07:30 UTC (after the main CEO at 06:00). Weekly deep run on Mondays: vendor and price research.                         |
| Structure | A **DM master agent** reads the numbers, picks the highest-cash item, and splits it across specialist sub-agents (§5). Same heartbeat as the other routines.              |
| Priority  | Cash first: what saves or earns the most euros per month this week goes first. Ties go to the cheaper change.                                                            |

---

## 2. Cost map: everything we pay for

Fill the **Actual** column from invoices and dashboards the first time each is reachable. Until then the number is `?` and filling it is a roadmap item (§6, F0).

| Line                        | Variable or fixed | Where the cost comes from in code                                   | Actual €/month | How the routine reads it                         |
| --------------------------- | ----------------- | ------------------------------------------------------------------- | -------------- | ------------------------------------------------ |
| fal.ai images and AI video  | Variable          | `providers/live/fal-image.ts`, `fal-video.ts`, `costUsdPerUnit`      | ?              | fal usage page (needs owner export or API key)   |
| Anthropic scripts + moderation | Variable       | `providers/live/anthropic-script.ts` (`costUsdFor`: tokens × price)  | ?              | Anthropic Console usage; `render_jobs.api_cost_usd` |
| ElevenLabs voice + voices   | Variable + plan   | `providers/live/elevenlabs-*`; one custom-voice slot per saved voice | ?              | ElevenLabs usage; plan slot count                |
| Supabase (DB, storage, egress) | Fixed + usage  | `media` bucket holds every MP4 and image                             | ?              | Supabase connector (storage size, egress)        |
| Vercel (compute, bandwidth, cron) | Fixed + usage | ffmpeg render, `/api/cron/advance-jobs`, previews on every PR     | ?              | Vercel connector `list_billing_charges`          |
| Stripe fees                 | % of revenue      | `REVENUE_ASSUMPTIONS` in `features/billing/margin.ts`                | ?              | Stripe connector (balance transactions, fees)    |
| Resend (lifecycle email)    | Fixed             | `features/email`                                                     | ?              | Owner                                            |
| Sentry                      | Fixed             | `@sentry/nextjs`                                                     | ?              | Owner                                            |
| Domain, misc. SaaS          | Fixed             |                                                                      | ?              | Owner                                            |

**Token and unit tracking.** The app records `api_cost_usd` per render job. Anthropic usage is converted to dollars in `costUsdFor`, but raw token counts are not stored. Roadmap F1 adds them, so tokens per video can be compared against dollars per video and dollars per credit sold.

---

## 3. The numbers the routine checks every run

Source for each: `npx tsx scripts/metrics-report.mts` (read-only), `npx tsx scripts/margin-report.mts`, and the Stripe and Supabase connectors. If a source is unreachable, say so in the digest and use the last value in §8.

| Metric                                  | Definition                                                                                                                          | Healthy                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **MRR**                                 | Sum of live subscriptions at monthly price (yearly ÷ 12), net of nothing.                                                           | Up week on week            |
| **MRR ratio** (the one we steer by)     | `MRR ÷ monthly run cost`, where run cost = fixed lines + variable API spend + Stripe fees over the same 30 days.                    | **≥ 3.0**, trend up        |
| Gross margin per video                  | (credits burned × net revenue per credit − `api_cost_usd`) ÷ revenue.                                                              | ≥ 66% (the 3x gate)        |
| Cost per video, by tier                 | Mean and p95 `api_cost_usd` for standard and premium.                                                                               | Falling                    |
| Trial burn per signup                   | Cost of the free trial credits (`margin-report` prints it).                                                                         | Under 20% of first-month price |
| Free-to-paid conversion                 | Paying users ÷ signups, 30-day cohort.                                                                                              | Up                         |
| Paid churn and failed-payment recovery  | Cancelled ÷ live; recovered ÷ failed invoices.                                                                                      | Churn down, recovery up    |
| Unused-credit breakage                  | Credits granted but never burned (free margin) vs. credits near expiry (churn risk).                                                | Tracked                    |
| Fixed-cost share                        | Fixed lines ÷ MRR.                                                                                                                  | Falling                    |

If the **MRR ratio is below 1** (we lose money each month), the whole run goes to the biggest cost line or the biggest revenue leak, and the digest says so first.

---

## 4. Opportunity backlog (the routine edits this; Tudor can reorder)

Status: `[ ]` open · `[~]` in a `cfo/*` PR · `[✓]` shipped · `[?]` needs Tudor.

### 4.1 Cut variable cost (largest lever: AI video)

- [ ] **Video vendor bake-off.** fal.ai Kling is the premium path (`costUsdPerUnit` 0.12 per scene-second, conservative). Compare, on one fixed 6-scene prompt set, cost per billed second, quality and latency, for: other fal.ai models (cheaper Kling/Wan/LTX/Hailuo variants), Replicate, direct vendor APIs (Kling, MiniMax Hailuo, Luma, Runway, Google Veo fast, ByteDance Seedance), and open-weight models (Wan 2.x, LTX) on pay-per-second GPUs (Modal, RunPod, Replicate, Together). **Prices below are unverified and must be re-checked live; the routine records source and date for each.** Output: a table in §7 and an adapter PR for the winner behind `FAL_VIDEO_MODEL`-style config, with the margin gate re-run.
- [ ] **Fewer paid clips per video.** Generate AI clips only for hook scenes and use Ken Burns stills for the rest ("hybrid" tier). Compare margin and conversion.
- [ ] **Shorter clips, reused clips.** Kling bills fixed 5s clips, so 3s scenes waste money. Align scene lengths to the billed unit, or loop and trim.
- [ ] **Image cost.** Check whether FLUX schnell at lower resolution, or a cheaper image host, still passes quality; batch calls; cache identical prompts per user.
- [ ] **Script model cost.** Sonnet-class script at ~$0.04: test Haiku-class for the script and moderation step, use prompt caching for the fixed system prompt, and keep output tokens short.
- [ ] **Voice cost.** ElevenLabs Flash vs. cheaper TTS for the standard tier; reuse audio when a user re-renders the same script; check the custom-voice slot count against saved voices.
- [ ] **Failed and abandoned work.** Measure spend on jobs that fail late or are never watched; add earlier gates (cheap checks before expensive calls) and refunds only where we did not pay the vendor.

### 4.2 Cut fixed cost

- [ ] **Storage and egress.** Lifecycle policy for old MP4s and intermediates (delete scene images and clips after the final cut, expire free-tier videos after N days), signed-URL caching, smaller output bitrate.
- [ ] **Vercel.** Preview deployments on every routine PR: check build minutes and whether `ignoreCommand` skips enough. Right-size function memory and duration for the ffmpeg render.
- [ ] **Plan right-sizing.** For each SaaS line, compare the plan to real usage (ElevenLabs tier, Supabase compute add-on, Sentry quota, Resend tier) and drop to the cheapest tier that fits.
- [ ] **Annual prepay** where a vendor gives a discount and the line is certain to stay.

### 4.3 Grow revenue (MRR)

- [ ] **Measure before changing prices.** Funnel: visit → signup → first video → paywall view → checkout → paid → month 2. Needs analytics events (F1).
- [ ] **Yearly plans** (the Stripe price slots exist: `stripePriceIdYearly`). A yearly discount pulls cash forward.
- [ ] **Price and credit-pack tests.** Proposals only, with the margin multiple for each; Tudor approves before any Stripe change.
- [ ] **Failed-payment recovery.** Stripe Smart Retries and dunning email; show recovered revenue.
- [ ] **Upgrade prompts at the moment of value.** When a Starter user hits a gated option (length, premium video, voices), the upsell shows what the next plan costs per video.
- [ ] **Credit expiry and rollover policy.** Decide with data whether unused monthly credits roll over (retention) or expire (breakage margin).
- [ ] **Trial tuning.** Trial burn vs. conversion: smaller trial, or trial limited to standard tier.
- [ ] **Referral or affiliate** for faceless-channel creators, paid in credits (low cash cost, margin-positive at 3x).
- [ ] **Annual team or agency plan** for people running many channels.

### 4.4 New techniques to watch (the Monday run researches these)

New video, image and TTS models and price drops; batch and async inference discounts; prompt caching and Batch API pricing on the script model; on-device or edge rendering; video encoders that cut storage; cheaper Postgres or storage options. For each: cost per video before and after, risk, and effort.

---

## 5. Rules for the Finance CFO routine

**Structure: a DM master agent plus specialists.** The master agent (the routine itself) does not do deep work. It reads the plan and the numbers, picks the highest-cash item, then launches sub-agents in parallel with a self-contained brief each (goal, files, what is already ruled out, expected output), and merges the results.

| Specialist                | Job                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Revenue analyst**       | Stripe: MRR, new/expansion/churned MRR, failed payments, plan mix, fees. Supabase: signups, activation, conversion. Fills §3 and §8.              |
| **Cost analyst**          | `render_jobs.api_cost_usd`, tokens, per-vendor spend, per-video cost by tier, trial burn, failed-job spend. Fills §2 and §3.                      |
| **Vendor scout**          | Web research on cheaper or better providers; records price, source URL and date; runs a bake-off script only with an owner-provided key.          |
| **Pricing strategist**    | Margin gate scenarios for any price, credit or plan change. Output is a proposal table, never a Stripe write.                                      |
| **Implementer**           | Writes the PR for the chosen item (code, tests, config), in an isolated worktree, and runs the bar below.                                         |
| **Reviewer**              | Reads the Implementer's diff cold (`code-review`), checks the margin gate and that no secret or live setting changed.                              |

Do not launch more specialists than the item needs. A small item is one analyst plus one implementer.

**Every run, in order:**

1. **Read first:** `TheMasterPlan.md`, this file, `git log -20`, open and recently closed PRs. An item with an open `cfo/*` or `ceo/*` PR is in review, not available.
2. **Check the MRR ratio** (§3). Record the new row in §8, with the source for each input, and mark any input as `unavailable` rather than guessing.
3. **Pick one item** from §4: the largest monthly euro effect that is not blocked. Prefer finishing an open `cfo/*` PR over starting a new one.
4. **Split, build, review, PR.** Branch `cfo/<slug>`. Update this file in the same PR.
5. **Digest** (see Output).

**Files it may change:** this file, `scripts/**` (read-only reporting and bake-off scripts), `src/config/models.ts` and `src/features/providers/**` (new adapters and cost constants, behind the margin gate), `src/features/metrics/**`, `docs/**`, and the finance lines of `TheMasterPlan.md`. Changes to `src/config/plans.ts`, Stripe products or prices, `src/features/credits|billing` logic, migrations and webhooks are **proposals in the PR description only** until Tudor says yes in the PR. It leaves UI files to the Design CEO and the main CEO.

**Money safety:**

- Never merge. Never read or print a secret. Never use live Stripe or run a paid vendor call that was not approved. A bake-off that spends money needs Tudor's yes and a stated cap.
- A cheaper vendor ships only after the margin gate passes with the new `costUsdPerUnit` **measured** on real calls, not list prices. Until measured, the PR keeps the old default and adds the new adapter off by default.
- Price figures from the web carry a source and a date. Figures that disagree by more than 20% across sources are flagged, not averaged.
- Savings claims show the arithmetic: volume × unit delta = €/month, with the volume source.

**Bar:** `npm run format:check && npm run lint && npm run typecheck && npm test && npx next build` all pass in mock mode, and `npx tsx scripts/margin-report.mts` still passes.

**Output (the digest):**

1. MRR, MRR ratio and the change since the last row, **first line**.
2. What moved this run (PR link, € per month saved or earned, confidence).
3. What is waiting on Tudor: decisions, keys, exports, approvals.
4. Next item.

**Notify Tudor (PushNotification) only when** the MRR ratio is under 1, falls more than 15% week on week, a margin gate fails, a vendor price change breaks a model's margin, a payment fails in bulk, or the routine cannot reach a source it needs. Otherwise stay silent; the digest lives in the PR and §8.

---

## 6. Roadmap

| ID  | Item                                                                                                                                                                                                                              | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F0  | **Baseline.** Fill §2 actuals and the first §8 row from Stripe, Supabase, Vercel and the owner's invoices. Needs the access in §9.                                                                                                | [ ]    |
| F1  | **Unit-economics report.** `scripts/unit-economics.mts`: per-tier cost per video, tokens per video (add token columns to the job's cost record, additive, proposal for the migration), revenue per credit, MRR ratio, trial burn. | [ ]    |
| F2  | **Video vendor bake-off** (§4.1), starting with the cheapest fal.ai-hosted alternatives, then direct vendors and open weights.                                                                                                    | [ ]    |
| F3  | **Storage lifecycle** (§4.2): expire intermediates and free-tier videos.                                                                                                                                                         | [ ]    |
| F4  | **Hybrid tier** (§4.1): AI clips for hook scenes only.                                                                                                                                                                            | [ ]    |
| F5  | **Yearly plan + dunning** (§4.3).                                                                                                                                                                                                 | [ ]    |

---

## 7. Vendor price ledger (source and date for every figure)

| Slot  | Vendor / model | Unit | Price | Source URL | Date | Measured on real call? |
| ----- | -------------- | ---- | ----- | ---------- | ---- | ---------------------- |
| Video | fal.ai Kling 2.5 Turbo Pro | per billed second | ~$0.07 | (from `models.ts`) | 2026-10-04 | No |

---

## 8. MRR ratio history (newest on top)

| Date | MRR | Run cost (30d) | MRR ratio | Gross margin / video | Notes and unavailable inputs |
| ---- | --- | -------------- | --------- | -------------------- | ---------------------------- |
|      |     |                |           |                      | No measurement yet (F0).     |

---

## 9. Access the routine needs (owner checklist)

The routine reads what it can reach. Anything marked **needed** is missing today.

| Access                                                     | Why                                                          | State                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| GitHub repo `TudorFnsn/Shortcraft` (read, branch push, PR)  | Code, PRs, plan files                                        | Granted to the session                      |
| Stripe connector                                           | MRR, fees, failed payments, churn                            | Connected, **test mode only**. **Needed:** a restricted read-only **live** key or a live-mode connector for real MRR |
| Supabase connector                                         | `render_jobs`, ledger, subscriptions, storage size           | Configured; the cloud session could not connect (proxy tunnel error) on 2026-10-14. Retry; fall back to a read-only DB role exposed as a secret |
| Vercel connector                                           | Billing charges, usage, runtime logs                         | Connected                                   |
| fal.ai usage                                               | Real spend per model                                         | **Needed:** a read-only/usage-scoped key, or a monthly CSV export dropped into `docs/finance/` |
| Anthropic Console usage                                    | Token counts and spend for scripts                           | **Needed:** an Admin/usage API key (read-only), or monthly export |
| ElevenLabs usage and plan                                  | Characters used, slots used                                  | **Needed:** a read-only key, or export       |
| Resend, Sentry, domain, other invoices                     | Fixed costs                                                  | **Needed:** list the monthly amounts in §2   |
| Web search and fetch                                       | Vendor prices and new models                                 | Available                                   |

Suggested additions (§10) are not required to start.

---

## 10. Suggested connectors, tools and add-ons

In priority order for cash impact:

1. **Stripe live read-only access** (restricted key `rk_live_…` with read on Charges, Subscriptions, Invoices, Balance transactions). Without it the MRR ratio is test-mode data.
2. **fal.ai, Anthropic and ElevenLabs usage access** (read-only keys or CSV exports). They are the three biggest variable costs.
3. **Product analytics (PostHog or Vercel Web Analytics).** Funnel from visit to paid; needed for any price or upsell test.
4. **Stripe Billing features:** Smart Retries, Customer Portal cancellation flow with a save offer, Revenue Recovery. Low effort, direct cash.
5. **Stripe Sigma** (already in the Stripe connector) for MRR/churn SQL once on live mode.
6. **Spreadsheet or dashboard artifact.** The routine publishes an Artifact dashboard of §8 (MRR, ratio, cost per video) so Tudor sees the trend without opening the repo.
7. **Sentry or Vercel alerts into the routine** to link error spikes to wasted vendor spend (retries that bill twice).
8. **Cost-tracking proxy for LLM calls** (a small wrapper in the repo is enough; a gateway such as Helicone is optional) for tokens per video.
9. **Cloud GPU account** (Modal or RunPod) only if the bake-off shows open-weight video beats hosted APIs at current volume; skip below roughly a few hundred paid videos a month, since idle and cold-start costs eat the saving.

---

## 11. Changelog (newest on top)

- **2026-10-14** — Finance track created: charter, cost map, MRR-ratio definition, opportunity backlog, routine rules, access checklist. No code changes. (interactive)
