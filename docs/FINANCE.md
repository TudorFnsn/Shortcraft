# Shortcraft finance review

Owned by the **Business CEO** routine (`trig_01EmedT5xwF6Pn8NSznhMcHg`). Newest review on top.
Rule: read-only on live systems; any price change, migration, Stripe object or provider swap needs the owner's OK.

## 2026-10-19 — first review (code + list prices only, no live data)

### Data access (blocking the real MRR / cost-per-video numbers)

| Source | State in this run | Needed for |
| --- | --- | --- |
| Stripe connector | Needs OAuth in claude.ai connector settings; test-mode account only | MRR, churn, ARPU, fees |
| Supabase connector | Failed to connect (`ERR_PROXY_TUNNEL`); no `.env.local` in the cloud clone | paying subs, credits burned, render_jobs |
| Vercel connector | Connecting; `list_billing_charges` could give hosting spend | hosting cost |
| fal.ai / ElevenLabs / Anthropic bills | No access | actual provider spend |

Until these exist, MRR ratio = unknown. Stripe is in test mode, so real MRR is probably €0 today (not verified).

### Unit economics from the catalog (`src/config/models.ts`, `plans.ts`)

- Pro full burn on Premium: 100k credits / 1,420 per s = 70 s of AI video. At the assumed $0.12/s that is $8.45 vs about $26.2 net revenue (after 20% VAT and Stripe fees) = 3.1x. This matches the margin gate.
- The assumed $0.12/s is conservative. `fal-video.ts` sends Kling 2.5 Turbo Pro 5 s clips for scenes of up to 6 s, so a scene costs 5 × $0.07 = $0.35, or $0.058 per credited second. Real Premium margin is then about 6x, not 3x. Unconfirmed: it needs one measured live run.
- Standard (Ken Burns stills) costs about $0.07 per 15 s video. It is nearly free, so Standard is where the margin is. Starter at 9.4x is the best-margin plan.
- Biggest cost line per Premium video is fal video clips. Script (Claude, $0.04) and voice (ElevenLabs Flash) are small.

### Cheaper video options (list prices from reseller and fal pages, directional only; verify on provider pages)

| Option | Quoted price | Note |
| --- | --- | --- |
| fal Kling 2.5 Turbo Pro (current) | $0.07/s | baseline |
| Atlas Cloud Seedance 2.0 Mini | about $0.045/s | about 35% cheaper; check quality and 9:16 |
| Atlas Cloud Seedance 2.0 | about $0.09/s | |
| Atlas Cloud Kling V3 Turbo | about $0.095/s | |
| fal Kling 3.0 Pro | $0.112/s | more expensive |
| fal LTX-2-19B | $0.0018/MP of video | cheapest if quality is acceptable |
| fal Veo 3.1 Fast | $0.10/s | |

Sources: fal.ai/learn/tools/best-image-to-video-apis-2026, ask.atlascloud.ai/cheapest-image-to-video-api, techsy.io best AI video providers. They disagree with each other, so do not act on them without a 20-clip A/B.

### Recommendations (ranked by cash impact)

1. **Connect Stripe live-read and Supabase** so the next run reports real MRR, paying subs, credits burned per user and cost per finished video. Without it the routine can only estimate.
2. **Measure one real Premium job** (`scripts/live-providers-smoke.mts --premium`). If cost is near $0.058/s, either lower Premium credits (conversion) or keep it as margin. Decide with data, not now.
3. **Push Standard, upsell Premium by hero shot** (AI clip on scene 1 only, about $0.45 per 15 s video). It keeps COGS low and gives a visible quality upgrade.
4. **A/B Seedance 2.0 Mini and LTX-2 against Kling** on 20 prompts; adopt only if quality is on par. It is one row in `models.ts` plus an adapter, per the catalog design.
5. **Annual plans** (`stripePriceIdYearly` exists but is null): about 2 months free pulls cash forward and cuts churn and Stripe fixed fees.
6. **Top-up fixed fee**: the €0.25 Stripe fixed fee is 2% of the €12 pack. Fine, but do not add smaller packs.
7. Open PRs #91 (referrals) and #88 (trial-spent email) directly help conversion. Review those first.

### Suggested connectors and tools

- Stripe (authorize in claude.ai connectors; later a restricted read-only live key) and Supabase (retry).
- Vercel connector for billing charges and usage.
- fal.ai usage/billing export (CSV or API key with read scope), ElevenLabs and Anthropic usage exports. Add a `provider_usage` table or log line per call to compare metered cost vs billed credits per job.
- Optional: PostHog or Plausible for signup→paid funnel; Sentry already present.

### Questions for the owner

- Is Stripe live yet? What is the current paying count, if any?
- Are there any provider invoices to date (fal, ElevenLabs, Anthropic, Vercel, Supabase plan)?
- Any CAC or ad spend to include?
