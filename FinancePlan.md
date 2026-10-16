# Finance plan

Owned by the **Finance CEO** routine (prompt and setup: `docs/routines/finance-ceo.md`). Product and
priority calls stay in `TheMasterPlan.md`; this file holds the numbers.

## 1. Dashboard (routine overwrites each run)

| Metric | Value | Source | As of |
| --- | --- | --- | --- |
| MRR | unmeasured (Stripe connector is sandbox only) | Stripe | |
| Net new MRR / MRR churn / quick ratio | unmeasured | Stripe | |
| Active paying subscribers | unmeasured | Stripe | |
| Gross margin % | unmeasured | Stripe + `render_jobs.api_cost_usd` | |
| Cost per finished video (standard / premium) | list-price model: ~$0.07 / ~$1.10-2.30 | `margin.ts` | 2026-10-16 |
| Trial burn per signup | $0.14-0.25 (model) | `margin.ts` | 2026-10-16 |
| Monthly recurring vendor spend | unmeasured | ledger below | |

## 2. Recurring payments ledger

| Vendor | What | Amount | Renews | Needed? | Source |
| --- | --- | --- | --- | --- | --- |
| Vercel | hosting | ? | ? | | `list_billing_charges` |
| Supabase | db/auth/storage | ? | ? | | dashboard |
| ElevenLabs | TTS + voice slots | ? | ? | | dashboard |
| fal.ai | images + premium video | usage | | | usage API |
| Anthropic | scripts | usage | | | Admin API |
| Resend, Sentry, domain | email, errors, domain | ? | ? | | dashboard |
| Stripe | fees per charge | ~2.9% + fixed | | | Stripe |

## 3. Provider benchmarks (measured only)

None yet. Method: same prompt through the current and candidate provider, record cost, latency and a
quality note, keep behind the adapter layer.

## 4. Needs owner

- Connect the **live** Stripe account (read-only restricted key is enough) so MRR is real.
- Give the routine read-only usage/billing access for fal.ai, ElevenLabs, Anthropic, and Supabase service role.
- Create the routine from `docs/routines/finance-ceo.md` (this session cannot create routines).

## 5. Ideas backlog (euro impact, confidence, effort)

Annual plans with discount; usage overage; low-credit top-up nudge; upgrade prompt at plan limits;
dunning and win-back emails; pause-instead-of-cancel; referral credits; cheaper video model for Premium
hero shot; Claude prompt caching + smaller model for non-creative steps; API/white-label tier.

## 6. Log

- 2026-10-16: file and routine prompt created. No measurements yet.
