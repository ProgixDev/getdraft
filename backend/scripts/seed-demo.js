/**
 * Seed ~10 REAL demo users for the client demo / recording, wired to live Supabase
 * and using the images already in the public "sports" Storage bucket as their
 * avatar + first profile photo.
 *
 * Idempotent: re-running skips auth.createUser when the email already exists, but
 * always re-applies users.update + profile upsert so the demo state stays consistent.
 * Does NOT touch existing users that aren't in this list.
 *
 * Run:  node scripts/seed-demo.js     (from backend/)
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// ── load backend/.env (no dep) ─────────────────────────────────────────────────
const envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "GetDraft2026!";
const BUCKET = "sports";

// ── sport ↔ filename in the sports bucket (multiple candidates per sport) ──────
const SPORT_FILES = {
  soccer: ["soccer.jpg", "soccer.jpeg", "soccer.png", "soccer.webp"],
  basketball: ["basketball.jpg", "basketball.jpeg", "basketball.png"],
  baseball: ["baseball.jpg", "baseball.jpeg", "baseball.png"],
  hockey: ["hockey.jpg", "hockey.jpeg", "hockey.png"],
  tennis: ["tennis.jpg", "tennis.jpeg", "tennis.png"],
  swimming: ["swimming.jpg", "swimming.jpeg", "swimming.png"],
  golf: ["golf.jpg", "golf.jpeg", "golf.png"],
  volleyball: ["volleyball.jpg", "volleyball.jpeg", "volleyball.png"],
  "track-field": ["track-field.jpg", "track_field.jpg", "track.jpg", "trackfield.jpg"],
  "american-football": ["american-football.jpg", "american_football.jpg", "football.jpg", "americanfootball.jpg"],
};

// Title-case display name for the sport (stored on profile.sport).
const SPORT_DISPLAY = {
  soccer: "Soccer",
  basketball: "Basketball",
  baseball: "Baseball",
  hockey: "Hockey",
  tennis: "Tennis",
  swimming: "Swimming",
  golf: "Golf",
  volleyball: "Volleyball",
  "track-field": "Track & Field",
  "american-football": "American Football",
};

// ── demo users (mix so the feed is rich) ──────────────────────────────────────
const DEMO_USERS = [
  // ATHLETES (6)
  {
    email: "demo.soccer.athlete@getdraft.app",
    name: "Marcus Silva",
    role: "athlete",
    sportKey: "soccer",
    location: "Lisbon, Portugal",
    country: "Portugal",
    athlete: {
      position: "Forward",
      level: "U17 Academy",
      class_year: "2028",
      height: "5'10\"",
      weight: "159 lbs",
      bio: "Left-footed forward with a knack for big moments. Top scorer in my U17 academy season; open to college or pro pathway.",
      awards: ["U17 Top Scorer 2025"],
    },
  },
  {
    email: "demo.basketball.athlete@getdraft.app",
    name: "Aaliyah Carter",
    role: "athlete",
    sportKey: "basketball",
    location: "Atlanta, GA, USA",
    country: "United States",
    athlete: {
      position: "Point Guard",
      level: "High School Varsity",
      class_year: "2027",
      height: "5'9\"",
      weight: "138 lbs",
      bio: "Pass-first point guard with court vision and a reliable mid-range pull-up. State All-Tournament selection last spring.",
      awards: ["State All-Tournament 2025"],
    },
  },
  {
    email: "demo.baseball.athlete@getdraft.app",
    name: "Hiroshi Tanaka",
    role: "athlete",
    sportKey: "baseball",
    location: "Osaka, Japan",
    country: "Japan",
    athlete: {
      position: "Pitcher",
      level: "U16 Prefectural",
      class_year: "2028",
      height: "6'0\"",
      weight: "172 lbs",
      bio: "Right-handed pitcher, 92 mph fastball with a developing slider. Targeting a college program in North America.",
      awards: ["Prefecture MVP 2024"],
    },
  },
  {
    email: "demo.swimming.athlete@getdraft.app",
    name: "Lena Petrova",
    role: "athlete",
    sportKey: "swimming",
    location: "Munich, Germany",
    country: "Germany",
    athlete: {
      position: "Freestyle / Backstroke",
      level: "Senior National",
      class_year: "2026",
      height: "5'11\"",
      weight: "150 lbs",
      bio: "Freestyle and backstroke specialist. 200m free PB 2:01.8. Training 12 sessions a week, aiming for an NCAA scholarship.",
      awards: ["National Junior 200m Champion"],
    },
  },
  {
    email: "demo.track.athlete@getdraft.app",
    name: "Emeka Okafor",
    role: "athlete",
    sportKey: "track-field",
    location: "Lagos, Nigeria",
    country: "Nigeria",
    athlete: {
      position: "100m / 200m Sprinter",
      level: "U19 National",
      class_year: "2027",
      height: "6'0\"",
      weight: "174 lbs",
      bio: "100m PB 10.42, 200m PB 21.10. National junior medalist; looking for a college program with a strong sprint group.",
      awards: ["U19 National Sprint Medalist"],
    },
  },
  {
    email: "demo.volleyball.athlete@getdraft.app",
    name: "Ana Reis",
    role: "athlete",
    sportKey: "volleyball",
    location: "São Paulo, Brazil",
    country: "Brazil",
    athlete: {
      position: "Outside Hitter",
      level: "Club U18",
      class_year: "2027",
      height: "6'1\"",
      weight: "154 lbs",
      bio: "Outside hitter, 305 cm jump touch. State club champion; open to college programs in Europe or North America.",
      awards: ["State Club Champion 2025"],
    },
  },

  // RECRUITERS / COACHES (4)
  {
    email: "demo.tennis.agent@getdraft.app",
    name: "Camille Dubois",
    role: "recruiter",
    sportKey: "tennis",
    location: "Paris, France",
    country: "France",
    recruiter: {
      organization: "Performance Edge Tennis",
      role_type: "agent",
      tags: ["ITF Juniors", "WTA Pipeline", "College Placement"],
      bio: "Player representation focused on ITF juniors and early-WTA. We help athletes balance training and college recruiting.",
    },
  },
  {
    email: "demo.hockey.coach@getdraft.app",
    name: "Aleksander Kovac",
    role: "coach",
    sportKey: "hockey",
    location: "Vienna, Austria",
    country: "Austria",
    recruiter: {
      organization: "TSV Vienna Sharks U18",
      role_type: "coach",
      tags: ["U18 Elite League", "Forwards", "Goaltender Wanted"],
      bio: "Head coach of the Vienna Sharks U18 program. Recruiting forwards and a goaltender for the 2026–27 season.",
    },
  },
  {
    email: "demo.golf.agent@getdraft.app",
    name: "David Park",
    role: "recruiter",
    sportKey: "golf",
    location: "Seoul, South Korea",
    country: "South Korea",
    recruiter: {
      organization: "Apex Golf Management",
      role_type: "agent",
      tags: ["NCAA D1", "Junior Golf", "Asia Pipeline"],
      bio: "Boutique agency placing junior golfers into NCAA Division I programs. Strong network in the Pac-12 and SEC.",
    },
  },
  {
    email: "demo.football.coach@getdraft.app",
    name: "James Whitfield",
    role: "coach",
    sportKey: "american-football",
    location: "Houston, TX, USA",
    country: "United States",
    recruiter: {
      organization: "Riverdale College Eagles",
      role_type: "coach",
      tags: ["NCAA D2", "Defensive Backs", "Offensive Line"],
      bio: "Recruiting coordinator at Riverdale College. Looking for DBs and OL prospects for the 2027 class.",
    },
  },
];

// ── helpers ────────────────────────────────────────────────────────────────────
async function listSportsBucket() {
  const { data, error } = await admin.storage.from(BUCKET).list("", {
    limit: 200,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`storage.list(${BUCKET}): ${error.message}`);
  return (data || []).map((f) => f.name);
}

function pickSportFile(sportKey, availableLower) {
  const candidates = SPORT_FILES[sportKey] || [`${sportKey}.jpg`];
  for (const cand of candidates) {
    if (availableLower.includes(cand.toLowerCase())) return cand;
  }
  return null;
}

function publicSportUrl(filename) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
}

async function findUserIdByEmail(email) {
  const { data, error } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`users.select(${email}): ${error.message}`);
  return data?.id || null;
}

async function ensureAuthUser(u) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: u.name, role: u.role },
  });
  if (!error) return { id: data.user.id, created: true };

  const existing = await findUserIdByEmail(u.email);
  if (existing) return { id: existing, created: false };
  throw new Error(`auth.createUser(${u.email}): ${error.message}`);
}

async function applyUserRow(id, u) {
  const { error } = await admin
    .from("users")
    .upsert(
      {
        id,
        email: u.email,
        name: u.name,
        role: u.role,
        is_onboarded: true,
        location: u.location,
        country: u.country,
        avatar_url: u.imageUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(`users.upsert(${u.email}): ${error.message}`);
}

async function applyProfile(id, u) {
  if (u.role === "athlete") {
    const p = u.athlete;
    const { error } = await admin.from("athlete_profiles").upsert(
      {
        user_id: id,
        sport: SPORT_DISPLAY[u.sportKey],
        position: p.position,
        level: p.level,
        bio: p.bio,
        class_year: p.class_year,
        height: p.height,
        weight: p.weight,
        awards: p.awards || [],
        photos: [u.imageUrl],
        videos: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`athlete_profiles(${u.email}): ${error.message}`);
  } else {
    const p = u.recruiter;
    const { error } = await admin.from("recruiter_profiles").upsert(
      {
        user_id: id,
        organization: p.organization,
        sport: SPORT_DISPLAY[u.sportKey],
        role_type: p.role_type,
        verified: true,
        tags: p.tags || [],
        bio: p.bio,
        photos: [u.imageUrl],
        videos: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`recruiter_profiles(${u.email}): ${error.message}`);
  }
}

async function feedSmokeTest(loginEmail) {
  if (!ANON_KEY) {
    console.log("(feed smoke test skipped: SUPABASE_ANON_KEY not set)");
    return;
  }
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: loginEmail,
    password: PASSWORD,
  });
  if (error || !data?.session?.access_token) {
    console.log(`(feed smoke test: signIn failed: ${error?.message || "no session"})`);
    return;
  }
  const apiBase = env.SEED_API_URL || `http://localhost:${env.PORT || 3000}/api`;
  let res;
  try {
    res = await fetch(`${apiBase}/discover/feed`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
  } catch (e) {
    console.log(`(feed smoke test: fetch failed: ${e.message}; backend running?)`);
    return;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.log(`(feed smoke test: HTTP ${res.status} ${body.slice(0, 120)})`);
    return;
  }
  const body = await res.json();
  const payload = body?.data?.cards ? body.data : body;
  const cards = payload?.cards || [];
  const types = [...new Set(cards.map((c) => c?.cardType))].join(", ");
  const sampleImg =
    cards.find((c) => c?.photos?.[0])?.photos?.[0] ||
    cards.find((c) => c?.imageUrl)?.imageUrl ||
    null;
  console.log(
    `Feed smoke (as ${loginEmail}): ${cards.length} cards, types=[${types}]`,
  );
  if (sampleImg) console.log(`  sample photo: ${sampleImg}`);
}

// ── run ────────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`▶ Listing "${BUCKET}" bucket...`);
  const files = await listSportsBucket();
  const lower = files.map((f) => f.toLowerCase());
  console.log(`  ${files.length} files: ${files.join(", ") || "(empty)"}`);

  const created = [];
  const updated = [];
  const skippedMissingImage = [];

  for (const u of DEMO_USERS) {
    const file = pickSportFile(u.sportKey, lower);
    if (!file) {
      console.log(`⚠ skip ${u.email} — no image for sport "${u.sportKey}"`);
      skippedMissingImage.push(u);
      continue;
    }
    u.imageUrl = publicSportUrl(file);

    try {
      const auth = await ensureAuthUser(u);
      await applyUserRow(auth.id, u);
      await applyProfile(auth.id, u);
      const tag = auth.created ? "✔ created" : "↺ updated";
      (auth.created ? created : updated).push(u);
      console.log(
        `${tag} ${u.email.padEnd(36)} ${`${u.role}/${u.sportKey}`.padEnd(30)} ${auth.id}`,
      );
    } catch (e) {
      console.error(`✖ FAIL ${u.email}: ${e.message}`);
    }
  }

  // ── counts + sample verification ────────────────────────────────────────────
  const { count: totalUsers } = await admin
    .from("users")
    .select("id", { count: "exact", head: true });
  const { count: athleteCount } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "athlete");
  const { count: recruiterCount } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "recruiter");
  const { count: coachCount } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "coach");

  console.log("\n── Summary ──");
  console.log(`  Created: ${created.length}`);
  console.log(`  Updated (already existed): ${updated.length}`);
  if (skippedMissingImage.length) {
    console.log(
      `  Skipped (no image): ${skippedMissingImage.map((u) => u.sportKey).join(", ")}`,
    );
  }
  console.log(`  public.users total: ${totalUsers}`);
  console.log(`    athletes: ${athleteCount}, recruiters: ${recruiterCount}, coaches: ${coachCount}`);
  console.log(`  Shared password: ${PASSWORD}`);

  // Sample an athlete and a recruiter to verify avatar + profile photos
  const sampleAthlete = [...created, ...updated].find((u) => u.role === "athlete");
  if (sampleAthlete) {
    const { data: row } = await admin
      .from("users")
      .select("id, name, avatar_url, role")
      .eq("email", sampleAthlete.email)
      .single();
    const { data: prof } = await admin
      .from("athlete_profiles")
      .select("sport, photos")
      .eq("user_id", row.id)
      .single();
    console.log(`\n  Sample athlete ${row.name}:`);
    console.log(`    avatar_url: ${row.avatar_url}`);
    console.log(`    profile.sport: ${prof?.sport}`);
    console.log(`    profile.photos: ${JSON.stringify(prof?.photos)}`);
  }
  const sampleRecruiter = [...created, ...updated].find((u) => u.role !== "athlete");
  if (sampleRecruiter) {
    const { data: row } = await admin
      .from("users")
      .select("id, name, avatar_url, role")
      .eq("email", sampleRecruiter.email)
      .single();
    const { data: prof } = await admin
      .from("recruiter_profiles")
      .select("organization, sport, role_type, photos")
      .eq("user_id", row.id)
      .single();
    console.log(`  Sample recruiter ${row.name}:`);
    console.log(`    avatar_url: ${row.avatar_url}`);
    console.log(`    profile: ${prof?.organization} (${prof?.role_type}, ${prof?.sport})`);
    console.log(`    profile.photos: ${JSON.stringify(prof?.photos)}`);
  }

  // ── feed smoke test (login as one demo athlete + GET /discover/feed) ────────
  if (sampleAthlete) {
    console.log("\n▶ Feed smoke test...");
    await feedSmokeTest(sampleAthlete.email);
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e?.stack || e?.message || e);
    process.exit(1);
  });
