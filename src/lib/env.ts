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
  /** Script model override; defaults to Claude Sonnet 5.5 (see anthropic-script.ts). */
  ANTHROPIC_SCRIPT_MODEL: z.string().min(1).optional(),
  /** Grey-zone prompt classifier model override; defaults to Claude Haiku 5.5 (see anthropic-moderation.ts). */
  ANTHROPIC_MODERATION_MODEL: z.string().min(1).optional(),
  /**
   * Screen prompts with the LLM classifier after the rule screen (live providers
   * + ANTHROPIC_API_KEY only). Fails open on errors. See features/moderation/moderator.ts.
   */
  MODERATION_LLM: bool('false'),
  /** Only for an organization-level key that isn't scoped to a workspace. */
  ANTHROPIC_WORKSPACE_ID: z.string().min(1).optional(),
  FAL_KEY: z.string().min(1).optional(),
  /** fal image-to-video model for Premium clips (default: Kling 2.5 Turbo Pro). */
  FAL_VIDEO_MODEL: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  /** Narrator voice; defaults to an ElevenLabs stock voice. */
  ELEVENLABS_VOICE_ID: z.string().min(1).optional(),
  /** Private Supabase Storage bucket for generated media (voiceovers, renders). */
  SUPABASE_MEDIA_BUCKET: z.string().min(1).default('media'),
  /**
   * Up to three finished render job ids (comma-separated) whose videos play in
   * the landing hero's phone frames, left to right. Unset: drawn theme frames.
   */
  LANDING_SHOWCASE_JOB_IDS: z.string().optional(),
  RENDER_API_KEY: z.string().min(1).optional(),
  /** ffmpeg binary for the in-house renderer; defaults to `ffmpeg` on PATH. */
  FFMPEG_PATH: z.string().min(1).optional(),

  /**
   * Show "Continue with Google" on /login. Turn on only after the Google
   * provider is enabled in Supabase Auth (otherwise the button lands on an error).
   */
  GOOGLE_AUTH_ENABLED: bool('false'),

  // Stripe (added in the billing step)
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Lifecycle email (features/email). All three set = send; otherwise the cron is a dry run.
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Verified sender, e.g. "Shortcraft <hello@mail.example.com>". */
  EMAIL_FROM: z.string().min(1).optional(),
  /** Signs unsubscribe links (any long random string, e.g. `openssl rand -hex 32`). */
  EMAIL_LINK_SECRET: z.string().min(16).optional(),

  /** Vercel Cron sends it as a Bearer token; required for /api/cron/* outside development. */
  CRON_SECRET: z.string().min(1).optional(),

  /** Set by Vercel on every deployment (system env var); unset locally and in CI. */
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  /** Escape hatch: let a Preview deployment call paid providers (see applyDeploymentGuards). */
  ALLOW_LIVE_PROVIDERS_IN_PREVIEW: bool('false'),
});

export type Env = z.infer<typeof schema>;

const LIVE_STRIPE_KEY = /^(sk|rk)_live_/;

/**
 * Fail-closed guards for non-production deployments (docs/DEPLOYMENT.md).
 * Every PR gets a Vercel Preview, including the daily routine PRs, so a
 * misconfigured Preview must never spend money or charge real cards:
 *  - Preview runs on mock providers unless ALLOW_LIVE_PROVIDERS_IN_PREVIEW=true.
 *  - A live Stripe key is ignored anywhere but Production (checkout then fails
 *    with "Stripe not configured" instead of taking a real payment).
 *  - Preview never sends lifecycle email (its database may hold real users).
 * Returns the guarded env plus a warning per override. Pure, for tests.
 */
export function applyDeploymentGuards(raw: Env): { env: Env; warnings: string[] } {
  const env = { ...raw };
  const warnings: string[] = [];
  if (env.VERCEL_ENV === 'preview' && !env.MOCK_PROVIDERS && !env.ALLOW_LIVE_PROVIDERS_IN_PREVIEW) {
    env.MOCK_PROVIDERS = true;
    warnings.push(
      'MOCK_PROVIDERS forced to true on a Preview deployment (set ALLOW_LIVE_PROVIDERS_IN_PREVIEW=true to override)',
    );
  }
  if (env.VERCEL_ENV === 'preview' && env.RESEND_API_KEY) {
    env.RESEND_API_KEY = undefined;
    warnings.push('RESEND_API_KEY ignored on a Preview deployment (no emails to real users)');
  }
  const isProduction =
    env.VERCEL_ENV === 'production' || (!env.VERCEL_ENV && env.NODE_ENV === 'production');
  if (env.STRIPE_SECRET_KEY && LIVE_STRIPE_KEY.test(env.STRIPE_SECRET_KEY) && !isProduction) {
    env.STRIPE_SECRET_KEY = undefined;
    warnings.push('live Stripe key ignored outside Production; use a test key (sk_test_…) here');
  }
  return { env, warnings };
}

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast with a readable message; never start half-configured.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  const { env, warnings } = applyDeploymentGuards(parsed.data);
  // console, not the logger: the logger reads env, so it can't be used while env loads.
  for (const w of warnings) console.warn(`[env] ${w}`);
  return env;
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
