/**
 * Minimal structured logger. Emits single-line JSON so Vercel/host log drains
 * stay greppable. Errors and `alert` warnings also go to the error reporter
 * (Sentry) when one is set; call sites don't change.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

export type ErrorReporter = (message: string, fields: Fields | undefined, level: Level) => void;

let reporter: ErrorReporter | null = null;

/**
 * Forward errors, and warnings tagged with an `alert` field, to an error
 * tracker (Sentry, set in `instrumentation.ts`). Null turns it off.
 */
export function setErrorReporter(r: ErrorReporter | null): void {
  reporter = r;
}

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
  if (reporter && (level === 'error' || (level === 'warn' && fields?.alert !== undefined))) {
    try {
      reporter(message, fields, level);
    } catch {
      // Reporting must never break the caller.
    }
  }
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
