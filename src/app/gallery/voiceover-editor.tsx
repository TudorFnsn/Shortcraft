'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { defaultVoiceFor } from '@/config/voices';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { VoicePicker } from '@/components/voice/voice-picker';
import { useVoicePreview } from '@/components/voice/use-voice-preview';
import {
  DELIVERY_LABEL,
  SPEED_LABEL,
  nameOf,
  type MyVoice,
  type VoicePick,
} from '@/components/voice/voice-choice';
import type { LibraryCard } from './library';
import {
  PREVIEW_MAX_CHARS,
  cleanLine,
  editorState,
  revoiceBody,
  sourcePick,
  type EditScene,
} from './voiceover';

const fmt = (n: number) => n.toLocaleString('en-US');

/** The scene's picture, or a quiet tile when it can't load (mock mode, old renders). */
function SceneThumb({ jobId, idx }: { jobId: string; idx: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      aria-hidden="true"
      className="bg-raised block h-[71px] w-10 shrink-0 overflow-hidden rounded-[8px] sm:h-[92px] sm:w-[52px]"
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element -- a signed redirect, not a static asset
        <img
          src={`/api/jobs/${jobId}/thumbnail?scene=${idx}`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </span>
  );
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; scenes: EditScene[] };

/**
 * Edit voiceover (Voice Studio V3): change any line and/or the voice of a
 * finished video, then make a new version. The original stays; the new one
 * shows up in Your videos as v2. Only the voice and the final cut are re-run.
 */
export function VoiceoverEditor({
  card,
  balance,
  myVoices,
  onClose,
  onStarted,
}: {
  card: LibraryCard;
  balance: number;
  /** The creator's saved voices (Voice Studio V4). */
  myVoices: MyVoice[];
  onClose: () => void;
  /** The new version was accepted; the Library refreshes to show it. */
  onStarted: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [texts, setTexts] = useState<Record<number, string>>({});
  const source = useMemo(
    () => sourcePick(card.themeId, card.voiceId, card.voiceSettings, myVoices),
    [card.themeId, card.voiceId, card.voiceSettings, myVoices],
  );
  const [pick, setPick] = useState<VoicePick>(source);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hearing, setHearing] = useState<number | null>(null);
  const [lineNote, setLineNote] = useState<{ idx: number; text: string } | null>(null);
  const preview = useVoicePreview();

  useEffect(() => {
    let live = true;
    fetch(`/api/jobs/${card.id}/scenes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { editable: boolean; scenes: EditScene[] }) => {
        if (live)
          setLoad(data.editable ? { state: 'ready', scenes: data.scenes } : { state: 'error' });
      })
      .catch(() => {
        if (live) setLoad({ state: 'error' });
      });
    return () => {
      live = false;
    };
  }, [card.id]);

  const scenes = load.state === 'ready' ? load.scenes : [];
  const st = editorState(scenes, texts, pick, source, balance);
  const voiceId = pick.voiceId ?? source.voiceId;

  // "Hear this line": the line as it is now, in the voice as it is now. Free,
  // cached and capped per day by the server.
  async function hear(idx: number, text: string) {
    const key = `line-${idx}`;
    if (preview.playing === key) {
      preview.stop();
      return;
    }
    setHearing(idx);
    setLineNote(null);
    const res = await fetch('/api/voice/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanLine(text).slice(0, PREVIEW_MAX_CHARS),
        themeId: card.themeId,
        voiceId,
        speed: pick.speed,
        delivery: pick.delivery,
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setHearing(null);
    if (!res?.ok || typeof data.audioUrl !== 'string') {
      setLineNote({
        idx,
        text: data.message ?? "Couldn't play this line. Try again in a moment.",
      });
      return;
    }
    preview.toggle(key, data.audioUrl);
  }

  function close() {
    preview.stop();
    onClose();
  }

  async function submit() {
    if (!st.canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    const res = await fetch(`/api/jobs/${card.id}/revoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(revoiceBody(scenes, texts, pick, st.voiceChanged)),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSubmitting(false);
    if (!res?.ok) {
      setError(
        data.error === 'insufficient_credits'
          ? "You're out of credits for a new version."
          : res?.status === 401
            ? 'You were signed out. Log in again to continue.'
            : (data.message ?? "Couldn't start the new version. No credits were used."),
      );
      return;
    }
    preview.stop();
    onStarted();
  }

  const changes = st.edited.size + (st.voiceChanged ? 1 : 0);
  const summary =
    st.tooLong.size > 0
      ? 'Shorten the highlighted line to continue.'
      : st.empty.size > 0
        ? 'Every scene needs a line.'
        : changes === 0
          ? 'Change a line or the voice to make a new version.'
          : st.credits > balance
            ? `About ${fmt(st.credits)} credits · short by ${fmt(st.credits - balance)}`
            : `${[
                st.edited.size > 0
                  ? `${st.edited.size} ${st.edited.size === 1 ? 'line' : 'lines'} changed`
                  : '',
                st.voiceChanged ? 'new voice' : '',
              ]
                .filter(Boolean)
                .join(' · ')} · About ${fmt(st.credits)} credits · you have ${fmt(balance)}`;

  return (
    <Sheet open onClose={close} title="Edit voiceover" size="wide">
      <p className="text-ink-muted -mt-2 text-[15px]">
        Change the words, the voice, or both. The pictures stay as they are, and{' '}
        <span className="text-ink font-medium">{card.title}</span> is kept as it is.
      </p>

      <div className="flex flex-col gap-4">
        <button
          type="button"
          aria-expanded={voiceOpen}
          aria-controls="voiceover-voice"
          onClick={() => {
            if (voiceOpen) preview.stop();
            setVoiceOpen((o) => !o);
          }}
          className="bg-raised hover:bg-line inline-flex min-h-11 items-center gap-2 self-start rounded-full px-4 text-[15px] font-medium transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 8v4M7.5 5.5v9M11 7v6M14.5 4v12M18 8.5v3" />
          </svg>
          <span>
            <span className="sr-only">Voice: </span>
            {nameOf(voiceId, myVoices)} · {SPEED_LABEL[pick.speed]} ·{' '}
            {DELIVERY_LABEL[pick.delivery]}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            className={voiceOpen ? 'rotate-180' : ''}
          >
            <path d="M6 8l4 4 4-4" />
          </svg>
        </button>
        {voiceOpen && (
          <div id="voiceover-voice" className="border-line rounded-[20px] border p-4 sm:p-5">
            <VoicePicker
              voiceId={voiceId}
              lookPick={defaultVoiceFor(card.themeId)}
              mine={myVoices}
              createHref="/voices/new"
              speed={pick.speed}
              delivery={pick.delivery}
              playing={preview.playing}
              loading={preview.loading}
              note={preview.note}
              onPlay={(id) => void preview.toggleVoice(id, card.themeId)}
              onVoice={(id) => setPick((p) => ({ ...p, voiceId: id }))}
              onSpeed={(speed) => setPick((p) => ({ ...p, speed }))}
              onDelivery={(delivery) => setPick((p) => ({ ...p, delivery }))}
            />
          </div>
        )}
      </div>

      {load.state === 'loading' && (
        <p role="status" className="text-ink-muted py-8 text-center text-[15px]">
          Loading the voiceover…
        </p>
      )}
      {load.state === 'error' && (
        <p role="alert" className="text-ink-muted py-8 text-center text-[15px]">
          Couldn&apos;t load the voiceover. Close this and try again.
        </p>
      )}

      {load.state === 'ready' && (
        <ol className="flex flex-col gap-2">
          {scenes.map((s) => {
            const value = texts[s.idx] ?? s.narration;
            const edited = st.edited.has(s.idx);
            const tooLong = st.tooLong.has(s.idx);
            const length = value.replace(/\s+/g, ' ').trim().length;
            const countId = `scene-${s.idx}-count`;
            return (
              <li
                key={s.idx}
                className={`flex gap-3 rounded-[16px] p-3 transition-colors sm:gap-4 sm:p-4 ${
                  edited ? 'bg-ember-soft' : ''
                }`}
              >
                <SceneThumb jobId={card.id} idx={s.idx} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <label
                    htmlFor={`scene-${s.idx}`}
                    className="text-ink-muted text-[13px] font-semibold"
                  >
                    Scene {s.idx + 1}
                    {edited && <span className="text-ember-ink ml-2">Edited</span>}
                  </label>
                  <textarea
                    id={`scene-${s.idx}`}
                    rows={2}
                    value={value}
                    onChange={(e) => setTexts((t) => ({ ...t, [s.idx]: e.target.value }))}
                    aria-invalid={tooLong || st.empty.has(s.idx) ? true : undefined}
                    aria-describedby={countId}
                    className="bg-raised text-ink w-full resize-y rounded-[12px] px-3 py-2.5 text-base leading-[22px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ember)]"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span
                      id={countId}
                      className={`text-[13px] tabular-nums ${
                        tooLong ? 'text-warning font-semibold' : 'text-ink-muted'
                      }`}
                    >
                      {tooLong ? 'Too long for this scene: ' : ''}
                      {length} / {s.maxLength} characters
                    </span>
                    <span className="flex items-center gap-1">
                      {edited && (
                        <button
                          type="button"
                          onClick={() =>
                            setTexts((t) => {
                              const next = { ...t };
                              delete next[s.idx];
                              return next;
                            })
                          }
                          className="text-ember-ink min-h-11 px-2 text-[13px] font-semibold"
                        >
                          Undo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void hear(s.idx, value)}
                        disabled={hearing !== null || !cleanLine(value)}
                        aria-pressed={preview.playing === `line-${s.idx}`}
                        aria-label={`Hear scene ${s.idx + 1}`}
                        className="text-ink hover:bg-raised inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap disabled:opacity-60"
                      >
                        {preview.playing === `line-${s.idx}` ? (
                          <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                            <rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                            <path d="M7 4.5l9 5.5-9 5.5z" fill="currentColor" />
                          </svg>
                        )}
                        {hearing === s.idx ? (
                          'Loading…'
                        ) : preview.playing === `line-${s.idx}` ? (
                          'Stop'
                        ) : (
                          <>
                            Hear<span className="hidden sm:inline"> this line</span>
                          </>
                        )}
                      </button>
                    </span>
                  </div>
                  {lineNote?.idx === s.idx && (
                    <p role="status" className="text-ink-muted text-[13px]">
                      {lineNote.text}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <p role="alert" className="text-danger text-[15px] font-semibold">
          {error}
        </p>
      )}

      <div className="bg-surface border-line sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-3 border-t px-6 py-4 sm:-mx-8 sm:-mb-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span aria-live="polite" className="text-ink-muted text-center text-sm sm:text-left">
          {summary}
        </span>
        {st.credits > balance && changes > 0 ? (
          <Link
            href="/pricing"
            className="bg-ink text-paper inline-flex min-h-[54px] items-center justify-center rounded-full px-8 text-[17px] font-semibold"
          >
            Get more credits
          </Link>
        ) : (
          <Button
            type="button"
            size="lg"
            onClick={() => void submit()}
            aria-disabled={!st.canSubmit || submitting}
            className={`rounded-full sm:px-8 ${
              !st.canSubmit ? '!bg-raised !text-ink-muted !opacity-100' : ''
            }`}
          >
            {submitting ? 'Starting…' : 'Make new version'}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
