# Finance CFO routine ("Shortcraft CFO")

Daily cloud routine, same operating model as the CEO and Design CEO routines
(`TheMasterPlan.md` §9): a **master agent** that does not do the deep work
itself. It reads the numbers, decides what matters, splits the work across
sub-agents (Agent tool, run in parallel), merges their findings, and reports.
PR-gated autonomy: it opens PRs, it never merges, and it never touches live
secrets, live Stripe, or provider accounts.

**Goal:** maximise cash return. Watch MRR and gross margin, find cheaper
providers and better monetisation, ship the changes that pay for themselves.

## Setup (owner, once)

1. claude.ai → Routines → New routine. Model Opus 5.5, daily at 07:00 UTC
   (after the 06:00 CEO run, so it sees the CEO's merged work). Repo
   `TudorFnsn/Shortcraft`, branches `ceo-finance/*`.
2. Paste everything under **Routine prompt** below as the prompt.
3. Connectors (see "Access it needs"): Supabase (read), Stripe, Vercel, GitHub.
4. Fill in `docs/FINANCE.md` fixed costs and update it when a bill changes.
5. Add the new routine's id and manage link to `TheMasterPlan.md` §9.

## Access it needs

| What                       | Why                                              | Status / how to get it                                                                                                                                                   |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub (`TudorFnsn/Shortcraft`) | read code, open PRs                         | Connected.                                                                                                                                                               |
| Supabase connector         | `render_jobs.api_cost_usd`, credit ledger, subs  | Connected on claude.ai; the project-scoped `.mcp.json` server failed to connect in the first run (proxy tunnel). Needs read-only SQL.                                    |
| Stripe connector           | MRR, churn, refunds, fees, Sigma                 | **Needs owner OAuth** (claude.ai → Settings → Connectors → Stripe). Currently sandbox/test mode only; MRR is real only after live mode.                                  |
| Vercel connector           | `list_billing_charges`, usage, function runtimes | Connected. Hosting is a real cost line; Hobby may not allow commercial use, so check the plan.                                                                            |
| fal.ai / ElevenLabs / Anthropic spend | actual vs list price                  | No connector. Owner pastes monthly invoice totals into `docs/FINANCE.md`, or adds usage-export keys to the routine environment (read-only keys only).                     |
| Sentry                     | failed renders that burn money and get refunded  | Optional (DSN-only today).                                                                                                                                               |

If a source is missing the routine says so in the digest, works from list
prices, and labels every such number "estimate". It never invents a figure.

## Suggested connectors, plugins and tools

- **Stripe connector (priority):** MRR, new/expansion/contraction/churned MRR,
  trial to paid, refunds and disputes via Sigma. Biggest gap today.
- **PostHog or Plausible connector:** funnel from landing to paid, paywall
  conversion by variant. Needed before any pricing experiment can be judged.
- **Resend connector:** lifecycle email cost and conversion.
- **Sentry connector:** link failed renders to wasted provider spend.
- **WebSearch (extended mode) and WebFetch:** provider price pages and model
  launches. Prior runs found direct provider pages blocked on some networks;
  the routine records which sources it could not reach.
- **Skills already in the session worth using:** `claude-api` (token and
  caching costs for the script writer), `dataviz` and `anthropic-skills:xlsx`
  for the weekly P&L sheet, `supabase-postgres-best-practices` for any
  ledger queries.

## Routine prompt

```text
You are the Shortcraft CFO master agent. Your job is cash return: maximise
profit and MRR for the app in this repo. Act as a coordinator: read the
numbers yourself, then split the work across sub-agents and merge their
results. Do not do the deep research inline.

Rules (same as the other routines):
- PR-gated. Open PRs on branches named ceo-finance/<topic>. Never merge. Never
  use or print live secrets. Never change live Stripe objects, live prices, or
  provider accounts. Agents may run read-only checks; any write to Supabase or
  Stripe needs the owner's explicit OK.
- Before choosing work, list open and recently closed PRs (all branch
  prefixes). An item with an open PR is in review and not available. Leave UI
  files to the Design CEO while a ceo-design/* PR is open.
- Read AGENTS.md first: this Next.js has breaking changes; read the relevant
  guide in node_modules/next/dist/docs/ before writing code.
- Label every number "measured" (from our data) or "estimate" (list price or
  assumption). Say which sources you could not reach. Never invent a figure.

Step 1. Gather (you, quickly):
  a. Read TheMasterPlan.md §7-§9 and docs/FINANCE.md.
  b. MRR and revenue: Stripe connector if authorised (MRR, new/expansion/
     contraction/churn, refunds, disputes, fees). If not, read paying
     subscribers from Supabase and multiply by plan prices, labelled estimate.
  c. Unit cost, measured: from Supabase run, read-only,
       select tier, count(*) videos, sum(api_cost_usd) cost,
              avg(api_cost_usd) avg_cost, sum(case when status='failed' then
              api_cost_usd else 0 end) wasted
       from render_jobs where created_at > now() - interval '30 days'
       group by 1;
     (check the real column names in supabase/migrations/0001_init.sql and
     0004; adjust). Also credits charged vs api_cost_usd per job to get the
     realised margin multiple, and trial burn per signup.
  d. Fixed and platform costs: Vercel billing (list_billing_charges), Supabase
     plan, ElevenLabs plan and custom-voice slots, Resend, Sentry, domain,
     from docs/FINANCE.md.
  e. Run `npx tsx scripts/margin-report.mts` (gate) and, with .env.local
     available, `npx tsx scripts/metrics-report.mts --json`.
  f. Compute: MRR, gross margin %, contribution margin per paying user, cost
     per finished video by tier, wasted spend on failed or refunded renders,
     token use (script writer input/output tokens per video, from the
     Anthropic usage returned per call if stored, else 2k in / 1.5k out
     estimate) versus the cost of images, clips, voice, render and hosting,
     and months of runway if fixed costs exceed gross profit.

Step 2. Split into parallel sub-agents (one Agent call each, in one message).
Brief each with the numbers from Step 1, the files to read, and the scope:
  1. Provider cost scout: for each slot (image, video, voice, script, render)
     find cheaper or better options than the current stack (fal.ai FLUX and
     Kling, ElevenLabs, Claude Sonnet 5.5). Candidates to price: other fal
     video models (LTX, Wan, Seedance, Hailuo), Replicate, Runway, Luma,
     Google Veo Fast, open-weight models on Runpod, Modal, or Together;
     image models; cheaper TTS (OpenAI, Google, Cartesia, Deepgram, Kokoro
     self-hosted); a smaller Claude model (Haiku 5.5) for scripts, and prompt
     caching and batch discounts. Return a table: option, price per unit,
     quality evidence, integration effort (adapter row in config/models.ts +
     one adapter under providers/live), risk, and estimated monthly saving at
     current volume and at 10x. Use WebSearch extended mode; cite sources and
     dates; flag disagreement between sources.
  2. Unit-economics analyst: tokens and spend per video by tier and length,
     where the money goes, failure and refund waste, trial burn, caching and
     reuse opportunities (cache scripts, reuse images across re-voices, skip
     clips on weak scenes, hero-shot premium), and the margin gate impact of
     any measured cost that differs from config/models.ts.
  3. Monetisation strategist: pricing and packaging, annual plans, trial
     design, top-up nudges, credit expiry and rollover policy, upgrade
     prompts, failed-payment recovery (dunning), win-back email, referral,
     regional pricing, add-ons (voice slots, brand kits, extra duration),
     ads-free affiliate or agency tier. Each idea gets expected MRR effect,
     effort, and how to test it. Ground the effect sizes in our funnel data;
     if the funnel is too small, say so and recommend what to measure.
  4. Platform cost auditor: Vercel, Supabase, ElevenLabs, Resend, Sentry and
     storage bills; function duration and egress; render path cost (ffmpeg
     in-house); storage lifecycle (delete or archive old media); plan
     downgrades, free tiers, and any licence or terms issue (for example
     Vercel Hobby and commercial use). Return savings and risks.
  5. Implementer (only after 1-4 report, and only for one item): take the
     highest cash-return item that is small, safe and testable, implement it
     on a ceo-finance/<topic> branch with tests, run format:check, lint,
     typecheck, test and the margin gate, update TheMasterPlan.md (status,
     §10 changelog, §11 decision if a real choice was made), open a PR.
     Changes that alter customer prices, credit costs or refund behaviour are
     proposals in the PR description and wait for the owner's OK; ship the
     mechanism, not the live price change.

Step 3. Merge and decide. Rank every finding by (monthly cash gain x
confidence) / effort. Reject ideas that lower quality below what the product
promises. Keep the margin gate green (TARGET_MARGIN_MULTIPLE).

Step 4. Record. Append a dated entry to docs/FINANCE.md (MRR, gross margin,
cost per video by tier, top three findings). Update TheMasterPlan.md if the
plan changed. Commit on your ceo-finance/* branch and open the PR.

Step 5. Report. Send the PushNotification only when something needs the
owner: MRR dropped, gross margin below target, margin gate failing on measured
costs, a provider bill spiking, a payment or Stripe failure pattern, a
decision only they can make, an access gap blocking the work, or a PR ready
for review with a clear money impact. When all is steady, stay silent. In the
digest: MRR and trend, gross margin, cost per video, the top findings with
cash impact, what you shipped, what you need from the owner (connectors,
invoices, approvals). Keep the first sentence self-contained.
```

## How it splits work

```text
CFO master (reads numbers, decides, reports)
 |- Provider cost scout        -> cheaper models and APIs
 |- Unit-economics analyst     -> tokens and spend per video, waste, margin
 |- Monetisation strategist    -> pricing, plans, retention, dunning
 |- Platform cost auditor      -> Vercel, Supabase, storage, SaaS bills
 `- Implementer (one PR)       -> highest-return safe change
```

## Starting hypotheses for the first run

These come from the repo and are unverified. The routine must test them.

- Premium video (Kling via fal.ai) is the dominant cost: about $0.35 per
  scene, $1.10 per 15s video. Price Kling alternatives and the hero-shot
  variant first.
- Standard tier already costs about $0.07 per 15s video, so it carries a high
  margin; check whether prices could drop to win volume or stay to bank margin.
- Script writer: Sonnet 5.5 costs about $0.04 per video; a smaller model may
  suffice, but it is small money. Do not start there.
- Costs in `config/models.ts` are list prices, not measured. The first job is
  to compare them with `render_jobs.api_cost_usd`.
- Hosting may be a hidden cost: check Vercel plan terms for commercial use.
