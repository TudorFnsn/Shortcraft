# Shortcraft — finance ledger

> Owned by the **CFO routine** (`docs/routines/cfo-routine.md`). Every figure is
> labelled MEASURED / LIST / ESTIMATE. Newest section first. Product and priority
> calls stay in `TheMasterPlan.md`.

## Access status

| System                  | Status (2026-10-13)                                         | Needed for                  |
| ----------------------- | ----------------------------------------------------------- | --------------------------- |
| GitHub repo             | read/write on `cfo/*` (confirm on first run)                | PRs                         |
| Stripe connector        | sandbox only (`acct_1UKkSC0LHtTQ4zpU`, test mode)           | MRR, churn, fees (no real data yet) |
| Supabase connector      | configured; last attempt failed (`ERR_PROXY_TUNNEL`)        | per-job cost vs credits     |
| Vercel connector        | available this session; not yet used for billing            | hosting spend               |
| fal.ai / ElevenLabs / Anthropic usage | **no access**                                 | invoice reconciliation      |

## Snapshot (to be filled by the first run)

| Metric                      | Value | Basis |
| --------------------------- | ----- | ----- |
| MRR (EUR)                   | n/a   | needs Stripe live |
| Net new MRR (30d)           | n/a   |       |
| Paying subscribers          | n/a   |       |
| Gross margin / video (std)  | n/a   | list: ~$0.07 per 15s |
| Gross margin / video (prem) | n/a   | list: ~$1.10 per 15s (Kling) |
| Trial burn / signup         | ~$0.14–0.25 | gate estimate |

## Cost ledger (recurring payments)

| Vendor | Plan | €/mo | Usage-based? | Renewal | Candidate to cut? |
| ------ | ---- | ---- | ------------ | ------- | ----------------- |
| Vercel | ?    | ?    | yes          | ?       |                   |
| Supabase | ?  | ?    | yes          | ?       |                   |
| Anthropic | API | ?   | yes          | -       | Haiku for scripts? |
| fal.ai | API  | ?    | yes          | -       | cheaper host for same model? |
| ElevenLabs | ? | ?   | yes          | ?       | cheaper TTS?      |
| Resend / Sentry / domain / GitHub | ? | ? | | ? |                   |

## Provider market (dated comparison)

_Empty — first CFO run fills this from the vendor & model scout._

## Decisions pending (owner)

_None yet._

## Data I need

See `docs/routines/cfo-routine.md` §6.
