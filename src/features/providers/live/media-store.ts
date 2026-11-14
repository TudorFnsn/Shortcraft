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
  /**
   * A fresh readable URL for an object already stored at `path`. `downloadAs`
   * asks the browser to save it under that filename instead of playing it.
   */
  signedUrl(path: string, ttlSec: number, opts?: SignedUrlOptions): Promise<string>;
}

export interface SignedUrlOptions {
  downloadAs?: string;
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

/**
 * Object path inside `bucket` from a Supabase Storage signed URL
 * (`<origin>/storage/v1/object/sign/<bucket>/<path>?token=…`). Returns null for
 * anything else: another origin, another bucket, mock URLs, or a path that
 * tries to climb out of the bucket.
 */
export function storagePathFromSignedUrl(
  url: string,
  bucket: string,
  storageOrigin: string,
): string | null {
  let parsed: URL;
  let origin: string;
  try {
    parsed = new URL(url);
    origin = new URL(storageOrigin).origin;
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.origin !== origin) return null;

  const prefix = `/storage/v1/object/sign/${bucket}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;

  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return null;
  }
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  return path;
}

/** How long a re-signed asset URL lives: enough for one render to download it. */
export const ASSET_REFRESH_TTL_SEC = 15 * 60;

/**
 * A fresh URL for an asset in our bucket. Scene rows keep the signed URL their
 * step got back (24h TTL), and a re-voiced copy reuses its source's pictures
 * and clips, so a stored URL can be long expired by the time a render reads it.
 * Anything that isn't one of our signed URLs (mocks, `file://`) is returned as is.
 */
export async function freshAssetUrl(
  url: string,
  store: Pick<MediaStore, 'signedUrl'>,
  bucket: string,
  storageOrigin: string,
): Promise<string> {
  const path = storagePathFromSignedUrl(url, bucket, storageOrigin);
  return path ? store.signedUrl(path, ASSET_REFRESH_TTL_SEC) : url;
}

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
    return this.signedUrl(path, SIGNED_URL_TTL_SEC);
  }

  async signedUrl(path: string, ttlSec: number, opts?: SignedUrlOptions): Promise<string> {
    // Supabase turns `download` into a Content-Disposition: attachment header.
    const signed = await this.admin.storage
      .from(this.bucket)
      .createSignedUrl(path, ttlSec, opts?.downloadAs ? { download: opts.downloadAs } : undefined);
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

  async signedUrl(path: string, _ttlSec: number, _opts?: SignedUrlOptions): Promise<string> {
    if (!this.objects.has(path)) throw new Error(`media not found (${path})`);
    return `memory://${path}`;
  }
}
