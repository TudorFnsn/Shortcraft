'use client';

import { VOICES, VOICE_DELIVERIES, VOICE_SPEEDS, type VoiceId } from '@/config/voices';
import type { VoiceDelivery, VoiceSpeed } from '@/config/voices';
import { onRadioKeyDown } from '@/components/ui/radio-keys';
import { DELIVERY_LABEL, SPEED_LABEL } from './voice-choice';

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 4.5l9 5.5-9 5.5z" fill="currentColor" />
    </svg>
  );
}

function Segmented<T extends string>({
  label,
  values,
  labels,
  value,
  onChange,
}: {
  label: string;
  values: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-ink-muted text-sm font-semibold" aria-hidden="true">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={(e) => onRadioKeyDown(e, values, value, onChange)}
        className="bg-raised flex gap-1 rounded-full p-1"
      >
        {values.map((v) => {
          const checked = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(v)}
              className={`min-h-10 flex-1 rounded-full text-sm font-medium transition-colors ${
                checked ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {labels[v]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The voice list with ▶ samples, plus speed and delivery. Shared by the Voice
 * sheet on Create and the voiceover editor.
 */
export function VoicePicker({
  voiceId,
  lookPick,
  speed,
  delivery,
  playing,
  onPlay,
  onVoice,
  onSpeed,
  onDelivery,
}: {
  /** The voice in use (the look's default until one is picked). */
  voiceId: VoiceId;
  /** The look's default voice, marked "Look's pick". */
  lookPick: VoiceId;
  speed: VoiceSpeed;
  delivery: VoiceDelivery;
  playing: string | null;
  onPlay: (id: VoiceId) => void;
  onVoice: (id: VoiceId) => void;
  onSpeed: (s: VoiceSpeed) => void;
  onDelivery: (d: VoiceDelivery) => void;
}) {
  const ids = VOICES.map((v) => v.id);
  return (
    <div className="flex flex-col gap-6">
      <div
        role="radiogroup"
        aria-label="Voices"
        onKeyDown={(e) => {
          // Arrow keys move between voices; the ▶ buttons stay reachable with Tab.
          if ((e.target as HTMLElement).getAttribute('role') !== 'radio') return;
          onRadioKeyDown(e, ids, voiceId, onVoice);
        }}
        className="grid gap-2 sm:grid-cols-2"
      >
        {VOICES.map((v) => {
          const checked = v.id === voiceId;
          const isPlaying = playing === v.id;
          return (
            <div
              key={v.id}
              className={`flex min-h-16 items-center gap-3 rounded-[16px] py-2 pr-3 pl-2.5 transition-colors ${
                checked ? 'bg-ember-soft ring-ember ring-2' : 'bg-raised'
              }`}
            >
              <button
                type="button"
                onClick={() => onPlay(v.id)}
                aria-label={`${isPlaying ? 'Stop' : 'Play'} ${v.name}`}
                aria-pressed={isPlaying}
                className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                  isPlaying ? 'bg-ember text-on-ember' : 'bg-surface text-ink hover:bg-line'
                }`}
              >
                <PlayIcon playing={isPlaying} />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => onVoice(v.id)}
                className="flex min-h-11 flex-1 flex-col justify-center text-left"
              >
                <span className="text-[15px] leading-5 font-semibold">
                  {v.name}
                  {v.id === lookPick && (
                    <span className="text-ink-muted ml-2 text-xs font-medium">
                      Look&apos;s pick
                    </span>
                  )}
                </span>
                <span className="text-ink-muted text-[13px] leading-[18px]">{v.character}</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="Speed"
          values={VOICE_SPEEDS}
          labels={SPEED_LABEL}
          value={speed}
          onChange={onSpeed}
        />
        <Segmented
          label="Delivery"
          values={VOICE_DELIVERIES}
          labels={DELIVERY_LABEL}
          value={delivery}
          onChange={onDelivery}
        />
      </div>
    </div>
  );
}
