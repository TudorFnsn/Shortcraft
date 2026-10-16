# Finance ledger

Owned by the Business CEO routine (`docs/routines/business-ceo.md`). The routine
appends a row per run; the owner fills the fixed-cost table. No secrets here.

## Fixed monthly costs (owner to fill)

| Item | Vendor/plan | € / month | Billing date | Notes |
| ---- | ----------- | --------- | ------------ | ----- |
| Hosting | Vercel Hobby | 0 | | Upgrade trigger: commercial use / limits |
| Database | Supabase (plan?) | ? | | |
| Voice | ElevenLabs (plan? custom-voice slots) | ? | | |
| Domain | ? | ? | | |
| Email | Resend free (100/day) | 0 | | |
| Errors | Sentry (plan?) | ? | | |

## Run log

| Date | MRR € | Paying subs | Gross margin % | API cost / Standard 15s | API cost / Premium 15s | Fixed cost € | Notes |
| ---- | ----- | ----------- | -------------- | ----------------------- | ---------------------- | ------------ | ----- |
| 2026-10-16 | n/a (no live payments) | n/a | gate: Pro 3.00x | $0.07 (researched) | ~$1.10 (researched) | ? | First run; Stripe unauthorised, Supabase connector failed |
