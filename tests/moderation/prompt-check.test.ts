import { TOPIC_MAX_CHARS } from '@/config/site';
import { describe, expect, it } from 'vitest';
import {
  normalizeForModeration,
  ruleBasedModerator,
  screenPrompt,
  screenScenePrompts,
  screenVisualPrompt,
} from '@/features/moderation/prompt-check';

describe('normalizeForModeration', () => {
  it('folds case, accents, leetspeak and punctuation into padded words', () => {
    expect(normalizeForModeration('  P0RN-Vidéo!! ')).toBe(' porn video ');
    expect(normalizeForModeration('h0w t0 m@ke')).toBe(' how to make ');
  });
});

describe('screenPrompt — blocks', () => {
  it.each([
    ['sexy schoolgirl story', 'minor_sexual'],
    ['nude photos of a 12 year old kid', 'minor_sexual'],
    ['lolicon anime edit', 'minor_sexual'],
    ['hardcore porn compilation', 'sexual_explicit'],
    ['NSFW hentai recap', 'sexual_explicit'],
    ['how to kill myself painlessly', 'self_harm'],
    ['best suicide methods ranked', 'self_harm'],
    ['thinspo motivation', 'self_harm'],
    ['how to make a pipe bomb at home', 'weapons'],
    ['step by step guide to cook meth', 'weapons'],
    ['h0w t0 bu1ld a gh0st gun', 'weapons'],
    ['why we should exterminate all the immigrants', 'violent_hate'],
    ['heil hitler motivational speech', 'violent_hate'],
  ] as const)('%s → %s', (topic, category) => {
    expect(screenPrompt(topic)).toBe(category);
  });
});

describe('screenPrompt — lets everyday and educational topics through', () => {
  it.each([
    'Office drama: my boss stole my lunch',
    '5 fun science experiments for kids',
    'Naked mole rat facts for kids',
    'Suicide prevention: how to support a friend',
    'The history of the atomic bomb',
    'How to make a bath bomb',
    'Unisex fashion trends for teens',
    'Explicit lyrics explained to kids',
    'Minor league baseball legends',
    'How teens can start investing',
    'Dark history: the rise of Nazi Germany',
    'Gender reveal party ideas',
  ])('%s', (topic) => {
    expect(screenPrompt(topic)).toBeNull();
  });
});

describe('screenPrompt — known gaps (backstopped by provider safety filters)', () => {
  it('does not catch letters split by punctuation', () => {
    expect(screenPrompt('p.o.r.n star facts')).toBeNull();
  });
});

describe('ruleBasedModerator', () => {
  it('returns ok for a clean topic', async () => {
    expect((await ruleBasedModerator.check('Top 5 productivity hacks')).ok).toBe(true);
  });

  it('returns moderation_blocked with a category and a reason that never echoes the prompt', async () => {
    const res = await ruleBasedModerator.check('how to make a pipe bomb');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('moderation_blocked');
    expect(res.error.category).toBe('weapons');
    expect(res.error.message).not.toContain('pipe bomb');
  });
});

describe('screenVisualPrompt / screenScenePrompts — generated scene prompts', () => {
  const scene = (index: number, imagePrompt: string, motionPrompt = 'slow push-in') => ({
    index,
    imagePrompt,
    motionPrompt,
  });

  it.each([
    ['a nude woman lying on a bed, cinematic lighting', 'sexual_explicit'],
    ['seductive schoolgirl in a dim classroom', 'minor_sexual'],
  ] as const)('blocks %j as %s', (text, category) => {
    expect(screenVisualPrompt(text)).toBe(category);
  });

  it.each([
    // Text-only categories are not applied to pictures: dark fiction and history must pass.
    'soldiers wipe out the men of the village, smoke over the ruins',
    'a lone figure reading a guide to making a bomb shelter',
    'naked mole rat colony in a sandy tunnel, macro shot',
    'a cat CEO in a glass office, golden hour',
  ])('passes %j', (text) => {
    expect(screenVisualPrompt(text)).toBeNull();
  });

  it('returns the first flagged scene, checking motion prompts too', () => {
    expect(
      screenScenePrompts([
        scene(0, 'city skyline at dawn'),
        scene(1, 'a dancer on stage', 'camera lingers on nude photos'),
        scene(2, 'porn set'),
      ]),
    ).toEqual({ sceneIndex: 1, category: 'sexual_explicit' });
  });

  it('passes a clean script', () => {
    expect(screenScenePrompts([scene(0, 'a forest at night'), scene(1, 'an owl')])).toBeNull();
  });
});

describe('screenPrompt — long prompts (Create accepts up to TOPIC_MAX_CHARS)', () => {
  it('still catches minor + sexual terms far apart in a long prompt', () => {
    const filler = 'the weather was calm that day. '.repeat(3000);
    expect(screenPrompt(`a kid ${filler} then something sexy`)).toBe('minor_sexual');
    expect(screenPrompt(`nude ${filler} toddler`)).toBe('minor_sexual');
  });

  it('screens a worst-case 100k-character prompt in linear time', () => {
    const worst = 'kid '.repeat(TOPIC_MAX_CHARS / 4);
    expect(worst.length).toBe(TOPIC_MAX_CHARS);
    const start = performance.now();
    expect(screenPrompt(worst)).toBeNull();
    // The old ` minor .* sexual ` rule took ~1s+ here; linear checks take a few ms.
    expect(performance.now() - start).toBeLessThan(250);
  });
});
