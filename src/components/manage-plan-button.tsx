'use client';

import { useState } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { siteConfig } from '@/config/site';

/**
 * "Manage plan": opens the Stripe Customer Portal (`POST /api/billing/portal`)
 * where a paying creator cancels, changes card or downloads invoices. The Terms
 * (§5) promise cancellation "from the billing portal", so this is the one
 * self-serve way out. Shown only to accounts that have paid (they have a Stripe
 * customer); anyone else gets a 400 `no_customer`, handled below anyway.
 */
export function ManagePlanButton() {
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle');

  async function open() {
    setState('opening');
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { url?: unknown };
      if (res.ok && typeof body.url === 'string') {
        window.location.assign(body.url);
        return;
      }
    } catch {
      // Network error: fall through to the message.
    }
    setState('failed');
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={open}
        disabled={state === 'opening'}
        className={buttonClasses({ variant: 'primary', size: 'md' })}
      >
        {state === 'opening' ? 'Opening…' : 'Manage plan'}
      </button>
      {state === 'failed' && (
        <p role="alert" className="text-ink-muted m-0 text-[15px]">
          Couldn’t open billing. Try again, or email {siteConfig.supportEmail} and we’ll cancel or
          change your plan for you.
        </p>
      )}
    </div>
  );
}
