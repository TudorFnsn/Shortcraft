# Fixed costs and other payments

> Owner-maintained. The Finance CFO routine reads this file; it cannot see
> recurring payments that are not in Stripe, Vercel or Supabase billing.
> Add one row per recurring payment. Amounts in EUR per month (annual ÷ 12).

| Service              | What for                             | EUR/mo   | Billed on | Renewal / term | Can we cancel or downgrade? | Notes                         |
| -------------------- | ------------------------------------ | -------- | --------- | -------------- | --------------------------- | ----------------------------- |
| Vercel               | Hosting, cron                        | ?        | ?         | ?              | ?                           |                               |
| Supabase             | DB, auth, storage                    | ?        | ?         | ?              | ?                           | project ShortCraft, eu-west-1 |
| ElevenLabs           | Voice (plan sets custom-voice slots) | ?        | ?         | ?              | ?                           |                               |
| fal.ai               | Images, Premium video (usage)        | usage    | prepaid?  | n/a            | n/a                         |                               |
| Anthropic            | Scripts (usage)                      | usage    | ?         | n/a            | n/a                         |                               |
| Resend               | Lifecycle email                      | ?        | ?         | ?              | ?                           |                               |
| Sentry               | Errors                               | ?        | ?         | ?              | ?                           |                               |
| Domain               | shortcraft domain                    | ?        | ?         | ?              | ?                           |                               |
| Claude / Claude Code | Routines, dev                        | ?        | ?         | ?              | ?                           |                               |
| Stripe               | Fees only (1.5% + €0.25 assumed)     | per sale | per sale  | n/a            | n/a                         |                               |

Replace every `?` once known. The routine flags rows still unknown.
