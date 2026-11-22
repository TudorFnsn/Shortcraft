# Re-activation: founder notes (FinancePlan F12)

**Why:** no render since 2026-10-19 and no sign-in for 37 days (Finance run, 2026-11-21).
Keeping one Pro subscriber is about €30 a month. Price tests, SEO pages and new features
are worth roughly nothing until people make videos again. A few personal notes from the
founder are the cheapest lever we have.

**Who sends:** Tudor, by hand, from his own address, one person at a time. This is a
personal service message, not a campaign: no bulk tool, no tracking pixels, no link
shorteners. Skip anyone the list marks `(do not email)` (they unsubscribed or never
confirmed an address).

## Steps (~30 min for 6 users)

1. `npx tsx scripts/reactivation-list.mts` (read-only) lists every user with a segment, their
   last video, balance and a suggested goodwill grant.
2. For each `tried_and_left` or `never_activated` row with a grant, review then run the
   printed command with `--apply`. It writes `admin_grant` credits (migration 0015), which
   never count as revenue or conversions. Payers get no grant: they already hold credits.
3. Send the note for the row's segment below. Fill the `[ ]` parts by hand, keep it short.
4. Write each reply into `FinancePlan.md` F12 (what blocked them, in their words). Those
   replies decide the next feature better than any guess in this repo.

Every line below states only what the product does once merge train #102 is live (checked
2026-11-21; "Manage plan" ships with it, everything else is already on `main`). Don't promise dates or features that are still in review.

## paying_idle (highest priority: they pay and make nothing)

> **Subject:** Your Shortcraft credits are still waiting
>
> Hi [first name],
>
> I'm Tudor, I build Shortcraft. I saw you haven't made a video since [last video date] and
> you still have [balance] credits on your [plan] plan, enough for several videos.
>
> Since then you can pick from 8 narrator voices, edit a video's voiceover after it's made,
> and even design your own voice. If something got in your way, I'd really like to hear what
> it was. Just reply to this email, I read every answer.
>
> If Shortcraft isn't useful to you right now, you can cancel any time: account menu →
> Plans & credits → Manage plan, no questions asked.
>
> Tudor

Being upfront about cancelling is deliberate: a subscriber who forgot about us and later
finds the charge becomes a chargeback, which costs more than the subscription and hurts
our standing with Stripe.

## tried_and_left (made a video, never paid or stopped paying)

> **Subject:** I added credits for your next video
>
> Hi [first name],
>
> Tudor here, I build Shortcraft. You made "[their video title]" in [month]. I've added
> enough credits to your account for another 30-second video, on me.
>
> New since then: 8 narrator voices to choose from, and you can rewrite or re-record the
> voiceover after the video is made. [Today's idea for their look, from /ideas/<look>.]
>
> What would make Shortcraft worth using every week for you? One line back helps a lot.
>
> Tudor

## never_activated (signed up, never finished a video)

> **Subject:** Did something go wrong with your first video?
>
> Hi [first name],
>
> Tudor here, I build Shortcraft. You signed up but never finished a video, which usually
> means I made something confusing. I've added credits for a 30-second video so you can
> try again for free: pick an idea, press Make, and it's ready in about a minute.
>
> [One idea from /ideas, linked straight into Create.]
>
> If something broke or wasn't clear, tell me what happened. Just reply.
>
> Tudor

## Rules

- Legal basis: these are service messages to existing users about the service they signed
  up for (legitimate interests, the same basis as the lifecycle reminders in the Privacy
  Policy). Anyone who asks to stop gets no more, and we set `profiles.email_opt_out`.
- No discounts or coupons here: coupons need Stripe changes and the owner's money approval.
  Goodwill credits cost us about $0.05 of API spend per 30s Standard video.
- One note per person. If no reply in a week, stop.
