import Constants from "expo-constants";

const supabaseHost = (() => {
  const url = (Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined)
    ?.supabaseUrl;
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
})();

/**
 * True for a file in our own Supabase storage, the only place profile
 * photos and videos live (the server refuses anything else). The photo and
 * video viewers are routes, so a getdraft:// link could otherwise open them
 * on any URL: someone else's content inside the app's own viewer, fetched
 * from their server (which then learns the viewer's IP).
 */
export function isOurMediaUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!supabaseHost) return true; // misconfigured build: https only
    return (
      parsed.host === supabaseHost &&
      parsed.pathname.startsWith("/storage/v1/object/")
    );
  } catch {
    return false;
  }
}
