/**
 * Add one real recruiter user (Coach Daniels, American Football) to the live
 * Supabase project. Idempotent: re-running upserts the profile and skips an
 * already-created auth user.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from backend/.env (no
 * hardcoded secrets). Run from backend/:  node scripts/add-coach.js
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "coach@getdraft.app";
const PASSWORD = "GetDraft2026!";
const NAME = "Coach Daniels";
const AVATAR_URL =
  "https://jzzsnputbvzxssbraetl.supabase.co/storage/v1/object/public/sports/american-football.jpg";

const PROFILE = {
  organization: "Cincinnati State University",
  sport: "American Football",
  role_type: "coach",
  verified: true,
  tags: ["NCAA Div I", "Recruiting", "QB Development"],
  bio: "College FB program — recruiting QB/skill prospects.",
  photos: [AVATAR_URL],
  videos: [],
};

async function findUserIdByEmail(email) {
  const { data } = await supa
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return data?.id || null;
}

(async () => {
  let id = null;

  const { data, error } = await supa.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "coach", name: NAME },
  });

  if (error) {
    id = await findUserIdByEmail(EMAIL);
    if (!id) {
      console.error("FAIL (create)", EMAIL, "-", error.message);
      process.exit(1);
    }
    console.log("exists, updating:", EMAIL);
  } else {
    id = data.user.id;
  }

  const { error: uerr } = await supa
    .from("users")
    .update({
      name: NAME,
      role: "coach",
      is_onboarded: true,
      location: "Cincinnati, OH, USA",
      country: "United States",
      avatar_url: AVATAR_URL,
    })
    .eq("id", id);
  if (uerr) {
    console.error("FAIL (users update)", EMAIL, "-", uerr.message);
    process.exit(1);
  }

  const { error: perr } = await supa
    .from("recruiter_profiles")
    .upsert({ user_id: id, ...PROFILE }, { onConflict: "user_id" });
  if (perr) {
    console.error("FAIL (recruiter_profiles upsert)", EMAIL, "-", perr.message);
    process.exit(1);
  }

  console.log(`OK ${EMAIL.padEnd(28)} coach/${PROFILE.sport.padEnd(18)} ${id}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
