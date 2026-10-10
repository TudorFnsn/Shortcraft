import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PRIVACY,
  SUBPROCESSORS,
  TERMS,
  TERMS_VERSION,
  WITHDRAWAL_WAIVER_TEXT,
  type LegalDocument,
} from '@/config/legal';
import { PLANS } from '@/config/plans';
import { siteConfig } from '@/config/site';
import { CheckoutBody, checkoutConsentMetadata } from '@/features/billing/consent';

const text = (doc: LegalDocument) => doc.sections.flatMap((s) => s.paragraphs).join('\n');
const section = (doc: LegalDocument, id: string) => {
  const s = doc.sections.find((x) => x.id === id);
  if (!s) throw new Error(`missing section ${id}`);
  return s.paragraphs.join('\n');
};

describe.each([TERMS, PRIVACY])('$title structure', (doc) => {
  it('has unique, URL-safe section ids and no empty paragraphs', () => {
    const ids = doc.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    for (const s of doc.sections) {
      expect(s.paragraphs.length).toBeGreaterThan(0);
      for (const p of s.paragraphs) expect(p.trim()).not.toBe('');
    }
  });

  it('names a contact address', () => {
    expect(text(doc)).toContain(siteConfig.supportEmail);
  });
});

describe('Terms of Service', () => {
  it('states the trial credits the app actually grants', () => {
    expect(section(TERMS, 'credits')).toContain(siteConfig.trialCredits.toLocaleString('en'));
  });

  it('lists every plan at its real price', () => {
    const subs = section(TERMS, 'subscriptions');
    for (const plan of Object.values(PLANS)) {
      expect(subs).toContain(`${plan.name} (€${(plan.priceCents / 100).toFixed(2)}/month)`);
    }
  });

  it('has the refund + withdrawal policy Stripe and EU law expect', () => {
    const refunds = section(TERMS, 'refunds');
    expect(refunds).toMatch(/14 days/);
    expect(refunds).toMatch(/right of withdrawal/);
    expect(refunds).toMatch(/refund/i);
    expect(section(TERMS, 'subscriptions')).toMatch(/cancel at any time/i);
    // /terms#refunds is linked from the footer and /pricing.
    expect(TERMS.sections.some((s) => s.id === 'refunds')).toBe(true);
  });

  it('tells users to keep AI labels and use the platform disclosure toggle', () => {
    const ai = section(TERMS, 'ai-labelling');
    expect(ai).toMatch(/Do not remove/);
    expect(ai).toMatch(/TikTok/);
  });

  it('forbids every category the prompt screen blocks, plus deepfakes', () => {
    const aup = section(TERMS, 'acceptable-use');
    for (const term of [
      'minors',
      'sexually explicit',
      'self-harm',
      'weapons',
      'violence',
      'real person',
    ]) {
      expect(aup).toContain(term);
    }
  });
});

describe('Privacy Policy', () => {
  it('discloses every vendor that processes user data', () => {
    const processors = section(PRIVACY, 'processors');
    for (const s of SUBPROCESSORS) expect(processors).toContain(s.name);
  });

  it('covers every live provider vendor the code calls', () => {
    const liveDir = 'src/features/providers/live';
    const vendors: Array<[file: string, name: string]> = [
      ['anthropic-script.ts', 'Anthropic'],
      ['elevenlabs-voice.ts', 'ElevenLabs'],
      ['fal-image.ts', 'fal.ai'],
      ['fal-video.ts', 'fal.ai'],
      ['media-store.ts', 'Supabase'],
    ];
    for (const [file, name] of vendors) {
      readFileSync(`${liveDir}/${file}`); // fails if the adapter moves without this test
      expect(SUBPROCESSORS.map((s) => s.name)).toContain(name);
    }
  });

  it('claims essential cookies only, and GDPR rights', () => {
    expect(section(PRIVACY, 'cookies')).toMatch(/only the cookies needed/);
    expect(section(PRIVACY, 'rights')).toMatch(/delete/);
  });
});

describe('checkout consent', () => {
  it('requires acceptTerms: true', () => {
    expect(CheckoutBody.safeParse({ key: 'pro_monthly', acceptTerms: true }).success).toBe(true);
    expect(CheckoutBody.safeParse({ key: 'pro_monthly' }).success).toBe(false);
    expect(CheckoutBody.safeParse({ key: 'pro_monthly', acceptTerms: false }).success).toBe(false);
    expect(CheckoutBody.safeParse({ key: 'pro_monthly', acceptTerms: 'yes' }).success).toBe(false);
    expect(CheckoutBody.safeParse({ key: '', acceptTerms: true }).success).toBe(false);
  });

  it('records the terms version and waiver time', () => {
    const now = new Date('2026-10-10T06:00:00Z');
    expect(checkoutConsentMetadata(now)).toEqual({
      terms_version: TERMS_VERSION,
      withdrawal_waiver_at: '2026-10-10T06:00:00.000Z',
    });
  });

  it('waiver text asks for immediate delivery and names the lost right', () => {
    expect(WITHDRAWAL_WAIVER_TEXT).toMatch(/right away/);
    expect(WITHDRAWAL_WAIVER_TEXT).toMatch(/lose my 14-day right of withdrawal/);
  });
});
