/**
 * Email delivery port + the Resend implementation (plain fetch, no SDK).
 * Without RESEND_API_KEY / EMAIL_FROM / EMAIL_LINK_SECRET there is no sender,
 * and the lifecycle cron runs as a dry run (plans and logs, sends nothing).
 */
import { appError, err, ok, type AppError, type Result } from '@/lib/result';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  /** Provider-side de-duplication of retries. */
  idempotencyKey?: string;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<Result<{ id: string }, AppError>>;
}

const RESEND_URL = 'https://api.resend.com/emails';

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(email: OutgoingEmail): Promise<Result<{ id: string }, AppError>> {
    const res = await this.fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...(email.idempotencyKey ? { 'idempotency-key': email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: email.headers,
      }),
    }).catch((e: unknown) => e as Error);
    if (res instanceof Error) return err(appError('provider_failed', `Resend: ${res.message}`));
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return err(appError('provider_failed', `Resend ${res.status}: ${body.slice(0, 200)}`));
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return ok({ id: data.id ?? '' });
  }
}
