# FinancePlan — Shortcraft profit & MRR

> **Source of truth for the finance track.** Owned by the **Finance CEO** routine.
> It sits under `TheMasterPlan.md`, which wins on product and priority. This file
> wins on money: MRR, unit economics, vendor costs, pricing. Every finance PR
> updates §5 (findings) and §6 (changelog) in the same change.
>
> Last updated: 2026-10-18 (routine defined, first baseline)

---

## 1. Charter

**Goal:** maximise cash return. In order: (1) protect gross margin on every
video, (2) grow MRR, (3) cut fixed and variable vendor spend, (4) raise
conversion and retention.

**Autonomy:** PR-gated, like the other routines. Branches `ceo-finance/<slug>`.
Never merges, never touches live secrets, never changes live Stripe objects
(prices, coupons, products) or runs migrations. Those go to the owner as a
recommendation with the numbers. Read-only DB/Stripe/Vercel checks are allowed.

**Cadence:** daily cloud routine "Shortcraft Finance CEO", 07:00 UTC (after the
06:00 main CEO, before the 09:00 Design CEO). Weekly (Mondays) it does the deep
vendor/pricing review; other days it does the quick health check.

**Notify the owner (PushNotification) only when:** MRR drops week over week; the
margin gate fails or measured cost > 80% of the 3x limit; a vendor bill spikes
(>30% week over week); a cheaper vendor beats the current one by >25% on a
tested sample; or the routine could not read its data sources. No news = silence.

## 2. Operating loop (the DM master agent)

The master agent reads this file, `TheMasterPlan.md` §7 and the open PR list
(an item with an open PR is in review, so skip it), then splits work to
subagents in parallel and merges their reports:

| Agent               | Job                                                                                                                                                           | Reads                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **MRR analyst**     | MRR, new/expansion/churned MRR, ARPU, trial→paid, churn, LTV. Run `scripts/finance-report.mts`; cross-check with Stripe (subscriptions, invoices, refunds).   | Supabase (read-only), Stripe                                  |
| **Cost auditor**    | Cost per finished video by tier (`render_jobs.api_cost_usd`), per-step split (script, image, video, voice, render), credits burned vs credits sold, trial burn. | Supabase, `src/config/models.ts`                              |
| **Vendor scout**    | Cheaper/better replacements per slot (below). Tests on a fixed sample before recommending. Checks vendor price pages weekly for changes.                      | Web, Firecrawl connector                                      |
| **Infra auditor**   | Vercel, Supabase, ElevenLabs, Resend, Sentry, Anthropic plan tiers vs real usage; downgrade/upgrade timing; egress and storage growth.                        | Vercel connector, Supabase advisors, vendor dashboards (owner) |
| **Pricing analyst** | Plan/top-up prices vs margin gate; annual plan, price tests, upsell, dunning, trial length; proposes changes as numbers, not edits to live Stripe.             | Stripe, `features/billing/margin.ts`                          |
| **Implementer**     | Turns one approved-by-default, low-risk finding into a PR (cost-saving code, adapter swap behind a flag, margin-gate update, tests). One PR per run.          | repo                                                          |

Master agent output each run: a digest (MRR, margin, top 3 findings, PR link),
a §5 update, and a notification only if the rules in §1 fire.

## 3. Cost model today (from `src/config/models.ts`, list prices, not measured)

| Step                      | Vendor            | Unit cost       | Note                                                     |
| ------------------------- | ----------------- | --------------- | -------------------------------------------------------- |
| Script                    | Anthropic Sonnet  | ~$0.04 / video  | Haiku-class model likely enough, see ideas                |
| Image (Standard)          | fal FLUX schnell  | $0.003 / image  | Already cheap                                            |
| Video (Standard)          | in-house Ken Burns| $0              | No video model                                           |
| **Video (Premium)**       | **fal Kling 2.5** | **$0.07–0.12/s**| **The only expensive line.** ~$1.10+ per 15s            |
| Voice                     | ElevenLabs Flash  | ~$0.00075 / s   | Plan slots for custom voices are a fixed cost            |
| Render                    | ffmpeg on Vercel  | ~$0.01          | Fine                                                     |

So fal.ai is expensive only on **Premium video**. A Standard 15s video costs
about $0.07. Optimising Standard further has little upside; Premium is where the
money is.

## 4. Savings & growth ideas (ranked by cash impact)

1. **Replace Kling 2.5 for Premium.** Searches (2026-10-18) show cheaper image-to-video routes: Kling 3.0 via aggregators at ~$0.03–0.08/s, Seedance 1.5 Pro ~$0.025–0.05/s, Wan 2.x ~$0.07–0.08/s, Hailuo 2.3 ~$0.25 per fixed clip, LTX-2.3 Fast from $0.06/s. Sources disagree up to 3x (resolution, audio, reseller markup). Next step: run the same 5 prompts through 3 candidates (Seedance via fal or BytePlus direct, Kling 3.0 direct, Wan via Alibaba Cloud/Runware), score quality, record real $ per clip, then swap `FAL_VIDEO_MODEL` or add an adapter. Direct vendor APIs are often 20–50% under the fal markup.
2. **Hero-shot Premium** (AI clip on scene 1 only, stills elsewhere): ~$0.45 per 15s instead of ~$1.10; can be priced between Standard and Premium and widen the market.
3. **Measure, then reprice.** Replace `costUsdPerUnit` with measured values. Standard carries ~9x margin: option C (cost-tied credits) could give creators ~2.5x more videos per plan, which raises conversion at no margin risk. Test before changing live prices.
4. **Script model:** try Haiku 5.5 (or prompt caching on the theme prompt) for the script; saves most of the $0.04 if quality holds.
5. **Annual plans** (2 months free): cash up front, lower churn. Needs owner OK in Stripe.
6. **Trial control:** trial burn is ~$0.14 per signup; add disposable-email/ duplicate-device checks before it scales.
7. **Dunning & cancel flow:** Stripe Smart Retries + a cancel-offer (pause, downgrade) typically recovers 10–20% of involuntary churn.
8. **Credit expiry/rollover policy:** unused credits are pure margin but hurt trust; decide explicitly, document in Terms.
9. **Cache & reuse:** reuse generated stills/voice for identical prompts, reuse theme intro assets; cut storage with a retention window for old renders (Supabase Storage egress is the quiet cost).
10. **Affiliate payouts** only on net-of-refund revenue, to keep the 30% recurring offer inside the margin.

## 5. Findings (newest first; the routine rewrites this section)

**2026-10-18, baseline (no live data read; DB/Stripe connectors were not usable in this cloud session):**
- Stripe connector shows `needs_reconnect`; the Supabase MCP from `.mcp.json` failed its proxy tunnel. The routine therefore could not read MRR or measured cost. See §7.
- Unit economics on list prices: Standard 15s ≈ $0.07 cost vs 2,024 credits; gate passes, Pro is at exactly 3.0x and has no headroom on any measured cost increase.
- Fixed costs unknown (Vercel plan, Supabase plan, ElevenLabs plan, Resend, Sentry, domain). The owner should paste last month's invoices, or connect billing read access.

## 6. Changelog

- **2026-10-18** — Finance track created: this plan, `scripts/finance-report.mts` (read-only cost vs revenue per tier). (Finance CEO, interactive)

## 7. Access the routine needs (ask the owner once)

| Need                              | Why                                         | How                                                                                         |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Stripe connector re-authorised    | MRR, churn, refunds, fees                   | claude.ai → Settings → Connectors → Stripe → Reconnect. Use a **restricted read-only** key/live account once live. |
| Supabase connector working        | measured cost per job, credits, trial burn  | Connected at org level; the `.mcp.json` project URL failed to tunnel. Cloud routines use the claude.ai connector. |
| Vercel connector (connected)      | usage/billing charges (`list_billing_charges`) | Already available.                                                                          |
| Firecrawl connector (connected)   | vendor pricing pages blocked from plain fetch | Enable it in the routine's connector list (currently off in chat).                          |
| Vendor invoices                   | fal, ElevenLabs, Anthropic, Resend, Sentry  | Anthropic Console usage/cost API (admin key) and fal usage; or paste monthly totals into §5. |
| Add to the routine environment    | `ANTHROPIC_ADMIN_KEY` (read-only usage), `FAL_KEY` for sample tests | Only via the routine's environment settings, never committed. |

Useful additions: a **Google Sheets/Drive** connector for a cost ledger the owner
can edit; **PostHog** (planned) for funnel/conversion; **Stripe Sigma** (through
the Stripe connector) for MRR cohorts; **Vercel Spend Management** alerts.

## 8. Rules

- Never lower a price or hand out credits without the margin gate passing on measured cost.
- A vendor swap ships behind a flag, with a sample-quality comparison attached to the PR.
- All figures state their source and date; list prices are labelled "list", measured ones "measured".
- Check open PRs first. One PR per run. Finance PRs avoid UI files while a `ceo-design/*` PR is open.
