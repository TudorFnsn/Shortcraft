import { describe, expect, it } from 'vitest';
import { applyDeploymentGuards, type Env } from '@/lib/env';

function env(patch: Partial<Env>): Env {
  return {
    NODE_ENV: 'production',
    MOCK_PROVIDERS: false,
    NEXT_PUBLIC_SITE_URL: 'https://example.app',
    SUPABASE_MEDIA_BUCKET: 'media',
    ALLOW_LIVE_PROVIDERS_IN_PREVIEW: false,
    ...patch,
  };
}

describe('applyDeploymentGuards', () => {
  it('forces mock providers on a Preview deployment', () => {
    const { env: out, warnings } = applyDeploymentGuards(env({ VERCEL_ENV: 'preview' }));
    expect(out.MOCK_PROVIDERS).toBe(true);
    expect(warnings).toHaveLength(1);
  });

  it('lets a Preview go live only with the explicit escape hatch', () => {
    const { env: out } = applyDeploymentGuards(
      env({ VERCEL_ENV: 'preview', ALLOW_LIVE_PROVIDERS_IN_PREVIEW: true }),
    );
    expect(out.MOCK_PROVIDERS).toBe(false);
  });

  it('leaves Production and local runs as configured', () => {
    for (const VERCEL_ENV of ['production', undefined] as const) {
      const { env: out, warnings } = applyDeploymentGuards(
        env({ VERCEL_ENV, STRIPE_SECRET_KEY: 'sk_live_abc' }),
      );
      expect(out.MOCK_PROVIDERS).toBe(false);
      expect(out.STRIPE_SECRET_KEY).toBe('sk_live_abc');
      expect(warnings).toEqual([]);
    }
  });

  it.each([
    ['a Preview', { VERCEL_ENV: 'preview' as const }],
    ['Vercel Development', { VERCEL_ENV: 'development' as const }],
    ['local dev', { NODE_ENV: 'development' as const }],
  ])('drops a live Stripe key on %s', (_label, patch) => {
    for (const key of ['sk_live_abc', 'rk_live_abc']) {
      const { env: out, warnings } = applyDeploymentGuards(
        env({ ...patch, MOCK_PROVIDERS: true, STRIPE_SECRET_KEY: key }),
      );
      expect(out.STRIPE_SECRET_KEY).toBeUndefined();
      expect(warnings.some((w) => w.includes('Stripe'))).toBe(true);
    }
  });

  it('keeps a test Stripe key everywhere', () => {
    const { env: out } = applyDeploymentGuards(
      env({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: 'sk_test_abc' }),
    );
    expect(out.STRIPE_SECRET_KEY).toBe('sk_test_abc');
  });

  it('does not mutate its input', () => {
    const input = env({ VERCEL_ENV: 'preview' });
    applyDeploymentGuards(input);
    expect(input.MOCK_PROVIDERS).toBe(false);
  });
});
