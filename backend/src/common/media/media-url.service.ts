import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../config/supabase.config';

/**
 * Buckets whose objects require a signed URL.
 *
 * `sports` is deliberately absent: it holds sport icons shipped with the
 * product, not user media. Signing them would cost a round trip per icon and
 * protect nothing.
 */
export const PRIVATE_MEDIA_BUCKETS = [
  'avatars',
  'photos',
  'videos',
  'posts',
] as const;

/** How long a freshly minted URL stays valid. */
const SIGN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Re-sign once the remaining life drops below this, so a URL handed out now
 * is never close to expiring by the time the client uses it.
 */
const REFRESH_BEFORE_MS = 24 * 60 * 60 * 1000; // 1 day

/** Belt and braces against a runaway cache on a long-lived process. */
const MAX_CACHE_ENTRIES = 5000;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

export interface StorageRef {
  bucket: string;
  path: string;
}

@Injectable()
export class MediaUrlService {
  private readonly logger = new Logger(MediaUrlService.name);

  /**
   * Signed URLs are cached and reused, which is not an optimisation but a
   * correctness concern for the client: expo-image caches by URL, so minting
   * a different token on every request would re-download every photo on
   * every feed refresh. Reusing the same URL until it nears expiry keeps
   * those cache hits — and keeps Supabase egress down with them.
   */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  /** Kill switch. Set MEDIA_SIGNING=off to fall straight back to public URLs. */
  get enabled(): boolean {
    return this.configService.get('MEDIA_SIGNING') !== 'off';
  }

  /**
   * Resolves any of the three shapes a stored media value can take into
   * bucket + path:
   *
   *   - `https://<proj>.supabase.co/storage/v1/object/public/photos/<uid>/x.jpg`
   *   - `https://<proj>.supabase.co/storage/v1/object/sign/photos/<uid>/x.jpg?token=…`
   *   - `photos/<uid>/x.jpg`
   *
   * The signed shape matters: the app reads a signed URL and can hand it
   * straight back on the next save. Without recognising it we would persist
   * a token that expires, and the photo would silently vanish a week later.
   */
  parse(value: unknown): StorageRef | null {
    if (typeof value !== 'string' || value.length === 0) return null;

    const marker = /\/storage\/v1\/object\/(?:public|sign|authenticated)\//;
    const hit = marker.exec(value);

    let remainder: string;
    if (hit) {
      remainder = value.slice(hit.index + hit[0].length);
    } else if (!value.includes('://')) {
      remainder = value.replace(/^\/+/, '');
    } else {
      return null; // some other host entirely — leave it alone
    }

    remainder = remainder.split('?')[0];
    const slash = remainder.indexOf('/');
    if (slash <= 0) return null;

    const bucket = remainder.slice(0, slash);
    const path = remainder.slice(slash + 1);
    if (!path) return null;
    if (!(PRIVATE_MEDIA_BUCKETS as readonly string[]).includes(bucket)) {
      return null;
    }

    return { bucket, path: decodeURIComponent(path) };
  }

  /**
   * Canonical form to persist. Always the public-style URL, never a signed
   * one — the token is a transient read grant, not part of the identity of
   * the object, and storing it would rot.
   */
  normalizeForStorage(value: unknown): unknown {
    const ref = this.parse(value);
    if (!ref) return value;

    const supabase = this.supabaseService.getAdminClient();
    const {
      data: { publicUrl },
    } = supabase.storage.from(ref.bucket).getPublicUrl(ref.path);
    return publicUrl;
  }

  /**
   * Signs a batch, grouped per bucket so each bucket costs one round trip
   * rather than one per object. Returns a map keyed by the ORIGINAL value so
   * callers can swap in place.
   *
   * A failure to sign yields no entry, and the caller leaves the original
   * value untouched — a broken image is a far better outcome than a 500 on
   * the whole feed.
   */
  async signAll(values: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!this.enabled || values.length === 0) return out;

    const now = Date.now();
    const pending = new Map<string, { original: string; path: string }[]>();

    for (const original of new Set(values)) {
      const ref = this.parse(original);
      if (!ref) continue;

      const key = `${ref.bucket}/${ref.path}`;
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt - now > REFRESH_BEFORE_MS) {
        out.set(original, cached.url);
        continue;
      }

      const list = pending.get(ref.bucket) ?? [];
      list.push({ original, path: ref.path });
      pending.set(ref.bucket, list);
    }

    const supabase = this.supabaseService.getAdminClient();

    await Promise.all(
      [...pending.entries()].map(async ([bucket, items]) => {
        try {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrls(
              items.map((i) => i.path),
              SIGN_TTL_SECONDS,
            );

          if (error || !data) {
            this.logger.warn(
              `[media] could not sign ${items.length} object(s) in ${bucket}: ${error?.message ?? 'no data'}`,
            );
            return;
          }

          data.forEach((row: any, index: number) => {
            const item = items[index];
            if (!item || !row?.signedUrl) return;
            out.set(item.original, row.signedUrl);
            this.remember(`${bucket}/${item.path}`, row.signedUrl, now);
          });
        } catch (err: any) {
          this.logger.warn(
            `[media] signing ${bucket} failed: ${err?.message ?? err}`,
          );
        }
      }),
    );

    return out;
  }

  private remember(key: string, url: string, now: number) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // Oldest insertion first — Map preserves insertion order.
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { url, expiresAt: now + SIGN_TTL_SECONDS * 1000 });
  }
}
