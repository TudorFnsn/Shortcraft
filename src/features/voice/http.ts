import type { AppErrorCode } from '@/lib/result';

/** HTTP status for a My voices error (the routes share one mapping). */
export function errorStatus(code: AppErrorCode): number {
  switch (code) {
    case 'insufficient_credits':
      return 402;
    case 'plan_limit':
      return 403;
    case 'not_found':
      return 404;
    case 'moderation_blocked':
      return 422;
    case 'provider_failed':
      return 502;
    default:
      return 400;
  }
}
