/**
 * The daily lifecycle-email run: load the audience, plan, claim, send.
 *
 * Exactly-once: each email is claimed in `email_log` (unique user + kind +
 * period) BEFORE it is sent; a duplicate claim means another run already has
 * it. A failed send releases the claim so tomorrow's run retries. Without a
 * sender the run is a dry run: it plans and reports but claims and sends
 * nothing.
 */
import { logger } from '@/lib/logger';
import { planLifecycleEmails, type Audience, type LifecycleKind } from './lifecycle';
import type { EmailSender } from './sender';
import { renderLifecycleEmail } from './templates';
import { unsubscribeUrl } from './unsubscribe';

/** Stays under Resend's free tier (100 emails/day). */
export const MAX_EMAILS_PER_RUN = 90;

export interface LifecycleSource {
  loadAudience(now: Date): Promise<Audience>;
  balance(userId: string): Promise<number>;
}

export interface EmailLog {
  /** True when this call created the claim; false when it already existed. */
  claim(userId: string, kind: LifecycleKind, periodKey: string): Promise<boolean>;
  release(userId: string, kind: LifecycleKind, periodKey: string): Promise<void>;
}

export interface LifecycleDeps {
  source: LifecycleSource;
  log: EmailLog;
  /** Null = dry run. */
  sender: EmailSender | null;
  siteUrl: string;
  linkSecret: string;
  maxPerRun?: number;
}

export interface LifecycleRunReport {
  dryRun: boolean;
  planned: Record<LifecycleKind, number>;
  sent: number;
  /** Already claimed by an earlier or overlapping run. */
  duplicate: number;
  failed: number;
  /** Planned but over the per-run cap; they go out on a later run. */
  deferred: number;
}

export async function runLifecycleEmails(
  deps: LifecycleDeps,
  now: Date,
): Promise<LifecycleRunReport> {
  const log = logger.with({ feature: 'lifecycle_email' });
  const audience = await deps.source.loadAudience(now);

  const balances = new Map<string, number>();
  for (const userId of new Set(audience.subscriptions.map((s) => s.userId))) {
    balances.set(userId, await deps.source.balance(userId));
  }
  const plan = planLifecycleEmails(audience, balances, now);
  const report: LifecycleRunReport = {
    dryRun: deps.sender === null,
    planned: { first_video: 0, unused_credits: 0 },
    sent: 0,
    duplicate: 0,
    failed: 0,
    deferred: 0,
  };
  for (const e of plan) report.planned[e.kind]++;
  if (!deps.sender) {
    log.info('lifecycle email dry run', { planned: report.planned });
    return report;
  }

  const cap = deps.maxPerRun ?? MAX_EMAILS_PER_RUN;
  for (const e of plan) {
    if (report.sent + report.failed >= cap) {
      report.deferred++;
      continue;
    }
    if (!(await deps.log.claim(e.userId, e.kind, e.periodKey))) {
      report.duplicate++;
      continue;
    }
    const unsub = unsubscribeUrl(deps.siteUrl, e.userId, deps.linkSecret);
    const content = renderLifecycleEmail(e, { siteUrl: deps.siteUrl, unsubscribeUrl: unsub, now });
    const res = await deps.sender.send({
      to: e.email,
      ...content,
      headers: {
        'List-Unsubscribe': `<${unsub}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      idempotencyKey: `${e.kind}/${e.userId}/${e.periodKey}`,
    });
    if (res.ok) {
      report.sent++;
    } else {
      report.failed++;
      await deps.log.release(e.userId, e.kind, e.periodKey);
      // Never log the address; the user id is enough to find it.
      log.warn('lifecycle email failed', {
        kind: e.kind,
        userId: e.userId,
        error: res.error.message,
      });
    }
  }
  if (report.deferred > 0) log.warn('lifecycle email cap reached', { deferred: report.deferred });
  log.info('lifecycle email run', { ...report });
  return report;
}
