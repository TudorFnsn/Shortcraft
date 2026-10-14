'use client';

import { useEffect, useState } from 'react';
import { MOTION, motionAllowed } from './gsap';

export interface TypedState {
  word: number;
  len: number;
  deleting: boolean;
}

/** The first frame: the first word in full, about to be held then deleted. */
export function typedStart(words: readonly string[]): TypedState {
  return { word: 0, len: words[0]?.length ?? 0, deleting: true };
}

/**
 * One keystroke of the typed word: backspace until empty, move to the next word,
 * type it letter by letter, then hold it. Returns the next state, the text to
 * show and how long to wait before the next keystroke.
 */
export function typedStep(
  words: readonly string[],
  { word, len, deleting }: TypedState,
): { state: TypedState; text: string; wait: number } {
  const at = (i: number) => words[i] ?? '';
  let wait: number = MOTION.typed.perLetter;
  if (deleting) {
    len -= 1;
    if (len <= 0) {
      len = 0;
      deleting = false;
      word = (word + 1) % Math.max(1, words.length);
    }
  } else {
    len += 1;
    if (len >= at(word).length) {
      len = at(word).length;
      deleting = true;
      wait = MOTION.typed.hold;
    }
  }
  return { state: { word, len, deleting }, text: at(word).slice(0, len), wait };
}

/**
 * Typed word (B.1 motion #3): types each word ~90ms a letter, holds it, then
 * backspaces to the next. Returns the first word on the server and under
 * reduced motion, so the markup is complete without JavaScript.
 */
export function useTypedWords(words: readonly string[], enabled = true): string {
  const [text, setText] = useState(words[0] ?? '');

  useEffect(() => {
    if (!enabled || words.length < 2 || !motionAllowed()) return;
    let state = typedStart(words);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const next = typedStep(words, state);
      state = next.state;
      setText(next.text);
      timer = setTimeout(tick, next.wait);
    };
    // Start by holding the first word (already on screen from the server).
    timer = setTimeout(tick, MOTION.typed.hold);
    return () => clearTimeout(timer);
  }, [words, enabled]);

  return text;
}

/**
 * A word that types itself with a blinking caret. Screen readers get `label`
 * (or the first word) once instead of every keystroke.
 */
export function Typed({
  words,
  label,
  className = '',
}: {
  words: readonly string[];
  label?: string;
  className?: string;
}) {
  const text = useTypedWords(words);
  return (
    <span className={className}>
      <span className="sr-only">{label ?? words[0]}</span>
      <span aria-hidden="true">
        {text}
        <span className="typed-caret" />
      </span>
    </span>
  );
}
