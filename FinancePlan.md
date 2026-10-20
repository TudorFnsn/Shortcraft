# FinancePlan — Shortcraft profit track

> **Source of truth for money.** Owned by the **Finance CEO** routine (`docs/routines/finance-ceo.md`).
> `TheMasterPlan.md` §7 still holds the pricing and the 3x margin gate; this file holds
> measurement, vendor costs, alternatives and the monetisation backlog. Every Finance PR updates it.
>
> Last updated: 2026-10-20 (created; first baseline)

## 1. Charter

| Question | Answer |
| --- | --- |
| Goal | Maximise **profit per month**, steered by MRR growth, blended gross margin and cash payback. |
| Guardrails | Margin gate (`scripts/margin-report.mts`) stays PASS (≥3x). No unmeasured price in the catalog. No quality drop users would notice without owner OK. |
| Autonomy | PR-gated code on `ceo-finance/*`. **Proposals only** for prices, plans, Stripe objects, contracts, live keys. Never merges. |
| Cadence | Daily cloud routine "Shortcraft Finance CEO", 07:00 UTC, master agent + parallel sub-agents. |

## 2. KPIs (fill every run; newest row on top)

| Date | MRR (€) | Paying subs | Trial→paid | Gross margin | API cost / done video (std / prem) | Failed-job rate | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-20 | 59.98 *(test mode, 2× Pro, likely owner)* | 2 | n/a (6 profiles) | not meaningful yet | $0.20 / $1.92 | 3 of 18 (17 %) | Baseline. No live revenue yet. |

## 3. Baseline (2026-10-20, read-only Supabase SQL)

- 18 jobs since 2026-09-28: 15 done, 3 failed. Logged API cost **$8.19** (live pricing × usage, not invoices), 58,936 credits charged.
- Done jobs: 12 Standard = $2.43 (avg **$0.20**), 3 Premium = $5.76 (avg **$1.92**). Premium is 70 % of all logged cost from 20 % of jobs.
- Standard average ($0.20) is ~4x the catalog's estimate (~$0.05 for 15–30s): check script length, retries, voice-design and failed-job spend before trusting the 9x Starter margin.
- Pro plan: €29.99 net ≈ €24.4 after VAT/Stripe. One Premium 30s video ($1.92) ≈ 8 % of that; the gate only passes at exactly 3.0x, so one cost increase fails it.
- Vercel: team has no billable charges (Hobby). Supabase/fal/ElevenLabs/Anthropic invoices: **not yet visible** (see §7).
- Stripe connector: needs re-authorisation in this environment and is test-mode only; live MRR unknown.

## 4. Vendor watchlist (prices from third-party snippets, **verify on official pages before any switch**)

| Slot | Today | Candidate | Reported price | Why / risk |
| --- | --- | --- | --- | --- |
| Image-to-video | fal Kling 2.5 Turbo Pro ~$0.07/s (catalog $0.12/s) | Wan 2.6 I2V Flash on Atlas Cloud | ~$0.018/s ([Atlas](https://www.atlascloud.ai/blog/guides/cheapest-api-provider-seedance-kling-wan)) | ~4x cheaper; vendor's own table; quality for horror/comedy unproven; test on 10 real scenes |
| Image-to-video | same | Wan 2.2 Turbo (Atlas) / Wan 2.2 A14B on fal | $0.02/s / $0.04–0.08/s | fal is already integrated, so Wan on fal is the zero-adapter test |
| Image-to-video | same | Seedance Fast / Kling v3 Std | ~$0.07–0.08/s | no saving vs today; only for quality |
| Voice | ElevenLabs Flash ≈ $50–60/1M chars | Deepgram Aura-1 / Aura-2 | $15 / $30 per 1M ([roundup](https://fast.io/resources/best-ai-text-to-speech-tools-2026/)) | voice is ~$0.00075/s, tiny share; **no word timestamps from Deepgram** would break captions, and Voice Studio depends on ElevenLabs. Low priority. |
| Script | Claude Sonnet 5.5 ($2/$10 per MTok) | Haiku-class + prompt caching + batch | see Anthropic pricing | script is $0.04/video; test quality on 20 prompts |
| Hosting | Vercel Hobby + Supabase | stay | $0 | Hobby forbids commercial use: move to Pro (~$20/mo) when live revenue starts (compliance, not optional) |
| Storage | Supabase Storage | Cloudflare R2 | no egress fees | planned in master plan |

## 5. Ideas backlog (ranked by € per effort; update with real numbers)

1. **Fix Premium economics first:** hero-shot Premium (AI clip on scene 1 only, ~1/3 cost) and measure real fal invoices; lower the 0.12 $/s catalog assumption only after measurement.
2. **A/B Wan on fal** behind `FAL_VIDEO_MODEL` (zero code): 10 scenes, compare look and cost per scene. Potential: Premium cost down 40–75 %.
3. **Yearly plans** (e.g. 2 months free): brings cash forward, lowers churn. Needs Stripe prices (owner approval).
4. **Failed-job spend:** 17 % failures; find which step fails after paid vendor calls and stop earlier / validate before spending.
5. **Trial burn control:** cap trial to Standard only, require confirmed email (already), watermark stays.
6. **Top-up nudges** when credits < one video (lifecycle email exists).
7. **Affiliate 30 % recurring** only after LTV/CAC is measured.
8. Annual vendor commits / volume tiers only once monthly vendor spend > €200.

## 6. Owner decisions pending

_None yet._ (Finance CEO appends proposals here with numbers, risk and rollback.)

## 7. Access requests (what the routine needs, so it needs to ask once)

- **Stripe:** re-authorise the claude.ai Stripe connector (Settings → Connectors); add the **live** account when live. Needed for MRR, churn, refunds.
- **fal.ai, ElevenLabs, Anthropic:** monthly spend totals (or read-only usage-export keys) so catalog costs use invoices, not list prices. Anthropic: Console → Usage; ElevenLabs: Subscription → Usage; fal: Billing → Usage.
- **Vercel / Supabase invoices:** Vercel connector works (billing is empty on Hobby); Supabase MCP (`.mcp.json`) failed with a proxy tunnel error in one environment while the claude.ai connector worked, so use the connector.
- **Ad spend / CAC:** none yet; add once paid ads start.
- **Suggested add-ons:** PostHog (funnels, attribution), Stripe Sigma/Revenue reports, Resend (email stats), a Google Sheets/Docs connector for a monthly P&L, Slack for the digest.

## 8. Changelog

- **2026-10-20** — Finance track created: charter, baseline from live DB, vendor watchlist, routine prompt (`docs/routines/finance-ceo.md`). No code change. (Claude, interactive)
