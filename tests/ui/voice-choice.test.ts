import { describe, expect, it } from 'vitest';
import { defaultVoiceFor } from '@/config/voices';
import {
  effectiveVoice,
  initialVoice,
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
