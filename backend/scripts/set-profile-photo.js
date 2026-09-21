#!/usr/bin/env node
/**
 * Set one user's profile photo from a local file.
 *
 * Uploads the image to the private `avatars` and `photos` buckets under the
 * user's own folder (the same layout the app's upload flow uses, so the
 * signed-URL interceptor serves it like any user-uploaded photo), then points
 * users.avatar_url and athlete_profiles.photos[0] at it.
 *
 * Usage, from backend/:
 *     node scripts/set-profile-photo.js <user-id> <path/to/image.jpg>
 *
 * Full user id required (uuid column). Reads SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY from backend/.env.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const [, , idArg, fileArg] = process.argv;
if (!idArg || !fileArg) {
  console.error("usage: node scripts/set-profile-photo.js <user-id> <image>");
  process.exit(1);
}

const envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  // id is a uuid column, so LIKE does not apply -- require the full id.
  const { data: user, error } = await supa
    .from("users")
    .select("id, name, role")
    .eq("id", idArg)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!user) throw new Error(`no user with id "${idArg}"`);
  console.log(`user: ${user.name} (${user.role}) ${user.id}`);

  const buf = fs.readFileSync(fileArg);
  const ext = path.extname(fileArg).toLowerCase() === ".png" ? "png" : "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  const name = `${Date.now()}-profile.${ext}`;

  const urls = {};
  for (const bucket of ["avatars", "photos"]) {
    const filePath = `${user.id}/${name}`;
    const { error: upErr } = await supa.storage
      .from(bucket)
      .upload(filePath, buf, { contentType, upsert: true });
    if (upErr) throw new Error(`${bucket} upload: ${upErr.message}`);
    urls[bucket] = supa.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
    console.log(`uploaded ${bucket}/${filePath} (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  const { error: uErr } = await supa
    .from("users")
    .update({ avatar_url: urls.avatars })
    .eq("id", user.id);
  if (uErr) throw new Error(`users.avatar_url: ${uErr.message}`);

  if (user.role === "athlete") {
    // Replace the first gallery photo, keep the rest.
    const { data: prof } = await supa
      .from("athlete_profiles")
      .select("photos")
      .eq("user_id", user.id)
      .maybeSingle();
    const rest = (prof?.photos ?? []).slice(1);
    const { error: pErr } = await supa
      .from("athlete_profiles")
      .update({ photos: [urls.photos, ...rest] })
      .eq("user_id", user.id);
    if (pErr) throw new Error(`athlete_profiles.photos: ${pErr.message}`);
  }
  console.log("done: avatar and first gallery photo updated");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
