# Routine: FinOps (profit & MRR optimizer)

Schedule: weekly (Mon 07:00 UTC) plus on demand. Same shape as the other
routines: a **DM master agent** that never does deep work itself. It plans,
fans out to the specialist agents in `.claude/agents/finops-*.md` in parallel,
merges their reports, and decides what ships.

## Mission
Maximise cash return of Shortcraft. Every run: (1) read the MRR ratio,
(2) compare what a video costs us (tokens/API/compute) with what we charged,
(3) find cheaper or better vendors and monetisation levers, (4) implement the
safe wins, (5) propose the rest. Cash beats vanity: prioritise changes by
`expected extra net USD / month ÷ effort`.

## Hard rules
- Never push to `main`. Work on the routine's branch, open a PR only when a code change is included.
- Never change live Stripe prices, plans or coupons, or flip `MOCK_PROVIDERS`, without owner approval. Propose with numbers instead.
- Every pricing/model change must keep `npx tsx scripts/margin-report.mts` green (>= 3x worst-case). Run lint, typecheck and tests before pushing.
- No secrets in commits, logs or PRs. Read-only access to Stripe and Supabase unless a task says otherwise.
- Notify (PushNotification) only when something needs the owner: MRR drop, a product below 3x, a vendor bill spike, a PR ready, or a missing data source. Quiet run = no notification.

## Master agent procedure
1. **Preflight** – check each data source below; list what is unreachable. If a source is missing, say exactly what is needed (see "Access checklist") and continue with what exists.
2. **Fan out in parallel** (one message, all agents), passing each only its brief:
   - `finops-revenue` – MRR, ARR, net new MRR, churn, trial→paid, ARPU, LTV/CAC proxy, failed payments.
   - `finops-cogs` – cost per video vs revenue per video, credits burned vs `api_cost_usd`, per-provider spend, tokens used.
   - `finops-infra` – fixed costs (Vercel, Supabase, Sentry, domains, tools) vs MRR.
   - `finops-vendor-scout` – cheaper/better providers for each slot in `src/config/models.ts`.
   - `finops-growth` – pricing, packaging, annual plans, top-ups, trial economics, upsell and retention ideas.
3. **Merge** into `docs/finops/LEDGER.md` (append a dated section; keep the table at the top current).
4. **Decide**: pick at most 3 changes. Delegate to `finops-implementer` those that are code-only and margin-safe. Everything else becomes a "Proposal" with numbers.
5. **Report**: update the ledger, then notify only per the rules above. Lead with the single biggest number (MRR, gross margin %, or the biggest saving).

## Access checklist (what this routine needs)
| Source | Purpose | Status when written |
|---|---|---|
| Stripe (MCP connector or restricted read-only key) | MRR, churn, refunds, fees | connector needs OAuth |
| Supabase (MCP, project `iqvrovjwoavvmhaithwn`) | `render_jobs.api_cost_usd`, `credit_transactions`, `subscriptions` | MCP failed to connect (proxy tunnel) |
| Vercel (MCP: `list_billing_charges`, usage) | hosting cost | connected |
| GitHub (MCP) | PRs, repo | connected |
| fal.ai usage/billing | video + image spend | no access; needs an Admin API key or CSV export |
| ElevenLabs usage | voice spend | no access; needs API key with usage scope |
| Anthropic Console usage (workspace `ANTHROPIC_WORKSPACE_ID`) | script tokens | no access; needs Admin API key |
| Sentry plan/usage | fixed cost | no access |
| Bank/accounting export (monthly CSV) | every other payment | none; owner drops it in `docs/finops/inputs/` |

## Suggested connectors / tools
Stripe MCP (authorise it), Supabase MCP (fix proxy allowlist for `mcp.supabase.com`), Vercel MCP,
PostHog or Plausible (funnel → paid), Lemon Squeezy / Paddle as a merchant-of-record comparison
(VAT handling vs Stripe + Stripe Tax), ChartMogul or Baremetrics (free-tier MRR cross-check),
Helicone or Langfuse (per-call LLM token and cost tracking), and a spreadsheet connector for the bank CSV.
