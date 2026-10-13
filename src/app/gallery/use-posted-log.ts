'use client';

import { useEffect, useState } from 'react';
import { legacyImports, localDay, logFromCards, type PostedLog } from './posting';

/** Where the streak lived before it moved to the account (0008). Read once, then cleared. */
const LEGACY_KEY = 'shortcraft:posted:v1';

interface PostableCard {
  id: string;
  kind: string;
  postedAt: string | null;
}

function readLegacy(): PostedLog {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function clearLegacy() {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Blocked storage: nothing to clear.
  }
}

async function save(id: string, body: { posted: boolean; postedAt?: string }) {
  const res = await fetch(`/api/jobs/${id}/posted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  return res?.ok ?? false;
}

/**
 * The posted log, saved on the account so the streak follows the creator across
 * devices. Toggles are optimistic and roll back (with `onError`) if the save
 * fails. Days ticked in this browser before the move are imported once.
 * The local calendar day is only known in the browser, so `today` is '' on the
 * server and the first client render, keeping hydration identical.
 */
export function usePostedLog(cards: readonly PostableCard[], onError: () => void) {
  const [pending, setPending] = useState<Record<string, string | null>>({});
  const [today, setToday] = useState('');
  // The import runs once, against the videos loaded with the page.
  const [initialCards] = useState(cards);

  useEffect(() => {
    // The local calendar day and localStorage exist only in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(localDay(new Date()));

    const legacy = readLegacy();
    if (Object.keys(legacy).length === 0) return;
    const imports = legacyImports(legacy, initialCards);
    setPending((p) => ({ ...p, ...Object.fromEntries(imports.map((i) => [i.id, i.postedAt])) }));
    void Promise.all(imports.map((i) => save(i.id, { posted: true, postedAt: i.postedAt }))).then(
      (results) => {
        if (results.every(Boolean)) clearLegacy();
      },
    );
  }, [initialCards]);

  function toggle(id: string) {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const current = id in pending ? pending[id] : card.postedAt;
    const next = current ? null : new Date().toISOString();
    setPending((p) => ({ ...p, [id]: next }));
    void save(id, { posted: next !== null }).then((ok) => {
      if (ok) return;
      setPending((p) => {
        const rest = { ...p };
        delete rest[id];
        return rest;
      });
      onError();
    });
  }

  return { log: logFromCards(cards, pending), today, toggle };
}
