/**
 * Minimal structured logger. Emits single-line JSON so Vercel/host log drains
 * and later Sentry breadcrumbs stay greppable. Swap the sink here (not at call
 * sites) when we wire a real logging backend.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

function emit(level: Level, message: string, fields?: Fields): void {
  const line = JSON.stringify({
    level,
    message,
    ...fields,
    ts: new Date().toISOString(),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Fields) => emit('debug', message, fields),
  info: (message: string, fields?: Fields) => emit('info', message, fields),
  warn: (message: string, fields?: Fields) => emit('warn', message, fields),
  error: (message: string, fields?: Fields) => emit('error', message, fields),
  /** Return a child logger that stamps every line with `base` fields. */
  with(base: Fields) {
    return {
      debug: (m: string, f?: Fields) => emit('debug', m, { ...base, ...f }),
      info: (m: string, f?: Fields) => emit('info', m, { ...base, ...f }),
      warn: (m: string, f?: Fields) => emit('warn', m, { ...base, ...f }),
      error: (m: string, f?: Fields) => emit('error', m, { ...base, ...f }),
    };
  },
};
