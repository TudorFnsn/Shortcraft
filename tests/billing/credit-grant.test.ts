import { describe, expect, it, vi } from 'vitest';
import {
  eventGrantKey,
  InMemoryCreditGrantLedger,
  SupabaseCreditGrantLedger,
  upgradeGrantFor,
  upgradeGrantKey,
} from '@/features/billing/credit-grant';
import { InMemoryStripeEventLedger, processStripeEventOnce } from '@/features/billing/event-ledger';
import { PLANS } from '@/config/plans';

const quietLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
const fakeAdmin = (...results: RpcResult[]) => {
  const rpc = vi.fn(async () => results.shift() ?? { data: null, error: null });
  return {
    rpc,
    client: { rpc } as unknown as ConstructorParameters<typeof SupabaseCreditGrantLedger>[0],
  };
};

describe('grant keys', () => {
  it('are distinct per event and purpose', () => {
    expect(eventGrantKey('evt_1', 'checkout')).not.toBe(eventGrantKey('evt_1', 'renewal'));
    expect(eventGrantKey('evt_1', 'renewal')).not.toBe(eventGrantKey('evt_2', 'renewal'));
  });

  it('scope an upgrade to the subscription, period and target plan', () => {
    const k = upgradeGrantKey('sub_1', '2026-11-01T00:00:00.000Z', 'pro');
    expect(k).toBe(upgradeGrantKey('sub_1', '2026-11-01T00:00:00.000Z', 'pro'));
    expect(k).not.toBe(upgradeGrantKey('sub_1', '2026-12-01T00:00:00.000Z', 'pro'));
    expect(k).not.toBe(upgradeGrantKey('sub_1', '2026-11-01T00:00:00.000Z', 'ultra'));
  });
});

describe('upgradeGrantFor', () => {
  const base = {
    eventId: 'evt_1',
    subscriptionId: 'sub_1',
    currentPeriodEnd: '2026-11-01T00:00:00.000Z',
    status: 'active',
  };

  it('grants the plan-credit difference on a live upgrade', () => {
    const g = upgradeGrantFor({ ...base, fromPlan: 'starter', toPlan: 'pro' });
    expect(g?.credits).toBe(PLANS.pro.monthlyCredits - PLANS.starter.monthlyCredits);
    expect(g?.key).toBe(upgradeGrantKey('sub_1', base.currentPeriodEnd, 'pro'));
  });

  it('grants nothing on a downgrade, a no-op change or a non-live status', () => {
    expect(upgradeGrantFor({ ...base, fromPlan: 'pro', toPlan: 'starter' })).toBeNull();
    expect(upgradeGrantFor({ ...base, fromPlan: 'pro', toPlan: 'pro' })).toBeNull();
    expect(
      upgradeGrantFor({ ...base, status: 'past_due', fromPlan: 'starter', toPlan: 'pro' }),
    ).toBeNull();
  });

  it('falls back to an event-scoped key without a period end', () => {
    const g = upgradeGrantFor({
      ...base,
      currentPeriodEnd: null,
      fromPlan: 'starter',
      toPlan: 'pro',
    });
    expect(g?.key).toContain('evt_1');
  });
});

describe('InMemoryCreditGrantLedger', () => {
  it('applies a key once', async () => {
    const ledger = new InMemoryCreditGrantLedger();
    expect(await ledger.grantOnce('u1', 100, 'topup', 'k')).toBe('granted');
    expect(await ledger.grantOnce('u1', 100, 'topup', 'k')).toBe('duplicate');
    expect(ledger.balance('u1')).toBe(100);
  });

  it('pays a toggled upgrade (Pro → Starter → Pro) only once per period', async () => {
    const ledger = new InMemoryCreditGrantLedger();
    const period = '2026-11-01T00:00:00.000Z';
    const first = upgradeGrantFor({
      eventId: 'evt_a',
      subscriptionId: 'sub_1',
      currentPeriodEnd: period,
      status: 'active',
      fromPlan: 'starter',
      toPlan: 'pro',
    });
    const again = upgradeGrantFor({
      eventId: 'evt_c', // a different event after a downgrade in between
      subscriptionId: 'sub_1',
      currentPeriodEnd: period,
      status: 'active',
      fromPlan: 'starter',
      toPlan: 'pro',
    });
    expect(first && again).toBeTruthy();
    await ledger.grantOnce('u1', first!.credits, 'monthly_grant', first!.key);
    expect(await ledger.grantOnce('u1', again!.credits, 'monthly_grant', again!.key)).toBe(
      'duplicate',
    );
    expect(ledger.balance('u1')).toBe(first!.credits);
  });
});

describe('retry after a partial failure', () => {
  it('grants exactly once when the handler fails after granting', async () => {
    const events = new InMemoryStripeEventLedger();
    const grants = new InMemoryCreditGrantLedger();
    const event = { id: 'evt_up', type: 'customer.subscription.updated' };
    let attempts = 0;
    // Mirrors the upgrade branch: grant first, then the plan write (which fails once).
    const handle = async () => {
      attempts += 1;
      await grants.grantOnce('u1', 70_000, 'monthly_grant', 'stripe:upgrade:sub_1:p:pro');
      if (attempts === 1) throw new Error('subscription sync failed');
    };

    await expect(processStripeEventOnce(events, event, handle, quietLog())).rejects.toThrow();
    expect(await processStripeEventOnce(events, event, handle, quietLog())).toBe('processed');
    expect(attempts).toBe(2);
    expect(grants.balance('u1')).toBe(70_000);
  });
});

describe('SupabaseCreditGrantLedger', () => {
  it('calls grant_credits_once with the key and reports a replay as duplicate', async () => {
    const { rpc, client } = fakeAdmin({ data: true, error: null }, { data: false, error: null });
    const ledger = new SupabaseCreditGrantLedger(client, quietLog());

    expect(await ledger.grantOnce('u1', 500, 'topup', 'k1')).toBe('granted');
    expect(await ledger.grantOnce('u1', 500, 'topup', 'k1')).toBe('duplicate');
    expect(rpc).toHaveBeenCalledWith('grant_credits_once', {
      p_user: 'u1',
      p_delta: 500,
      p_reason: 'topup',
      p_key: 'k1',
    });
  });

  it('falls back to add_credits (and warns) when migration 0003 is not applied', async () => {
    const { rpc, client } = fakeAdmin(
      { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
      { data: 1500, error: null },
    );
    const log = quietLog();
    const ledger = new SupabaseCreditGrantLedger(client, log);

    expect(await ledger.grantOnce('u1', 500, 'monthly_grant', 'k1')).toBe('granted');
    expect(rpc).toHaveBeenLastCalledWith('add_credits', {
      p_user: 'u1',
      p_delta: 500,
      p_reason: 'monthly_grant',
      p_job: null,
    });
    expect(log.warn).toHaveBeenCalled();
  });

  it('throws on any other error so Stripe retries the event', async () => {
    const { client } = fakeAdmin({ data: null, error: { code: '57014', message: 'timeout' } });
    const ledger = new SupabaseCreditGrantLedger(client, quietLog());
    await expect(ledger.grantOnce('u1', 500, 'topup', 'k1')).rejects.toThrow('timeout');
  });

  it('throws when the fallback grant fails', async () => {
    const { client } = fakeAdmin(
      { data: null, error: { code: '42883', message: 'function does not exist' } },
      { data: null, error: { message: 'db down' } },
    );
    const ledger = new SupabaseCreditGrantLedger(client, quietLog());
    await expect(ledger.grantOnce('u1', 500, 'topup', 'k1')).rejects.toThrow('db down');
  });
});
