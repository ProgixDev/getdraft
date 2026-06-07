/**
 * Upload the bundled sport images to Supabase Storage (public bucket "sports")
 * and repoint the 9 demo profiles' avatar_url + photos at the Storage URLs, so
 * the card images are real images hosted in the backend (not third-party URLs).
 *
 * Run:  node scripts/upload-sport-images.js     (from backend/)
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

// Card-sized resize target. Cards render at ~card-width px on phone,
// so 720x960 q70 mozjpeg keeps them crisp under typical pixel density
// while cutting the bundled originals (~80–260 KB) to ~40–70 KB.
const RESIZE_WIDTH = 720;
const RESIZE_HEIGHT = 960;
const JPEG_QUALITY = 70;

const envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = "sports";
const ASSET_DIR = path.join(__dirname, "..", "..", "assets", "sports");

// Title-case sport -> bundled file key
const SPORT_FILE = {
  Soccer: "soccer",
  Basketball: "basketball",
  Baseball: "baseball",
  Hockey: "hockey",
  Tennis: "tennis",
  Swimming: "swimming",
  Golf: "golf",
  Volleyball: "volleyball",
  "Track & Field": "track-field",
};

// Which demo users get which sport image
const USERS = [
  { email: "soccer.agent@getdraft.app", sport: "Soccer", kind: "recruiter" },
  { email: "basketball.coach@getdraft.app", sport: "Basketball", kind: "recruiter" },
  { email: "baseball.agent@getdraft.app", sport: "Baseball", kind: "recruiter" },
  { email: "hockey.coach@getdraft.app", sport: "Hockey", kind: "recruiter" },
  { email: "tennis.agent@getdraft.app", sport: "Tennis", kind: "recruiter" },
  { email: "swimming.athlete@getdraft.app", sport: "Swimming", kind: "athlete" },
  { email: "golf.athlete@getdraft.app", sport: "Golf", kind: "athlete" },
  { email: "volleyball.athlete@getdraft.app", sport: "Volleyball", kind: "athlete" },
  { email: "track.athlete@getdraft.app", sport: "Track & Field", kind: "athlete" },
];

async function ensureBucket() {
  const { data: buckets } = await supa.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await supa.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "5MB",
    });
    if (error && !/exists/i.test(error.message)) throw error;
    console.log("created bucket:", BUCKET);
  } else {
    console.log("bucket exists:", BUCKET);
  }
}

async function uploadAll() {
  const urls = {};
  const files = fs.readdirSync(ASSET_DIR).filter((f) => f.endsWith(".jpg"));
  for (const file of files) {
    const srcBuf = fs.readFileSync(path.join(ASSET_DIR, file));
    let buf;
    try {
      buf = await sharp(srcBuf)
        .resize(RESIZE_WIDTH, RESIZE_HEIGHT, { fit: "cover", position: "attention" })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
    } catch (e) {
      console.error("  resize FAIL", file, e.message);
      continue;
    }
    const { error } = await supa.storage
      .from(BUCKET)
      .upload(file, buf, { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.error("  upload FAIL", file, error.message);
      continue;
    }
    const { data } = supa.storage.from(BUCKET).getPublicUrl(file);
    urls[file.replace(/\.jpg$/, "")] = data.publicUrl;
    const srcKB = Math.round(srcBuf.length / 1024);
    const outKB = Math.round(buf.length / 1024);
    console.log(`  uploaded ${file}  (${srcKB}KB -> ${outKB}KB)`);
  }
  return urls;
}

async function repointProfiles(urls) {
  for (const u of USERS) {
    const key = SPORT_FILE[u.sport];
    const url = urls[key];
    if (!url) {
      console.error("  no url for", u.email, u.sport);
      continue;
    }
    const { data: row } = await supa
      .from("users")
      .select("id")
      .eq("email", u.email)
      .maybeSingle();
    if (!row) {
      console.error("  user not found", u.email);
      continue;
    }
    await supa.from("users").update({ avatar_url: url }).eq("id", row.id);
    const table = u.kind === "athlete" ? "athlete_profiles" : "recruiter_profiles";
    await supa.from(table).update({ photos: [url] }).eq("user_id", row.id);
    console.log("  repointed", u.email, "->", url);
  }
}

(async () => {
  await ensureBucket();
  console.log("Uploading images...");
  const urls = await uploadAll();
  console.log("Repointing 9 profiles...");
  await repointProfiles(urls);
  console.log("\nDone. Public base:", `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`);
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
