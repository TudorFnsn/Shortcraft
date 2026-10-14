# FinancePlan — Shortcraft

> **Source of truth for the money track.** Owned by the **Finance CEO** routine
> (`docs/routines/finance-ceo.md`). `TheMasterPlan.md` wins on product and priority;
> this file wins on costs, pricing research and provider choices. Every Finance PR
> updates the KPI table, backlog and changelog here.
>
> Last updated: 2026-10-14 (seed; no live data read yet)

---

## 1. Charter

Maximise **cash return** with the product we have: highest net MRR for the least API, hosting
and tool spend, without breaking the 3x margin gate or visibly worsening the videos.

Priorities, in order: (1) never lose money on a video (gate, failed-job waste); (2) cut cost per
video; (3) raise revenue per paying creator; (4) cut fixed costs; (5) new revenue lines.

## 2. How the team works

Master agent = Finance CEO routine. Sub-agents in `.claude/agents/`: `finance-unit-economics`,
`finance-vendor-scout`, `finance-revenue`, `finance-infra`. Output: one PR a day on
`ceo-finance/*`, a KPI row below, and a notification only when the owner is needed.

## 3. KPI log (append a row per run; newest on top)

| Date | MRR EUR | Net MRR USD | Paying | API spend 30d | Failed-job spend | Rev/cost × | Gross margin | Notes                                                           |
| ---- | ------- | ----------- | ------ | ------------- | ---------------- | ---------- | ------------ | --------------------------------------------------------------- |
| —    | —       | —           | —      | —             | —                | —          | —            | Run `npx tsx scripts/finance-report.mts`; first run fills this. |

Targets: revenue/cost ≥ 3x on every product (gate), blended gross margin ≥ 75%, failed-job spend < 2% of API spend.

## 4. Known cost model (from `src/config/models.ts`, list prices, not yet measured)

| Step          | Provider                               | List cost                   | Notes                                                         |
| ------------- | -------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| Script        | Anthropic Sonnet 5.5 ($2/$10 per MTok) | ~$0.04 / video              | Haiku-class for simple themes + prompt caching are candidates |
| Image         | fal FLUX schnell / dev                 | $0.003 / $0.025 per MP      | one 720×1280 image per scene                                  |
| Standard clip | in-house Ken Burns                     | $0                          | already the cheap path                                        |
| Premium clip  | fal Kling 2.5 Turbo Pro                | ~$0.07 / s, 5s billed clips | the dominant cost; gate assumes $0.12/s                       |
| Voice         | ElevenLabs Flash v2.5                  | ~$0.00075 / s               | plan slots limit saved voices                                 |
| Render        | ffmpeg on Vercel                       | ~$0.01                      | wall time on Vercel still unmeasured                          |

Credits: 15s standard ≈ 2,024 cr, 15s premium ≈ 26.5k cr. Margin gate (2026-10-05): Starter 9.4x, Pro 3.0x, Ultra 3.2x, top-ups 4.0–5.9x.

## 5. Backlog (ranked by expected USD/month per hour; the CEO re-ranks each run)

1. **Measure real costs.** `api_cost_usd` is recorded per job but is list-price based. Run the live smoke
   (`npx tsx scripts/live-providers-smoke.mts --premium`), compare with fal's billing dashboard, then lower
   the `video-premium` cost assumption (0.12 → measured) to give Pro headroom or cut price. _(Owner step: FAL_KEY.)_
2. **Cheaper premium clips.** Seed research 2026-10-14 (secondary sources, verify on provider pages):
   Wan 2.2 Turbo i2v ~$0.02/s and Pruna P-Video ~$0.02/s (720p) via Atlas Cloud, Wan 2.5 ~$0.05/s and
   Wan 2.6 ~$0.07/s, Grok Imagine ~$0.05–0.08/s, Kling 3.0 Turbo ~$0.11/s, Kling 2.5 Turbo Pro $0.07/s on
   fal (kie.ai lists ~$0.21 per 5s clip ≈ $0.04/s). A Wan/Pruna swap could cut premium clip cost 3–70%.
   Action: adapter + `FAL_VIDEO_MODEL`-style env flag, A/B on 10 scenes, keep Kling as fallback.
3. **Hero-shot premium**: AI clip on scene 1 only, stills elsewhere (~$0.45 vs ~$1.10 per 15s). Cheaper plan tier or higher margin.
4. **Annual plans** (cash up front, lower churn). Stripe price objects + `/pricing` toggle.
5. **Failed-payment recovery** (Stripe Smart Retries + dunning emails via Resend).
6. **Storage retention**: delete finished free-tier renders after N days; watch Supabase storage/egress.
7. **Script model routing**: Haiku-class for simple themes; Anthropic prompt caching on the system prompt; Batch API for non-urgent work (~50% off).
8. **Voice**: price-compare ElevenLabs Flash vs alternatives only if voice exceeds ~5% of per-video cost (today it does not).
9. **Trial burn** (~$0.14/signup): keep; revisit if signups grow faster than conversion.

## 6. Ruled out (so sub-agents do not redo it)

- Hosted render API (~$0.30/video): replaced by in-house ffmpeg (~$0.01).
- Per-scene AI video for Standard: replaced by animated stills.

## 7. Questions for Tudor (the routine adds to this list)

1. **Real spend:** can you share the last 30 days of fal.ai, ElevenLabs, Anthropic, Vercel and Supabase invoices (or confirm the
   Anthropic/ElevenLabs/fal dashboards' monthly totals)? Until then the plan uses list prices.
2. **Stripe is connected in test mode only.** Is there a live account yet? Real MRR needs the live key (read-only restricted key is enough).
3. **Current plans of each vendor** (Vercel Hobby/Pro, Supabase Free/Pro, ElevenLabs tier, Resend tier).
4. **Business inputs:** target monthly profit, acceptable video quality trade-offs, EU VAT/OSS status, any ad/marketing spend to include in ROI.
5. **Allowed to enable** the Stripe connector's write tools for dunning/annual prices later, or keep Finance strictly PR-only?

## 8. Suggested tools and connectors (what would help the Finance CEO most)

Connected today: Stripe (test), Supabase (project `iqvrovjwoavvmhaithwn`; the repo's `.mcp.json` entry failed to connect from the cloud
session on 2026-10-14, the claude.ai connector is the fallback), Vercel, GitHub.
Worth adding, in order of value:

1. **Stripe live mode, restricted read-only key** — real MRR, churn, refunds, disputes.
2. **Vendor billing data** — fal.ai (usage/billing export or API key with usage read), Anthropic Admin API / Usage & Cost API
   (needs an admin key), ElevenLabs usage endpoint (`/v1/user/subscription`). Store as read-only env vars in the routine, never in the repo.
3. **PostHog or Plausible** — visitor → signup → paid funnel and CAC by channel (the plan already defers PostHog until a cookie banner exists).
4. **Google Search Console** (SEO pages ROI) and **Google Sheets/Drive connector** — a living P&L the owner can read on a phone.
5. **Slack or Gmail connector** — digest delivery beyond push notifications.
6. **Skills/plugins:** the `xlsx` skill for a monthly P&L workbook, `dataviz` for the KPI dashboard artifact, a Vercel
   Observability/Usage query for render GB-seconds, and the Claude API skill for prompt-caching and Batch API changes.
   Workflow tool (multi-agent) if the owner wants deeper, parallel provider benchmarking runs.

## 9. Changelog (newest on top)

- 2026-10-14 — Finance track created: charter, `docs/routines/finance-ceo.md`, four sub-agents, `scripts/finance-report.mts`
  (+ `features/metrics/unit-economics.ts`, tested), seeded provider price research.
