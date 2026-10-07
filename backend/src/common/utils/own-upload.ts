/**
 * True when `url` is a file `userId` uploaded to one of `buckets` on our own
 * Supabase storage.
 *
 * /uploads/signed-url forces every upload under `<bucket>/<userId>/`, and the
 * app saves the public URL it gets back, so anything else is not an upload.
 * An outside host would be fetched by every phone that shows the image or
 * video (handing that host each viewer's IP and the moment they looked, minors
 * included) and would dodge the bucket's type and size limits; another user's
 * folder would present their media as one's own.
 */
export function isOwnUpload(
  url: unknown,
  userId: string,
  buckets: readonly string[],
): boolean {
  if (typeof url !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const base = process.env.SUPABASE_URL;
  if (base) {
    try {
      if (parsed.host !== new URL(base).host) return false;
    } catch {
      return false;
    }
  }
  const match =
    /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^/]+)\/.+/.exec(
      parsed.pathname,
    );
  if (!match) return false;
  try {
    return (
      buckets.includes(decodeURIComponent(match[1])) &&
      decodeURIComponent(match[2]) === userId
    );
  } catch {
    return false;
  }
}

/** Every entry an own upload (see {@link isOwnUpload}); empty is fine. */
export function allOwnUploads(
  urls: unknown[] | null | undefined,
  userId: string,
  buckets: readonly string[],
): boolean {
  return (urls ?? []).every((u) => isOwnUpload(u, userId, buckets));
}
