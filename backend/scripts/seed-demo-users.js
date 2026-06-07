/**
 * Seed 9 real, confirmed demo users (5 recruiters/coaches + 4 athletes), each a
 * different sport, directly into the live Supabase via the service-role key.
 *
 * - Uses admin.createUser({ email_confirm: true }) so accounts are immediately
 *   usable (no email verification step).
 * - The DB `handle_new_user` trigger creates public.users + a basic subscription.
 * - We then complete public.users (location/country/onboarded/avatar) and insert
 *   the matching athlete_profiles / recruiter_profiles row.
 *
 * Idempotent: re-running upserts profiles and skips already-created auth users.
 *
 * Run:  node scripts/seed-demo-users.js     (from the backend/ folder)
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// --- load backend/.env (no external dep) ---
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

const PASSWORD = "GetDraft2026!";

// Verified royalty-free Pexels photos (per sport) used as profile/avatar images.
const PEX = {
  Soccer: "17203155",
  Basketball: "2834917",
  Baseball: "5184715",
  Hockey: "8975011",
  Tennis: "18016920",
  Swimming: "260598",
  Golf: "114972",
  Volleyball: "6203515",
  "Track & Field": "17592499",
};
const photo = (sport) =>
  `https://images.pexels.com/photos/${PEX[sport]}/pexels-photo-${PEX[sport]}.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1440&fit=crop`;

const USERS = [
  // --- Recruiters / Coaches (seen by athletes) ---
  { email: "soccer.agent@getdraft.app", name: "Diego Fernández", role: "recruiter", sport: "Soccer", kind: "recruiter", roleType: "agent", org: "Global Football Partners", tags: ["FIFA Licensed", "Transfers", "Youth Scouting"], location: "Los Angeles, CA, USA", country: "United States" },
  { email: "basketball.coach@getdraft.app", name: "Marcus Bell", role: "coach", sport: "Basketball", kind: "recruiter", roleType: "coach", org: "State University", tags: ["NCAA Div I", "Recruiting", "Development"], location: "Austin, TX, USA", country: "United States" },
  { email: "baseball.agent@getdraft.app", name: "Tony Ricci", role: "recruiter", sport: "Baseball", kind: "recruiter", roleType: "agent", org: "Diamond Sports Mgmt", tags: ["MLBPA", "Draft Prep", "Contracts"], location: "Miami, FL, USA", country: "United States" },
  { email: "hockey.coach@getdraft.app", name: "Erik Lindqvist", role: "coach", sport: "Hockey", kind: "recruiter", roleType: "coach", org: "Northern University", tags: ["U SPORTS", "Development", "Scouting"], location: "Boston, MA, USA", country: "United States" },
  { email: "tennis.agent@getdraft.app", name: "Sophie Laurent", role: "recruiter", sport: "Tennis", kind: "recruiter", roleType: "agent", org: "Ace Talent Agency", tags: ["ATP/WTA", "Junior Circuit", "Sponsorships"], location: "New York, NY, USA", country: "United States" },
  // --- Athletes (seen by recruiters/coaches) ---
  { email: "swimming.athlete@getdraft.app", name: "Hannah Cole", role: "athlete", sport: "Swimming", kind: "athlete", position: "Freestyle", level: "NCAA Div I", location: "San Diego, CA, USA", country: "United States", classYear: "2026", height: "5'9\"", awards: ["State Champion 200m Free"] },
  { email: "golf.athlete@getdraft.app", name: "Ryan Mitchell", role: "athlete", sport: "Golf", kind: "athlete", position: "Amateur", level: "NCAA Div I", location: "Phoenix, AZ, USA", country: "United States", classYear: "2025", awards: ["Junior Amateur Finalist"] },
  { email: "volleyball.athlete@getdraft.app", name: "Bianca Rossi", role: "athlete", sport: "Volleyball", kind: "athlete", position: "Outside Hitter", level: "NCAA Div I", location: "Chicago, IL, USA", country: "United States", classYear: "2026", height: "6'1\"", awards: ["All-Conference 2024"] },
  { email: "track.athlete@getdraft.app", name: "Jamal Carter", role: "athlete", sport: "Track & Field", kind: "athlete", position: "Sprints", level: "NCAA Div I", location: "Atlanta, GA, USA", country: "United States", classYear: "2025", awards: ["100m Regional Champion"] },
];

async function findUserIdByEmail(email) {
  const { data } = await supa.from("users").select("id").eq("email", email).maybeSingle();
  return data?.id || null;
}

async function run() {
  const results = [];
  for (const u of USERS) {
    let id = null;
    const { data, error } = await supa.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: u.role, name: u.name },
    });
    if (error) {
      id = await findUserIdByEmail(u.email);
      if (!id) {
        console.error("FAIL (create)", u.email, "-", error.message);
        continue;
      }
      console.log("exists, updating:", u.email);
    } else {
      id = data.user.id;
    }

    const { error: uerr } = await supa
      .from("users")
      .update({
        name: u.name,
        role: u.role,
        is_onboarded: true,
        location: u.location,
        country: u.country,
        avatar_url: photo(u.sport),
      })
      .eq("id", id);
    if (uerr) console.error("  users update error:", u.email, uerr.message);

    if (u.kind === "athlete") {
      const { error: perr } = await supa.from("athlete_profiles").upsert(
        {
          user_id: id,
          sport: u.sport,
          position: u.position,
          level: u.level,
          bio: `${u.position} • ${u.sport} • ${u.level}`,
          class_year: u.classYear || null,
          height: u.height || null,
          awards: u.awards || [],
          photos: [photo(u.sport)],
          videos: [],
        },
        { onConflict: "user_id" }
      );
      if (perr) console.error("  athlete_profiles error:", u.email, perr.message);
    } else {
      const { error: perr } = await supa.from("recruiter_profiles").upsert(
        {
          user_id: id,
          organization: u.org,
          sport: u.sport,
          role_type: u.roleType,
          verified: true,
          tags: u.tags || [],
          bio: `${u.org} • ${u.sport}`,
          photos: [photo(u.sport)],
          videos: [],
        },
        { onConflict: "user_id" }
      );
      if (perr) console.error("  recruiter_profiles error:", u.email, perr.message);
    }

    results.push({ email: u.email, role: u.role, sport: u.sport, id });
    console.log("OK", u.email.padEnd(32), `${u.role}/${u.sport}`.padEnd(24), id);
  }

  console.log("\n========================= SUMMARY =========================");
  console.log("Shared password:", PASSWORD);
  console.log(`Created/updated: ${results.length}/${USERS.length}`);
  for (const r of results) {
    console.log(`${r.email.padEnd(32)} ${`${r.role}/${r.sport}`.padEnd(24)} ${r.id}`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
