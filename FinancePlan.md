# FinancePlan — Shortcraft

> Owned by the **Business CEO** routine (`docs/routines/business-ceo.md`). Goal: maximum
> cash return. Last updated: 2026-10-19 (first run; no live revenue data was reachable).

## 1. Guard rail

`npx tsx scripts/margin-report.mts` (2026-10-19): PASS. Net revenue ÷ worst-case API cost:
Starter 5.62x, Pro 3.00x, Ultra 3.23x, top-ups 3.96–5.92x. Trial burn $0.23 per signup.
Pro is the tightest product: any premium repricing must re-run the gate.

## 2. MRR ratio dashboard (fill every run)

| Metric                                 | Value                                                   | Source                                                  |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| MRR (EUR)                              | unknown                                                 | Stripe: blocked, needs OAuth; app is still on test mode |
| Paying subscribers by plan             | unknown                                                 | `metrics-report.mts`                                    |
| New / expansion / churned MRR          | unknown                                                 | Stripe                                                  |
| Net revenue retention                  | unknown                                                 | Stripe                                                  |
| Gross margin per video (std / premium) | measured: std 15s $0.037, 30s $0.049; premium 30s $1.92 | `render_jobs`, 2026-10-08 renders                       |
| Vendor spend vs MRR                    | unknown                                                 | §3                                                      |
| Trial → paid                           | unknown                                                 | `metrics-report.mts`                                    |

Until Stripe is live the honest MRR is **€0**; every action below is pre-revenue prep.

## 3. Cost map (what we pay, what drives it)

| Vendor                           | Driver                         | Cost per unit now                   | Notes                                                  |
| -------------------------------- | ------------------------------ | ----------------------------------- | ------------------------------------------------------ |
| fal.ai video (premium only)      | 5 s clips, Kling 2.5 Turbo Pro | ~$0.07/s list, catalog uses $0.12/s | Kling bills fixed 5 s, so 2–3 s scenes waste up to 60% |
| fal.ai images                    | FLUX schnell / dev             | $0.003 / $0.025 per image           | Negligible                                             |
| ElevenLabs                       | Flash v2.5                     | ~$0.05 / 1k chars                   | Plan slot cap matters for saved voices                 |
| Anthropic script                 | Sonnet 5.5, ~2k in / 1.5k out  | ~$0.04 per script                   | Small; Haiku-class would be ~$0.01                     |
| Standard video render            | ffmpeg in-house, Ken Burns     | $0                                  | Already the cheap path                                 |
| Vercel, Supabase, Resend, Sentry | fixed plans                    | not yet read                        | Owner to paste invoices (§5)                           |

Tokens: a standard video burns about 1.8k–3.1k credits for $0.04–0.05 of API cost, so the
credit-to-dollar markup is large on Standard (healthy) and held near 3x on Premium.

## 4. Findings and ranked ideas (impact ÷ effort)

1. **Vercel Hobby is non-commercial.** Charging customers on Hobby breaks Vercel's terms and
   risks suspension. Budget Pro (~$20/seat/mo) before Stripe goes live. A compliance cost,
   not an option. (Check the current terms before acting.)
2. **Premium "hero shot"** (AI clip on scene 1 only): ~$0.45 vs ~$1.10 per 15s video. Lets us
   sell Premium on Starter-adjacent plans and raise attach rate. Needs one measured clip first.
3. **Measure, then reprice Premium.** The catalog assumes $0.12/s; list is $0.07/s. If the
   fal invoice confirms it, Pro's margin rises from 3.0x to about 4x, which is room to cut the
   1,420 cr/s price (conversion) or keep it (profit). Owner: read the fal dashboard usage.
4. **Annual plans** (`stripePriceIdYearly` is already null-ready): typically 15–20% discount for
   cash up front and lower churn. Highest cash-return item that is cheap to build.
5. **Provider scout, video** (list prices from search snippets, unverified, vendor-authored):
   Kling 2.5 Turbo Pro $0.07/s (current), Kling 3.0 Pro from $0.112/s, Seedance 2.5 ~$0.10–0.13/s
   at 480p via BytePlus/Atlas/Segmind, LTX-2.3 Pro $0.08/s, Wan 2.7 $0.15/s. **Conclusion: fal's
   Kling 2.5 is already at the low end; no clear cheaper swap.** Savings come from fewer
   billed seconds (hero shot, 5 s-aligned scenes), not a vendor change. Worth a smoke test:
   LTX-2 at $0.0018/MP and Seedance 2.5 480p as the cheapest options for the hero shot.
6. **Cut trial burn** ($0.23/signup): fine now; revisit only when CAC data exists.
7. **Credit expiry / rollover rules** and top-up pricing: breakage is margin. Decide policy
   (currently unspecified in this file) before launch; wording goes in Terms.
8. **Storage egress**: move media to Cloudflare R2 (already planned) once video views grow.
9. **Script model**: Haiku-class for scripts saves ~$0.03/video; only if quality holds on A/B.

## 5. Information the routine needs from the owner

- Monthly invoices or usage for fal.ai, ElevenLabs (plan tier, slots), Anthropic, Vercel,
  Supabase plan, Resend, Sentry, domain. Paste totals here or give read-only admin keys.
- Authorize the **Stripe** connector in claude.ai (read only); later add the live account.
- Retry the **Supabase** connector (failed with a proxy tunnel error on 2026-10-19).
- Target: desired monthly profit and break-even date, so ideas can be ranked against it.
- Is there any paid acquisition planned? (CAC needs spend + signups.)

## 6. Decisions

None yet. Every change to live prices or vendors needs an owner decision recorded here.

## 7. Suggested tools

- Stripe connector + Sigma (MRR, churn, cohorts).
- Vercel connector (`list_billing_charges`, already connected).
- Supabase connector for `render_jobs` cost queries.
- PostHog for the visitor→paid funnel (wire after the cookie banner).
- Optional: a read-only fal.ai / ElevenLabs usage export on a schedule.

## 8. Changelog

- 2026-10-19: created the routine definition and this plan; ran the margin gate; first
  provider scan; flagged Vercel Hobby, hero shot, annual plans.
