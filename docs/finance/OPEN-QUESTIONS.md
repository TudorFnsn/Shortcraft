# Open questions for the owner

Answer inline or edit `src/config/fixed-costs.ts`; the Finance CEO removes answered items.

1. What do you pay per month for Vercel, Supabase, ElevenLabs (which plan and how many voice slots), Resend, Sentry, the domain, and the Claude subscription? (All `null` in `fixed-costs.ts`, so the MRR ÷ cost ratio ignores fixed costs until filled.)
2. Can you authorize the **Stripe** and **Vercel** connectors in claude.ai, and re-connect **Supabase** (it failed with `ERR_PROXY_TUNNEL` on 2026-10-17)?
3. Can you add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the routine's environment (used read-only by `scripts/finance-report.mts`)?
4. Usage exports or read-only keys for fal.ai, Anthropic (Usage & Cost Admin API) and ElevenLabs?
5. Is the app live with paying customers yet, or still Stripe test mode? What monthly profit target or runway do you want to hit?
6. Are you open to a merchant of record (Paddle / Lemon Squeezy / Polar) for EU VAT, and to yearly plans?
