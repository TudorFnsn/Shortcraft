import { describe, expect, it } from 'vitest';
import { defaultVoiceFor } from '@/config/voices';
import {
  effectiveVoice,
  initialVoice,
  isPickable,
  nameOf,
  voiceName,
  voiceRequest,
} from '@/components/voice/voice-choice';

describe('initialVoice', () => {
  it('follows the look when there is no earlier video', () => {
    expect(initialVoice(null)).toEqual({ voiceId: null, speed: 'normal', delivery: 'natural' });
  });

  it("remembers the last video's voice and settings", () => {
    expect(
      initialVoice({ voiceId: 'george', voiceSettings: { speed: 'slower', delivery: 'calm' } }),
    ).toEqual({ voiceId: 'george', speed: 'slower', delivery: 'calm' });
  });

  it('drops a voice that left the catalog and follows the look again', () => {
    expect(initialVoice({ voiceId: 'retired-voice', voiceSettings: null }).voiceId).toBeNull();
  });
});

describe('effectiveVoice', () => {
  it("uses the look's default until a voice is picked", () => {
    const pick = initialVoice(null);
    expect(effectiveVoice(pick, 'horror-story')).toBe(defaultVoiceFor('horror-story'));
    expect(effectiveVoice(pick, 'fun-facts')).toBe(defaultVoiceFor('fun-facts'));
    expect(voiceName(pick, 'fun-facts')).toBe('Will');
  });

  it('keeps a picked voice when the look changes', () => {
    const pick = {
      voiceId: 'sarah' as const,
      speed: 'normal' as const,
      delivery: 'natural' as const,
    };
    expect(effectiveVoice(pick, 'horror-story')).toBe('sarah');
    expect(effectiveVoice(pick, 'fun-facts')).toBe('sarah');
  });
});

describe('voiceRequest', () => {
  it('sends nothing for an untouched pick, so the request is unchanged', () => {
    expect(voiceRequest(initialVoice(null))).toEqual({});
  });

  it('sends only what differs from the defaults', () => {
    expect(voiceRequest({ voiceId: 'brian', speed: 'normal', delivery: 'lively' })).toEqual({
      voiceId: 'brian',
      delivery: 'lively',
    });
    expect(voiceRequest({ voiceId: null, speed: 'faster', delivery: 'natural' })).toEqual({
      speed: 'faster',
    });
  });
});

describe('saved voices (V4)', () => {
  const mine = [
    {
      id: 'u_0f8e1c2a-1b2c-4d3e-8f90-123456789abc',
      name: 'Late-night radio',
      description: 'Low and smooth',
    },
  ];
  const own = mine[0]!.id;
  const gone = 'u_11111111-2222-4333-8444-555555555555';

  it('accepts a saved voice only while the creator still has it', () => {
    expect(isPickable(own, mine)).toBe(true);
    expect(isPickable(gone, mine)).toBe(false);
    expect(isPickable('george', [])).toBe(true);
  });

  it('starts from a saved voice, and follows the look again once it is deleted', () => {
    expect(initialVoice({ voiceId: own, voiceSettings: null }, mine).voiceId).toBe(own);
    expect(initialVoice({ voiceId: gone, voiceSettings: null }, mine).voiceId).toBeNull();
  });

  it('names saved and catalog voices', () => {
    expect(nameOf(own, mine)).toBe('Late-night radio');
    expect(nameOf('brian', mine)).toBe('Brian');
    expect(nameOf(gone, mine)).toBe('Your voice');
    expect(
      voiceName({ voiceId: own, speed: 'normal', delivery: 'natural' }, 'fun-facts', mine),
    ).toBe('Late-night radio');
  });

  it('sends a saved voice like any other pick', () => {
    expect(voiceRequest({ voiceId: own, speed: 'normal', delivery: 'natural' })).toEqual({
      voiceId: own,
    });
  });
});
