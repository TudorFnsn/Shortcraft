/**
 * Where live adapters put the bytes they produce (voiceover audio today; images
 * and renders next), returning a URL the next pipeline step can download.
 *
 * Supabase Storage for now: it is already provisioned and needs no new vendor.
 * The planned move to Cloudflare R2 (no egress fees) only swaps this
 * implementation. Objects live in a PRIVATE bucket and are handed out as
 * time-limited signed URLs.
 */
import type { createSupabaseAdminClient } from '@/utils/supabase/admin';

export interface MediaStore {
  /** Writes (or overwrites, so retries are safe) and returns a readable URL. */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<string>;
}

/**
 * Object path for one pipeline step's output, derived from its idempotency key
 * (`job:step:scene`): a retry of the same step overwrites the same object, and
 * two different steps can never share a path. Do not shorten this to a hash —
 * a 32-bit hash collides across jobs, and `put` overwrites, so one user's media
 * would silently replace another's.
 */
export function mediaPath(folder: string, idempotencyKey: string, ext: string): string {
  const safe = idempotencyKey.replace(/[^A-Za-z0-9_-]+/g, '_');
  return `${folder}/${safe}.${ext}`;
}

/** Long enough for the render step to fetch the file, short enough not to leak forever. */
export const SIGNED_URL_TTL_SEC = 60 * 60 * 24;

type StorageClient = Pick<ReturnType<typeof createSupabaseAdminClient>, 'storage'>;

export class SupabaseMediaStore implements MediaStore {
  constructor(
    private readonly admin: StorageClient,
    private readonly bucket: string,
  ) {}

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const bucket = this.admin.storage.from(this.bucket);
    const upload = await bucket.upload(path, bytes, { contentType, upsert: true });
    if (upload.error) throw new Error(`media upload failed (${path}): ${upload.error.message}`);
    const signed = await bucket.createSignedUrl(path, SIGNED_URL_TTL_SEC);
    if (signed.error || !signed.data) {
      throw new Error(`media signed URL failed (${path}): ${signed.error?.message ?? 'no data'}`);
    }
    return signed.data.signedUrl;
  }
}

export class InMemoryMediaStore implements MediaStore {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    this.objects.set(path, { bytes, contentType });
    return `memory://${path}`;
  }
}
