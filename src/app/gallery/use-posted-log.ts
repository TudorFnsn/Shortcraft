'use client';

import { useCallback, useEffect, useState } from 'react';
import { localDay, togglePosted, type PostedLog } from './posting';

const KEY = 'shortcraft:posted:v1';

function read(): PostedLog {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function write(log: PostedLog) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Private mode or blocked storage: the check-off still works for this visit.
  }
}

/**
 * The posted log for this browser. Starts empty on the server and loads after
 * mount, so server and client render the same first frame.
 */
export function usePostedLog() {
  const [log, setLog] = useState<PostedLog>({});
  const [today, setToday] = useState('');

  useEffect(() => {
    // Browser-only state (localStorage, the local calendar day) loads after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLog(read());
    setToday(localDay(new Date()));
  }, []);

  const toggle = useCallback((id: string) => {
    setLog((prev) => {
      const next = togglePosted(prev, id, localDay(new Date()));
      write(next);
      return next;
    });
  }, []);

  return { log, today, toggle };
}
