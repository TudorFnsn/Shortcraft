/**
 * Exactly-once-ish processing for Stripe webhook events.
 *
 * The ledger (`stripe_events`) claims an event id before handling so retries and
 * duplicate deliveries are skipped. If the handler then fails, the claim is
 * released so Stripe's retry processes the event again — otherwise a transient
 * error (Stripe API blip, DB hiccup) would mark a paid event as "done" and the
 * customer would never get their credits.
 *
 * Retries re-run the whole handler, so every credit grant goes through a keyed,
 * idempotent ledger write (credit-grant.ts): a grant that already landed before
 * the failure is a no-op on the retry.
 */
import type { createSupabaseAdminClient } from '@/utils/supabase/admin';

/** `untracked` = ledger table missing (migration 0002 not applied): process without dedupe. */
export type ClaimResult = 'claimed' | 'duplicate' | 'untracked';

/** Port: Supabase in prod, in-memory in tests. */
export interface StripeEventLedger {
  claim(id: string, type: string): Promise<ClaimResult>;
  release(id: string): Promise<void>;
}

export type ProcessOutcome = 'processed' | 'duplicate';

interface Log {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export async function processStripeEventOnce(
  ledger: StripeEventLedger,
  event: { id: string; type: string },
  handle: () => Promise<void>,
  log: Log,
): Promise<ProcessOutcome> {
  const claim = await ledger.claim(event.id, event.type);
  if (claim === 'duplicate') {
    log.info('duplicate stripe event ignored');
    return 'duplicate';
  }
  if (claim === 'untracked') {
    log.warn('stripe_events table missing; idempotency disabled (run migration 0002)');
  }

  try {
    await handle();
    return 'processed';
  } catch (cause) {
    if (claim === 'claimed') {
      try {
        await ledger.release(event.id);
      } catch (releaseCause) {
        // The event stays marked as processed: Stripe's retry will be skipped, so
        // this needs a human (replay it from the Stripe dashboard).
        log.error('stripe event claim release failed; replay manually', {
          alert: 'stripe_event_stuck',
          cause: String(releaseCause),
        });
      }
    }
    throw cause; // route returns 500 -> Stripe retries
  }
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export class SupabaseStripeEventLedger implements StripeEventLedger {
  constructor(private readonly admin: Admin) {}

  async claim(id: string, type: string): Promise<ClaimResult> {
    const { error } = await this.admin.from('stripe_events').insert({ id, type });
    if (!error) return 'claimed';
    if (error.code === '23505') return 'duplicate'; // unique_violation: already claimed
    const missingTable =
      error.code === '42P01' || // raw Postgres: undefined_table
      error.code === 'PGRST205' || // PostgREST: table not in schema cache
      /schema cache|find the table/i.test(error.message ?? '');
    if (missingTable) return 'untracked';
    throw new Error(`stripe_events insert failed: ${error.message}`); // fail -> Stripe retries
  }

  async release(id: string): Promise<void> {
    const { error } = await this.admin.from('stripe_events').delete().eq('id', id);
    if (error) throw new Error(`stripe_events release failed: ${error.message}`);
  }
}

export class InMemoryStripeEventLedger implements StripeEventLedger {
  readonly ids = new Set<string>();

  async claim(id: string): Promise<ClaimResult> {
    if (this.ids.has(id)) return 'duplicate';
    this.ids.add(id);
    return 'claimed';
  }

  async release(id: string): Promise<void> {
    this.ids.delete(id);
  }
}
