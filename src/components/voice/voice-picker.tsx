'use client';

import { VOICES, VOICE_DELIVERIES, VOICE_SPEEDS, type VoiceId } from '@/config/voices';
import type { VoiceDelivery, VoiceSpeed } from '@/config/voices';
import { onRadioKeyDown } from '@/components/ui/radio-keys';
import Link from 'next/link';
import { DELIVERY_LABEL, SPEED_LABEL, type MyVoice } from './voice-choice';

/** Section labels: Inter 600 uppercase (B.1 eyebrow, app scale). */
const LABEL = 'text-[13px] font-semibold tracking-[2px] uppercase';

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
      <span className={LABEL} aria-hidden="true">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={(e) => onRadioKeyDown(e, values, value, onChange)}
        className="flex gap-1 rounded-full bg-black/10 p-1"
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
              className={`min-h-11 flex-1 rounded-full text-[15px] font-semibold transition-colors ${
                checked ? 'text-blush bg-[#212121]' : 'text-ink hover:bg-black/10'
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

function VoiceTile({
  id,
  name,
  detail,
  badge,
  checked,
  playing,
  loading,
  onPlay,
  onVoice,
}: {
  id: string;
  name: string;
  detail: string;
  badge?: string;
  checked: boolean;
  playing: boolean;
  loading: boolean;
  onPlay: (id: string) => void;
  onVoice: (id: string) => void;
}) {
  return (
    <div
      className={`flex min-h-16 items-center gap-3 rounded-[8px] py-2 pr-3 pl-2.5 transition-colors ${
        checked ? 'bg-blush text-[#212121]' : 'bg-black/10'
      }`}
    >
      <button
        type="button"
        onClick={() => onPlay(id)}
        aria-label={`${playing ? 'Stop' : 'Play'} ${name}`}
        aria-pressed={playing}
        aria-busy={loading}
        className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-transform hover:translate-x-0.5 hover:translate-y-0.5 ${
          playing ? 'bg-blush text-[#212121] ring-2 ring-[#212121]' : 'text-blush bg-[#212121]'
        } ${loading ? 'animate-pulse' : ''}`}
      >
        <PlayIcon playing={playing} />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        tabIndex={checked ? 0 : -1}
        onClick={() => onVoice(id)}
        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left"
      >
        <span className="font-display truncate text-[22px] leading-6">
          {name}
          {badge && (
            <span className="ml-2 font-sans text-[12px] font-semibold tracking-[1px] uppercase">
              {badge}
            </span>
          )}
        </span>
        <span className="truncate text-[14px] leading-[18px]">{detail}</span>
      </button>
    </div>
  );
}

/**
 * The voice list with ▶ samples, plus speed and delivery. Shared by the Voice
 * sheet on Create and the voiceover editor. Boxes look (DesignPlan §4 B.2):
 * rows like My voices (ink ▶ circle, Fraunces name), the picked one in blush,
 * and speed and delivery as blush/ink pills; it reads on the sky and dark boxes. The creator's saved voices come
 * first, with a way to create one; then the catalog.
 */
export function VoicePicker({
  voiceId,
  lookPick,
  mine = [],
  createHref,
  speed,
  delivery,
  playing,
  loading = null,
  note = '',
  onPlay,
  onVoice,
  onSpeed,
  onDelivery,
}: {
  /** The voice in use (the look's default until one is picked). */
  voiceId: string;
  /** The look's default voice, marked "Look's pick". */
  lookPick: VoiceId;
  /** The creator's saved voices (V4). */
  mine?: readonly MyVoice[];
  /** Where "Create a voice" goes; hidden when absent. */
  createHref?: string;
  speed: VoiceSpeed;
  delivery: VoiceDelivery;
  playing: string | null;
  /** A saved voice whose sample is being fetched. */
  loading?: string | null;
  /** Why a sample couldn't play. */
  note?: string;
  onPlay: (id: string) => void;
  onVoice: (id: string) => void;
  onSpeed: (s: VoiceSpeed) => void;
  onDelivery: (d: VoiceDelivery) => void;
}) {
  const ids = [...mine.map((v) => v.id), ...VOICES.map((v) => v.id)];
  const tile = { onPlay, onVoice };
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
        className="flex flex-col gap-5"
      >
        {(mine.length > 0 || createHref) && (
          <div className="flex flex-col gap-2">
            <span className={LABEL} aria-hidden="true">
              My voices
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {mine.map((v) => (
                <VoiceTile
                  key={v.id}
                  {...tile}
                  id={v.id}
                  name={v.name}
                  detail={v.description}
                  checked={v.id === voiceId}
                  playing={playing === v.id}
                  loading={loading === v.id}
                />
              ))}
              {createHref && (
                <Link
                  href={createHref}
                  className="flex min-h-16 items-center gap-2.5 rounded-[8px] border-[1.5px] border-dashed border-current px-4 text-[17px] font-semibold transition-colors hover:bg-black/10"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M10 4v12M4 10h12" />
                  </svg>
                  Create a voice
                </Link>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {(mine.length > 0 || createHref) && (
            <span className={LABEL} aria-hidden="true">
              Voices
            </span>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {VOICES.map((v) => (
              <VoiceTile
                key={v.id}
                {...tile}
                id={v.id}
                name={v.name}
                detail={v.character}
                badge={v.id === lookPick ? 'Look’s pick' : undefined}
                checked={v.id === voiceId}
                playing={playing === v.id}
                loading={false}
              />
            ))}
          </div>
        </div>
      </div>
      {note && (
        <p role="status" className="-mt-3 text-[15px]">
          {note}
        </p>
      )}

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
