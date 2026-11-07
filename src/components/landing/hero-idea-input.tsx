'use client';

import { CARRIED_IDEA_MAX_CHARS } from '@/config/site';
import { useTypedWords } from '@/components/motion/typed';

const IDEAS = [
  'three facts about octopuses that sound made up',
  'the lift that stopped at floor 13',
  'a 10-second trick for peeling garlic',
] as const;

/**
 * The landing's under-line idea input. Its placeholder types itself (B.1 motion
 * #3); the server renders the first idea, so it reads fine without JavaScript.
 */
export function HeroIdeaInput({ id, className = '' }: { id: string; className?: string }) {
  const placeholder = useTypedWords(IDEAS);
  return (
    <input
      id={id}
      name="idea"
      type="text"
      maxLength={CARRIED_IDEA_MAX_CHARS}
      placeholder={placeholder}
      className={`field-line text-ink min-h-11 w-full px-1 py-3 ${className}`.trim()}
    />
  );
}
