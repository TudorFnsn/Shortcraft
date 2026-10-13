import { describe, expect, it } from 'vitest';
import { SUBPROCESSORS } from '@/config/legal';
import {
  DAY_MS,
  ONE_VIDEO_CREDITS,
  planLifecycleEmails,
  type Audience,
  type AudienceUser,
} from '@/features/email/lifecycle';
import { runLifecycleEmails, type EmailLog, type LifecycleSource } from '@/features/email/run';
import { ResendEmailSender, type EmailSender, type OutgoingEmail } from '@/features/email/sender';
import { renderLifecycleEmail } from '@/features/email/templates';
import { unsubscribeToken, verifyUnsubscribeToken } from '@/features/email/unsubscribe';
import { err, ok, appError } from '@/lib/result';

const NOW = new Date('2026-10-13T09:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const user = (id: string, ageDays: number, patch: Partial<AudienceUser> = {}): AudienceUser => ({
  id,
  email: `${id}@example.com`,
  emailConfirmed: true,
  createdAt: daysAgo(ageDays),
  optedOut: false,
  ...patch,
});

const empty: Audience = { users: [], doneJobs: [], subscriptions: [], recentSends: [] };
const RICH = ONE_VIDEO_CREDITS * 5;

describe('planLifecycleEmails: first_video', () => {
  it('reminds confirmed accounts 1–6 days old that never finished a video, once', () => {
    const plan = planLifecycleEmails(
      {
        ...empty,
        users: [
          user('due', 2),
          user('too-new', 0.5),
          user('too-old', 6.5),
          user('made-one', 3),
          user('unconfirmed', 2, { emailConfirmed: false }),
          user('opted-out', 2, { optedOut: true }),
          user('no-email', 2, { email: null }),
          user('already-sent', 4),
        ],
        doneJobs: [{ userId: 'made-one', createdAt: daysAgo(2) }],
        recentSends: [{ userId: 'already-sent', kind: 'first_video', createdAt: daysAgo(2) }],
      },
      new Map(),
      NOW,
    );
    expect(plan).toEqual([
      { userId: 'due', email: 'due@example.com', kind: 'first_video', periodKey: 'once' },
    ]);
  });
});

describe('planLifecycleEmails: unused_credits', () => {
  const sub = (userId: string, patch: Record<string, unknown> = {}) => ({
    userId,
    planId: 'pro',
    status: 'active',
    createdAt: daysAgo(30),
    ...patch,
  });

  it('nudges live subscribers idle for 7 days who still have credits', () => {
    const users = ['idle', 'active', 'broke', 'canceled', 'new-sub', 'nudged', 'nudged-long-ago'];
    const plan = planLifecycleEmails(
      {
        users: users.map((id) => user(id, 60)),
        doneJobs: [
          { userId: 'idle', createdAt: daysAgo(7.5) },
          { userId: 'active', createdAt: daysAgo(2) },
        ],
        subscriptions: [
          sub('idle'),
          sub('active'),
          sub('broke'),
          sub('canceled', { status: 'canceled' }),
          sub('new-sub', { createdAt: daysAgo(1) }),
          sub('nudged'),
          sub('nudged-long-ago'),
        ],
        recentSends: [
          { userId: 'nudged', kind: 'unused_credits', createdAt: daysAgo(3) },
          { userId: 'nudged-long-ago', kind: 'unused_credits', createdAt: daysAgo(7.5) },
        ],
      },
      new Map(users.map((id) => [id, id === 'broke' ? ONE_VIDEO_CREDITS - 1 : RICH])),
      NOW,
    );
    expect(plan.map((p) => p.userId)).toEqual(['idle', 'nudged-long-ago']);
    expect(plan[0]).toMatchObject({
      kind: 'unused_credits',
      periodKey: '2026-10-13',
      balance: RICH,
    });
  });

  it('skips a subscriber whose balance is unknown', () => {
    const plan = planLifecycleEmails(
      { ...empty, users: [user('a', 60)], subscriptions: [sub('a')] },
      new Map(),
      NOW,
    );
    expect(plan).toEqual([]);
  });
});

describe('templates', () => {
  const opts = { siteUrl: 'https://shortcraft.app', unsubscribeUrl: 'https://u.test/x', now: NOW };

  it('first_video links to Create with an idea and carries the unsubscribe link', () => {
    const c = renderLifecycleEmail(
      { userId: 'a', email: 'a@x', kind: 'first_video', periodKey: 'once' },
      opts,
    );
    expect(c.subject).toMatch(/first video/);
    expect(c.text).toContain('https://shortcraft.app/create?');
    expect(c.text).toContain('https://u.test/x');
    expect(c.html).toContain('Unsubscribe');
  });

  it('unused_credits quotes the balance and how many videos it covers', () => {
    const c = renderLifecycleEmail(
      { userId: 'a', email: 'a@x', kind: 'unused_credits', periodKey: 'd', balance: RICH },
      opts,
    );
    expect(c.subject).toContain(RICH.toLocaleString('en-US'));
    expect(c.text).toContain('about 5 more 15-second videos');
  });

  it('escapes HTML in the content', () => {
    const c = renderLifecycleEmail(
      { userId: 'a', email: 'a@x', kind: 'first_video', periodKey: 'once' },
      { ...opts, unsubscribeUrl: 'https://u.test/?a=1&b="2"' },
    );
    expect(c.html).toContain('a=1&#38;b=&#34;2&#34;');
  });
});

describe('unsubscribe tokens', () => {
  it('verify only for the same user and secret', () => {
    const t = unsubscribeToken('user-1', 'secret-secret-123');
    expect(verifyUnsubscribeToken('user-1', t, 'secret-secret-123')).toBe(true);
    expect(verifyUnsubscribeToken('user-2', t, 'secret-secret-123')).toBe(false);
    expect(verifyUnsubscribeToken('user-1', t, 'another-secret-456')).toBe(false);
    expect(verifyUnsubscribeToken('user-1', 'short', 'secret-secret-123')).toBe(false);
  });
});

describe('runLifecycleEmails', () => {
  const audience: Audience = { ...empty, users: [user('a', 2), user('b', 3), user('c', 4)] };
  const source: LifecycleSource = {
    loadAudience: async () => audience,
    balance: async () => 0,
  };

  function memoryLog(): EmailLog & { keys: Set<string> } {
    const keys = new Set<string>();
    return {
      keys,
      claim: async (u, k, p) => (keys.has(`${u}/${k}/${p}`) ? false : !!keys.add(`${u}/${k}/${p}`)),
      release: async (u, k, p) => void keys.delete(`${u}/${k}/${p}`),
    };
  }

  function fakeSender(failFor = new Set<string>()): EmailSender & { sent: OutgoingEmail[] } {
    const sent: OutgoingEmail[] = [];
    return {
      sent,
      send: async (e) => {
        if (failFor.has(e.to)) return err(appError('provider_failed', 'boom'));
        sent.push(e);
        return ok({ id: String(sent.length) });
      },
    };
  }

  const deps = { source, siteUrl: 'https://s.app', linkSecret: 'secret-secret-123' };

  it('is a dry run without a sender: plans, but claims and sends nothing', async () => {
    const log = memoryLog();
    const r = await runLifecycleEmails({ ...deps, log, sender: null }, NOW);
    expect(r).toMatchObject({ dryRun: true, planned: { first_video: 3 }, sent: 0 });
    expect(log.keys.size).toBe(0);
  });

  it('sends each email once, with one-click unsubscribe headers', async () => {
    const log = memoryLog();
    const sender = fakeSender();
    const first = await runLifecycleEmails({ ...deps, log, sender }, NOW);
    const again = await runLifecycleEmails({ ...deps, log, sender }, NOW);
    expect(first.sent).toBe(3);
    expect(again).toMatchObject({ sent: 0, duplicate: 3 });
    expect(sender.sent[0]!.headers).toMatchObject({
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(sender.sent[0]!.headers!['List-Unsubscribe']).toMatch(
      /^<https:\/\/s\.app\/api\/email\/unsubscribe\?u=a&t=/,
    );
    expect(sender.sent[0]!.idempotencyKey).toBe('first_video/a/once');
  });

  it('releases the claim of a failed send so a later run retries it', async () => {
    const log = memoryLog();
    const r = await runLifecycleEmails(
      { ...deps, log, sender: fakeSender(new Set(['b@example.com'])) },
      NOW,
    );
    expect(r).toMatchObject({ sent: 2, failed: 1 });
    expect(log.keys.has('b/first_video/once')).toBe(false);
  });

  it('stops at the per-run cap and defers the rest', async () => {
    const r = await runLifecycleEmails(
      { ...deps, log: memoryLog(), sender: fakeSender(), maxPerRun: 2 },
      NOW,
    );
    expect(r).toMatchObject({ sent: 2, deferred: 1 });
  });
});

describe('ResendEmailSender', () => {
  it('posts to Resend with auth and idempotency headers', async () => {
    let call: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      call = { url, init };
      return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new ResendEmailSender('re_key', 'S <s@x.com>', fetchImpl).send({
      to: 'a@x.com',
      subject: 's',
      text: 't',
      html: 'h',
      idempotencyKey: 'k1',
    });
    expect(r).toEqual({ ok: true, value: { id: 'em_1' } });
    expect(call!.url).toBe('https://api.resend.com/emails');
    const headers = call!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_key');
    expect(headers['idempotency-key']).toBe('k1');
    expect(JSON.parse(call!.init.body as string)).toMatchObject({
      to: ['a@x.com'],
      from: 'S <s@x.com>',
    });
  });

  it('returns an error (never throws) on an HTTP or network failure', async () => {
    const http = (async () => new Response('bad', { status: 422 })) as unknown as typeof fetch;
    const net = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const email = { to: 'a@x', subject: 's', text: 't', html: 'h' };
    expect((await new ResendEmailSender('k', 'f', http).send(email)).ok).toBe(false);
    expect((await new ResendEmailSender('k', 'f', net).send(email)).ok).toBe(false);
  });
});

describe('privacy policy', () => {
  it('lists Resend as a processor', () => {
    expect(SUBPROCESSORS.map((s) => s.name)).toContain('Resend');
  });
});
