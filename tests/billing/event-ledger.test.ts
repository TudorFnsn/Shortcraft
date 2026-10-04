import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryStripeEventLedger,
  processStripeEventOnce,
  type StripeEventLedger,
} from '@/features/billing/event-ledger';

const event = { id: 'evt_1', type: 'invoice.paid' };
const quietLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('processStripeEventOnce', () => {
  it('processes a new event once and skips redeliveries', async () => {
    const ledger = new InMemoryStripeEventLedger();
    const handle = vi.fn(async () => {});

    expect(await processStripeEventOnce(ledger, event, handle, quietLog())).toBe('processed');
    expect(await processStripeEventOnce(ledger, event, handle, quietLog())).toBe('duplicate');
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when handling fails, so the retry grants the credits', async () => {
    const ledger = new InMemoryStripeEventLedger();
    let granted = 0;
    let attempts = 0;
    const handle = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('stripe api blip'); // fails before the grant
      granted += 1;
    };

    await expect(processStripeEventOnce(ledger, event, handle, quietLog())).rejects.toThrow(
      'stripe api blip',
    );
    expect(ledger.ids.has(event.id)).toBe(false);

    expect(await processStripeEventOnce(ledger, event, handle, quietLog())).toBe('processed');
    expect(await processStripeEventOnce(ledger, event, handle, quietLog())).toBe('duplicate');
    expect(granted).toBe(1);
  });

  it('still processes (without dedupe) when the ledger table is missing', async () => {
    const ledger: StripeEventLedger = {
      claim: async () => 'untracked',
      release: vi.fn(async () => {}),
    };
    const log = quietLog();
    const handle = vi.fn(async () => {});

    expect(await processStripeEventOnce(ledger, event, handle, log)).toBe('processed');
    expect(handle).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalled();
  });

  it('does not release an untracked claim on failure', async () => {
    const release = vi.fn(async () => {});
    const ledger: StripeEventLedger = { claim: async () => 'untracked', release };
    await expect(
      processStripeEventOnce(
        ledger,
        event,
        async () => {
          throw new Error('boom');
        },
        quietLog(),
      ),
    ).rejects.toThrow('boom');
    expect(release).not.toHaveBeenCalled();
  });

  it('surfaces the original error and alerts when the release itself fails', async () => {
    const ledger: StripeEventLedger = {
      claim: async () => 'claimed',
      release: async () => {
        throw new Error('db down');
      },
    };
    const log = quietLog();
    await expect(
      processStripeEventOnce(
        ledger,
        event,
        async () => {
          throw new Error('handler failed');
        },
        log,
      ),
    ).rejects.toThrow('handler failed');
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ alert: 'stripe_event_stuck' }),
    );
  });

  it('propagates claim errors without running the handler', async () => {
    const ledger: StripeEventLedger = {
      claim: async () => {
        throw new Error('insert failed');
      },
      release: async () => {},
    };
    const handle = vi.fn(async () => {});
    await expect(processStripeEventOnce(ledger, event, handle, quietLog())).rejects.toThrow(
      'insert failed',
    );
    expect(handle).not.toHaveBeenCalled();
  });
});
