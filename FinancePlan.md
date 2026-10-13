# FinancePlan — Shortcraft money track

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine
> (`docs/routines/finance-ceo.md`). It sits under `TheMasterPlan.md`: the master
> plan wins on product and priority; this file wins on cost, price and cash.
> Every finance PR updates this file (KPIs, backlog, changelog) in the same change.
>
> Last updated: 2026-10-13 (first run: baseline + data-access audit)

---

## 1. Charter (owner brief 2026-10-13)

Maximise **cash return**: MRR up, cost per video down, every other payment questioned.

1. **Watch MRR every run.** Revenue ratio = MRR ÷ (variable API cost + fixed stack cost). Report it, trend it, act on it.
2. **Cost per video vs revenue per video.** Tokens/units consumed per stage (script tokens, images, AI-video seconds, TTS characters) against what each stage costs and what the credits burned were worth.
3. **Every recurring payment is on trial:** fal.ai, Anthropic, ElevenLabs, Vercel, Supabase, Resend, Sentry, domain, Stripe fees, VAT. Cheaper or better replacement, or cut.
4. **Bring fresh ideas:** new models, new pricing mechanics, new revenue lines (yearly plans, affiliates, packs, upsells), with the expected € impact and the risk.
5. **Prioritise cash.** Rank everything by `€ per month gained ÷ effort`, discounted by risk to quality or trust.

Autonomy: same as the CEO routines. **PR-gated** on `ceo-finance/*` branches. Never merge, never touch live secrets, never change Stripe live prices or charge anything. A price change is proposed to the owner with numbers; a provider swap ships behind a flag/env var with the old one still working.

---

## 2. Data access (audited 2026-10-13)

| Source                  | Status                                                                                                    | What it gives                                    | Owner action                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo (GitHub)           | ✅                                                                                                        | catalog prices, margin gate, plans               | none                                                                                                                                                                      |
| Stripe connector        | ⚠️ **sandbox only** (`acct_1UKkSC…`, `livemode:false`). Sigma not subscribed.                             | Real MRR only once the live account is attached  | Attach the live account (connector → manage accounts) when going live. Optional: Sigma (paid) for MRR templates; without it MRR is computed from `subscriptions` + prices |
| Supabase connector      | ❌ **failed to connect this run** (`ERR_PROXY_TUNNEL` to mcp.supabase.com). Read it again next run.      | `render_jobs.api_cost_usd`, credits, plans       | none if it recovers; else run `scripts/metrics-report.mts` and paste into §5                                                                                              |
| Vercel connector        | ✅ connected, but billing charges return `costs_not_found` (team is on Hobby, nothing billed)            | hosting cost, function usage                     | none                                                                                                                                                                      |
| Provider invoices       | ❌ none readable                                                                                          | **true** fal / ElevenLabs / Anthropic spend      | **Send the three monthly totals** (see §6, A1). Catalog costs are list prices, not invoices                                                                              |
| Ad / analytics spend    | ❌ none                                                                                                   | CAC                                              | tell the routine when any paid channel starts                                                                                                                             |

Suggested additions (each makes the routine measurably better): a **read-only Postgres role** for the routine (so it stops depending on the Supabase connector), **Stripe live account** (restricted read key or connector), **Anthropic Admin/usage API key** (read-only, exact token spend), **fal.ai usage export**, **ElevenLabs usage** (`/v1/usage`), and later **PostHog** for funnel/CAC. The `Skill`/connector registry should also be searched each run for a finance or accounting connector.

---

## 3. KPI definitions (the routine reports these every run)

| KPI                            | Definition                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **MRR**                        | Σ monthly-normalised price of subscriptions in `active`/`trialing`/`past_due` (live Stripe). €                    |
| **Net MRR**                    | MRR × (1 − VAT) × (1 − Stripe fee %) − fixed fee per charge                                                       |
| **Revenue ratio (MRR ratio)**  | Net MRR ÷ (variable API cost of the same month + fixed stack cost). Target ≥ 3.0; alarm < 2.0                    |
| **Gross margin / video**       | credits burned × realised €/credit − `api_cost_usd` (converted)                                                   |
| **Cost / video by stage**      | script (tokens in/out), images (count), AI clip (billed seconds), voice (characters), render (compute)           |
| **Burn on free users**         | trial credits spent by never-paying users × cost, per signup (catalog says $0.14)                                 |
| **Breakage**                   | credits granted but unspent at period end ÷ granted (pure margin)                                                 |
| **Net revenue retention, churn**| monthly paid churn %, upgrades vs downgrades                                                                    |
| **Payback**                    | CAC ÷ first-month gross margin (once there is spend)                                                              |

Realised €/credit: Starter €0.000500 (€14.99/30k), Pro €0.000300 (€29.99/100k), Ultra €0.000320 (€79.99/250k), top-ups €0.000600 / €0.000483 / €0.000393. Pro is the lowest-priced credit and is where the margin gate binds.

---

## 4. Baseline unit economics (from the repo, 2026-10-13, list prices, not invoices)

Measured by Tudor on 2026-10-08 (`render_jobs.api_cost_usd`, real usage × catalog prices):

| Render                              | Credits | API cost | Revenue at Starter rate | At Pro rate | Gross multiple (Pro) |
| ----------------------------------- | ------- | -------- | ----------------------- | ----------- | -------------------- |
| Standard 15s / 3 scenes             | 1,768   | $0.037   | €0.88                   | €0.53       | ~13x                 |
| Standard 30s / 5 scenes             | 3,096   | $0.049   | €1.55                   | €0.93       | ~17x                 |
| Premium 30s / 5 scenes (AI video)   | 42,636  | $1.92    | €21.3                   | €12.8       | ~6x                  |

Read-outs:

- **Standard is almost free to make** (≈ $0.04–0.05). Its cost is dominated by the script call ($0.04 catalog; the real number is token-dependent, see A2) and not by pictures ($0.003 each) or voice ($0.00075/s). **Cutting the image or voice vendor saves cents; cutting the script cost is the only Standard lever left,** and the biggest lever is simply getting more Standard videos sold per plan (credits are priced for a 9.4x margin on Starter).
- **Premium AI video is the money pit** ($1.92 for 30s, 98% of its cost is fal clips) and the one place a vendor swap pays back. The catalog prices it at $0.12/s and Kling 2.5 Turbo Pro lists ≈ $0.07/s with fixed 5s clips, so the true number is probably lower, but nobody has measured it (A1).
- **Fixed costs are about nil today** on free tiers (Vercel Hobby, Supabase free, Resend free, Sentry free). That ends with real revenue — see risks R1–R3 below. Budget unknown until the owner confirms the plans in use (A3).
- **MRR today: €0 live.** Only the Stripe sandbox is attached, so the ratio cannot be computed yet. First real number needs the live account.

---

## 5. Run log — latest numbers (the routine overwrites this block each run)

| Date       | Live MRR | Net MRR | Variable cost (30d) | Fixed (est.) | Ratio | Paying subs | Source quality                         |
| ---------- | -------- | ------- | ------------------- | ------------ | ----- | ----------- | -------------------------------------- |
| 2026-10-13 | n/a      | n/a     | n/a                 | n/a          | n/a   | n/a         | Stripe sandbox only; Supabase connector down; no invoices |

---

## 6. Backlog (ranked by € per month gained ÷ effort; routine picks the top unblocked item)

### Owner asks (blocking measurement)

- **A1. Send provider spend for a known window** (e.g. 2026-10-08, or last 30 days): fal.ai, ElevenLabs, Anthropic totals. Replaces list prices with invoiced cost and tells us whether the Premium line costs $0.07 or $0.12 per second.
- **A2. Anthropic token usage for the script step** (Console → Usage, or an Admin key read-only). Expected ≈ 2k in / 1.5k out per script; the catalog assumes $0.04. If real is ≈ $0.025, `script-default` can come down.
- **A3. Confirm the paid plans you are on or about to buy:** Vercel, Supabase, ElevenLabs (the custom-voice slots in V4 need a paid tier), Resend, domain, Sentry. List each with € per month.
- **A4. Attach the live Stripe account when ready**, and add a **read-only DB role** or fix the Supabase connector proxy error.

### Cost levers (ranked by expected saving; each needs a measured before/after)

1. **Make Premium cheaper than $1.92/30s (largest € saving, only matters when Premium sells).**
   - **Hero-shot tier** (AI clip on the hook scene, stills for the rest): ≈ $0.45/15s vs ≈ $1.10, already in the master plan as "decide the Premium shape".
   - **Cheaper clip model behind `FAL_VIDEO_MODEL`** (swap is one env var, adapter exists). Candidates from today's public price pages (aggregator snippets, **unverified, may be 2x off**; [Infer](https://tryinfer.com/pricing/cheapest-ai-video-api), [TeamDay](https://www.teamday.ai/blog/best-ai-video-models-2026), [ofox](https://ofox.ai/blog/fal-ai-alternatives-video-generation-api-2026/)):
     | Model | ≈ $/s | Note |
     | --- | --- | --- |
     | LTX-2 (Fast on fal) | 0.04 (0.016 on WaveSpeedAI) | cheapest; quality for faceless content needs a side-by-side |
     | Hailuo 2.3 fast 720p (PiAPI) | 0.027 | needs a non-fal adapter |
     | Kling 2.5 Turbo Pro (current) | 0.07 | current default |
     | Hailuo 02 Pro | 0.08 | |
     | Wan 2.7 / 3.0 720p | 0.10 | not cheaper than Kling now |
     | Kling v3 Pro | 0.11–0.17 | newer, dearer |
     | Seedance 2.0 | 0.15 (BytePlus) – 0.30 (fal) | dearest |
   - **Plan:** one A/B run of the same 5 prompts on Kling 2.5 vs LTX-2 Fast vs Hailuo 2.3, 5s clips, owner picks by eye. Expected saving 40–75% of the Premium line.
2. **Script step:** cache the system prompt (Anthropic prompt caching) and cap output; try Haiku 5.5 for Standard with Sonnet kept for Premium, judged by the owner on 10 samples. Expected saving ≈ $0.02–0.03/video, i.e. ≈ half of a Standard video's cost. Verify the model ids and prices with the `claude-api` skill before changing.
3. **Voice:** only if volume justifies it. At $0.00075/s a vendor swap saves ≪ 1 cent per video; do not spend engineering here until Voice Studio is a top-3 cost on invoices. Cheaper TTS (OpenAI/Fish/Inworld at ≈ $5–35 per 1M chars vs ElevenLabs Flash $50) would be a flag-gated adapter, but word timings (captions) are required and must be confirmed per vendor first.
4. **Compute/egress:** move media to Cloudflare R2 (no egress fees) before Supabase Storage egress (5 GB free, then paid) bites; set a retention policy for old renders and unfinished scene assets. Matters at ≈ 500+ videos/month.
5. **Image model:** FLUX schnell at $0.003/image is already near the floor; do not touch.

### Revenue levers (ranked)

1. **Yearly plans** (roadmap item, Phase 4): 2 months free ≈ cash up front, churn down. Model: ≈ +15–25 % cash in month 1 of each annual buyer, ≈ −30 % churn on those users. Needs Stripe prices + a `/pricing` toggle (UI is the Design track's).
2. **Trial → paid conversion:** trial is 3,000 credits (≈ 2 Standard videos) with a watermark. Test 2,000 vs 3,000 vs a 7-day card-required trial; each 1 pt of conversion is worth more than any vendor swap at this volume. Needs measurement first (`metrics-report`).
3. **Premium as an add-on pack, not a plan gate:** a €9 "5 AI clips" pack bought by Starter users lifts ARPU with no plan jump; margin 6x+ at Kling prices.
4. **Top-up nudges at the moment of need** (the credit estimate already blocks on insufficient credits: show a one-click top-up there).
5. **Unused-credit breakage**: credits do not roll over? Confirm the policy; rollover caps (e.g. 1x monthly) reduce churn complaints and cost almost nothing because Standard costs ≈ 1 % of its credit value.
6. **Affiliates (30 % recurring)** in the faceless niche; only when CAC from paid ads is unknown. Pays only on revenue.
7. **Annual price test** (€14.99 Starter is low for a tool that costs $0.04/video): test €19 on new visitors only, behind a flag, one week.

### Risks to cash (watch each run)

- **R1. Vercel Hobby is non-commercial.** Taking real payments on Hobby breaches its terms; the Pro plan (≈ $20/seat/mo) is the cost of going live. Include it in the fixed cost line (confirm price on vercel.com/pricing).
- **R2. Supabase free tier**: no daily backups, projects pause after inactivity, 500 MB DB, 1 GB storage. A paid tier (≈ $25/mo) is a go-live cost.
- **R3. ElevenLabs custom-voice slots** (V4 "My voices") need a paid ElevenLabs tier; the saved-voice limits per plan must be checked against that tier's slot cap before launch.
- **R4. Stripe fees + VAT** are already in the gate; also model **chargebacks/refunds** (auto-refund of failed videos is a credit refund, not a cash refund; keep it that way).
- **R5. Pro sits at exactly 3.0x** on the margin gate. Any real cost above the catalog fails it and (fail-closed) blocks live mode. A1 data may either free headroom or force a repricing.
- **R6. Abuse of the free trial** (multi-accounting) is a direct cash leak at $0.14 per signup; consider email verification plus one trial per card/device only when signups scale.

---

## 6b. Subagent structure of the routine

The Finance CEO is a thin "DM" master. It does no analysis itself; it fans out to workers with narrow briefs and one report format, then merges (see `docs/routines/finance-ceo.md`):

| Worker        | Job                                                                                                  | Reads                                            |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Ledger**    | MRR, net MRR, churn, trial → paid, refunds, fees, VAT                                                | Stripe (live), Supabase `subscriptions`, ledger   |
| **Unit-cost** | Cost per video by stage (tokens, images, clip seconds, TTS chars), margin by plan, breakage          | `render_jobs`, `credit_transactions`, catalog     |
| **Vendor**    | Provider invoices vs catalog; price changes; cheaper/better alternatives; fixed-stack bill           | web research, vendor docs, connector billing      |
| **Growth**    | Pricing/packaging/conversion ideas with € impact; competitor prices                                   | metrics report, competitors' public pricing pages |
| **Builder**   | Implements the single chosen item as a PR with tests (flag-gated, old path intact)                   | repo                                              |
| **Auditor**   | Reviews the PR cold: margin gate still passes, no secret leaks, numbers reproduce                    | diff only                                         |

---

## 7. Changelog

- **2026-10-13** — Finance track created: charter, KPI definitions, data-access audit, baseline unit economics, ranked backlog, and the routine prompt. First run found: Stripe is sandbox only (no live MRR), Supabase MCP failed to connect (proxy tunnel), Vercel has no billing yet (Hobby), and no provider invoices exist, so every cost figure is a list price. No code changed. (Finance CEO, first run)
