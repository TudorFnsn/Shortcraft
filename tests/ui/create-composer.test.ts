import { describe, expect, it } from 'vitest';
import {
  composerState,
  initialSelection,
  lengthLockPlan,
  tierLockPlan,
  type Selection,
} from '@/app/create/composer';
import { STARTER } from '@/components/ideas';
import { estimateJobCredits } from '@/features/render/pricing';

// A trial / Starter account: 30s max, Standard only.
const trial = { balance: 3000, maxDurationSec: 30, allowedTiers: ['standard'] as const };
const sel = (patch: Partial<Selection> = {}): Selection => ({
  topic: 'Three facts about octopuses',
  themeId: 'fun-facts',
  durationSec: 15,
  tier: 'standard',
  ...patch,
});

describe('composerState', () => {
  it('lets an affordable, on-plan video with a topic generate', () => {
    const s = composerState(sel(), trial);
    expect(s.estimate).toBe(estimateJobCredits({ targetDurationSec: 15, modelTier: 'standard' }));
    expect(s.affordable).toBe(true);
    expect(s.primary).toEqual({ kind: 'generate', enabled: true });
  });

  it('keeps Generate disabled until the topic has 3+ characters', () => {
    expect(composerState(sel({ topic: '  a ' }), trial).primary).toEqual({
      kind: 'generate',
      enabled: false,
    });
  });

  it('turns the primary action into a top-up when the balance is short', () => {
    const s = composerState(sel({ durationSec: 30 }), trial);
    expect(s.affordable).toBe(false);
    expect(s.primary).toEqual({ kind: 'top-up' });
  });

  it('keeps a locked option picked and points at the plan that unlocks it', () => {
    const premium = composerState(sel({ tier: 'premium' }), trial);
    expect(premium.tierLocked).toBe(true);
    expect(premium.primary).toEqual({ kind: 'upgrade', planName: 'Pro' });
    expect(premium.upgradePlan?.name).toBe('Pro');

    const long = composerState(sel({ durationSec: 120 }), trial);
    expect(long.durationLocked).toBe(true);
    expect(long.primary).toEqual({ kind: 'upgrade', planName: 'Ultra' });
  });

  it('prefers the upgrade over the top-up when an option is both locked and unaffordable', () => {
    expect(composerState(sel({ tier: 'premium' }), { ...trial, balance: 0 }).primary.kind).toBe(
      'upgrade',
    );
  });
});

describe('lock labels', () => {
  it('names the cheapest plan for each locked length and nothing for allowed ones', () => {
    expect(lengthLockPlan(30, 30)).toBeNull();
    expect(lengthLockPlan(60, 30)).toBe('Pro');
    expect(lengthLockPlan(120, 30)).toBe('Ultra');
  });

  it('names the plan that unlocks Premium', () => {
    expect(tierLockPlan('premium')).toBe('Pro');
  });
});

describe('initialSelection', () => {
  const last = { themeId: 'horror-story', targetDurationSec: 30, modelTier: 'standard' as const };

  it('prefills a brand-new account so the first video is one tap away', () => {
    const s = initialSelection({ params: {}, lastJob: null });
    expect(s).toMatchObject({ firstRun: true, themeId: STARTER.themeId, topic: STARTER.topic });
    expect(s.durationSec).toBe(15);
    expect(s.tier).toBe('standard');
  });

  it("remembers the creator's last theme, length and quality", () => {
    expect(initialSelection({ params: {}, lastJob: last })).toEqual({
      topic: '',
      themeId: 'horror-story',
      durationSec: 30,
      tier: 'standard',
      firstRun: false,
    });
  });

  it('lets an idea link override the topic and theme', () => {
    const s = initialSelection({
      params: { idea: 'Why honey never spoils', theme: 'fun-facts' },
      lastJob: last,
    });
    expect(s).toMatchObject({ topic: 'Why honey never spoils', themeId: 'fun-facts' });
  });

  it('ignores an unknown theme and caps a long idea', () => {
    const s = initialSelection({
      params: { idea: 'x'.repeat(500), theme: 'not-a-theme' },
      lastJob: last,
    });
    expect(s.themeId).toBe('horror-story');
    expect(s.topic).toHaveLength(300);
  });

  it('does not show the first-run note when a new account arrives with an idea', () => {
    expect(
      initialSelection({ params: { idea: 'A pigeon applies for a job' }, lastJob: null }).firstRun,
    ).toBe(false);
  });
});
