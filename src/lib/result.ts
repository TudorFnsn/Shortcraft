/**
 * Result<T, E> — explicit success/failure without throwing for control flow.
 *
 * Providers, the credits ledger, and the render orchestrator all return this so
 * callers must handle both branches. Reserve thrown exceptions for truly
 * exceptional/unexpected failures (bugs, unreachable states).
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Unwrap or throw — use only in tests or at trust boundaries you control. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`unwrap() on Err: ${JSON.stringify(r.error)}`);
}

/** Stable, machine-readable error codes used across features. */
export type AppErrorCode =
  | 'insufficient_credits'
  | 'moderation_blocked'
  | 'provider_failed'
  | 'invalid_input'
  | 'not_found'
  | 'unauthorized'
  | 'rate_limited'
  | 'internal';

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string;
  /** Optional structured context for logs (never returned raw to clients). */
  readonly cause?: unknown;
}

export const appError = (code: AppErrorCode, message: string, cause?: unknown): AppError => ({
  code,
  message,
  cause,
});
