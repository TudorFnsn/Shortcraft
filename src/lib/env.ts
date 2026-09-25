/**
 * Typed, validated environment — the single source of truth for config.
 *
 * Design goals:
 *  - The app BOOTS WITH ZERO SECRETS when MOCK_PROVIDERS is true (the default),
 *    so the whole product is buildable/testable before any paid API key exists.
 *  - Provider keys are optional here and required only at the point a *real*
 *    adapter is constructed (see `requireEnv`), which keeps mock/dev/test green.
 *
 * Server-only. Do not import this module from client components; read
 * NEXT_PUBLIC_* values directly where the client needs them.
 */
import { z } from 'zod';

const bool = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Master switch: when true, every provider resolves to a deterministic mock. */
  MOCK_PROVIDERS: bool('true'),

  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),

  // Supabase (added in the auth/db step)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // AI providers (optional until MOCK_PROVIDERS=false)
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  FAL_KEY: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  RENDER_API_KEY: z.string().min(1).optional(),

  // Stripe (added in the billing step)
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast with a readable message; never start half-configured.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = load();

/**
 * Fetch a required secret at the point of use. Called by real provider adapters
 * so that a missing key fails loudly *only* when you actually opt into live mode
 * (MOCK_PROVIDERS=false), not at import time.
 */
export function requireEnv(key: keyof Env): string {
  const value = env[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Missing required env "${String(key)}". Set it in .env.local, or run with MOCK_PROVIDERS=true.`,
    );
  }
  return value;
}
