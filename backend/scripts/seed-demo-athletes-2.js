/**
 * Seed 12 additional demo athletes.
 *
 * Why: the Play reviewer signs in as a recruiter, and a recruiter's Discover
 * deck was five cards deep. A reviewer swipes through five in well under a
 * minute, lands on "You've seen everyone!", and reasonably concludes the app
 * is broken or empty -- the most likely rejection for this product.
 *
 * Three things are fixed at once by spreading these across sports and
 * countries rather than piling them into one bucket:
 *   - deck depth      5 -> 17 cards
 *   - rankings        several athletes now share a sport, so world_rank stops
 *                     reading "#1 of 1" for everyone (rankings partition by
 *                     sport -- see migration 040)
 *   - the Globe       pins on five continents instead of a near-empty map
 *
 * Follows seed-demo-users.js exactly: admin.createUser({email_confirm:true}),
 * let the handle_new_user trigger create public.users, then complete the row
 * and upsert athlete_profiles. Idempotent -- re-running updates in place.
 *
 * Photos reuse that script's nine verified Pexels IDs, one per sport; all nine
 * were re-checked (HTTP 200) before this was written. Athletes in the same
 * sport therefore share a photo, which is why no two same-sport athletes are
 * adjacent in the deck order.
 *
 * MMA is deliberately absent: there is no verified MMA photo, and a card with
 * a broken image is worse than one fewer card. Achraf stays world #1 in MMA.
 *
 * CLEANUP AFTER LAUNCH: every account here uses @getdraft.app, matching the
 * existing demo users. public.users.id references auth.users ON DELETE CASCADE,
 * so deleting the auth user removes the profile, swipes, matches and messages
 * in one step.
 *
 * Run:  node scripts/seed-demo-athletes-2.js      (from the backend/ folder)
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

const PASSWORD = "GetDraft2026!";

// Same verified IDs as seed-demo-users.js.
const PEX = {
  Soccer: "17203155",
  Basketball: "2834917",
  Hockey: "8975011",
  Tennis: "18016920",
  Swimming: "260598",
  Golf: "114972",
  Volleyball: "6203515",
  "Track & Field": "17592499",
};
const photo = (sport) =>
  `https://images.pexels.com/photos/${PEX[sport]}/pexels-photo-${PEX[sport]}.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1440&fit=crop`;

// Non-ASCII written as escapes on purpose: the first seed shipped a bio
// reading "Sprints â€¢ Track & Field" because a literal bullet
// was double-encoded on the way into the database.
const DOT = "•";

/**
 * Ordered so the reviewer never sees two athletes of the same sport back to
 * back -- same sport means the same stock photo.
 *
 * views/completion vary so Draft Scores differ and the leaderboard reads like
 * a real standing rather than a row of ties. kyc "approved" adds 15 to the
 * score (see migration 040), so it is given to the leaders only.
 */
const ATHLETES = [
  { email: "soccer.it@getdraft.app",     name: "Matteo Rossi",     sport: "Soccer",        position: "Winger",          level: "Serie A Youth",   country: "Italy",          location: "Milan, Italy",              lat: 45.4642,  lng: 9.19,     classYear: "2026", height: "5'11\"", views: 74, completion: 95, kyc: "approved", awards: ["Primavera Top Scorer 2025"] },
  { email: "swim.fr@getdraft.app",       name: "Marie Dubois",     sport: "Swimming",      position: "Butterfly",       level: "National Team",   country: "France",         location: "Paris, France",             lat: 48.8566,  lng: 2.3522,   classYear: "2026", height: "5'8\"",  views: 66, completion: 90, kyc: "approved", awards: ["French Junior Champion 100m Fly"] },
  { email: "hoops.rs@getdraft.app",      name: "Luka Petrovic",    sport: "Basketball",    position: "Point Guard",     level: "EuroLeague Youth",country: "Serbia",         location: "Belgrade, Serbia",          lat: 44.7866,  lng: 20.4489,  classYear: "2025", height: "6'3\"",  views: 58, completion: 88, kyc: "approved", awards: ["ABA League U19 MVP"] },
  { email: "track.gh@getdraft.app",      name: "Kwame Mensah",     sport: "Track & Field", position: "200m / 400m",     level: "National Team",   country: "Ghana",          location: "Accra, Ghana",              lat: 5.6037,   lng: -0.187,   classYear: "2026", height: "6'0\"",  views: 51, completion: 85, kyc: "none",     awards: ["African U20 Silver 200m"] },
  { email: "volley.jp@getdraft.app",     name: "Yuki Nakamura",    sport: "Volleyball",    position: "Setter",          level: "V.League Youth",  country: "Japan",          location: "Tokyo, Japan",              lat: 35.6762,  lng: 139.6503, classYear: "2026", height: "5'10\"", views: 47, completion: 82, kyc: "none",     awards: ["Inter-High Best Setter"] },
  { email: "golf.uk@getdraft.app",       name: "Callum Fraser",    sport: "Golf",          position: "Amateur",         level: "R&A Amateur",     country: "United Kingdom", location: "Edinburgh, Scotland, UK",   lat: 55.9533,  lng: -3.1883,  classYear: "2025", height: "6'1\"",  views: 43, completion: 80, kyc: "none",     awards: ["Scottish Boys Runner-up"] },
  { email: "tennis.es@getdraft.app",     name: "Elena Navarro",    sport: "Tennis",        position: "Singles",         level: "ITF Junior",      country: "Spain",          location: "Barcelona, Spain",          lat: 41.3851,  lng: 2.1734,   classYear: "2027", height: "5'7\"",  views: 39, completion: 78, kyc: "none",     awards: ["ITF J300 Quarter-finalist"] },
  { email: "hockey.ca@getdraft.app",     name: "Noah Tremblay",    sport: "Hockey",        position: "Centre",          level: "QMJHL",           country: "Canada",         location: "Montreal, QC, Canada",      lat: 45.5019,  lng: -73.5674, classYear: "2026", height: "6'2\"",  views: 35, completion: 76, kyc: "none",     awards: ["QMJHL Rookie of the Month"] },
  { email: "soccer.eg@getdraft.app",     name: "Ahmed Hassan",     sport: "Soccer",        position: "Centre Back",     level: "Egyptian Premier",country: "Egypt",          location: "Cairo, Egypt",              lat: 30.0444,  lng: 31.2357,  classYear: "2026", height: "6'2\"",  views: 30, completion: 72, kyc: "none",     awards: ["U20 National Team Captain"] },
  { email: "swim.br@getdraft.app",       name: "Sofia Almeida",    sport: "Swimming",      position: "Freestyle",       level: "National Team",   country: "Brazil",         location: "Sao Paulo, Brazil",         lat: -23.5505, lng: -46.6333, classYear: "2027", height: "5'9\"",  views: 24, completion: 68, kyc: "none",     awards: ["Brazilian Junior 400m Free Champion"] },
  { email: "hoops.ca@getdraft.app",      name: "Tyrell Banks",     sport: "Basketball",    position: "Shooting Guard",  level: "CEGEP",           country: "Canada",         location: "Toronto, ON, Canada",       lat: 43.6532,  lng: -79.3832, classYear: "2027", height: "6'5\"",  views: 18, completion: 64, kyc: "none",     awards: ["OSBA All-Star"] },
  { email: "track.se@getdraft.app",      name: "Emma Lindgren",    sport: "Track & Field", position: "Long Jump",       level: "National Team",   country: "Sweden",         location: "Stockholm, Sweden",         lat: 59.3293,  lng: 18.0686,  classYear: "2027", height: "5'9\"",  views: 11, completion: 60, kyc: "none",     awards: ["Swedish U18 Long Jump Champion"] },
];

async function findUserIdByEmail(email) {
  const { data } = await supa.from("users").select("id").eq("email", email).maybeSingle();
  return data?.id || null;
}

async function run() {
  const done = [];
  for (const a of ATHLETES) {
    let id = null;
    const { data, error } = await supa.auth.admin.createUser({
      email: a.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: "athlete", name: a.name },
    });
    if (error) {
      id = await findUserIdByEmail(a.email);
      if (!id) {
        console.error("FAIL (create)", a.email, "-", error.message);
        continue;
      }
      console.log("exists, updating:", a.email);
    } else {
      id = data.user.id;
    }

    // activation_status is set explicitly: the feed and the talent map both
    // gate on 'active' (the COPPA guard), so a row left at the default would
    // be invisible and the whole point of this seed would be lost.
    const { error: uerr } = await supa
      .from("users")
      .update({
        name: a.name,
        role: "athlete",
        is_onboarded: true,
        is_banned: false,
        activation_status: "active",
        location: a.location,
        country: a.country,
        latitude: a.lat,
        longitude: a.lng,
        kyc_status: a.kyc,
        avatar_url: photo(a.sport),
      })
      .eq("id", id);
    if (uerr) console.error("  users update error:", a.email, uerr.message);

    const { error: perr } = await supa.from("athlete_profiles").upsert(
      {
        user_id: id,
        sport: a.sport,
        position: a.position,
        level: a.level,
        bio: `${a.position} ${DOT} ${a.sport} ${DOT} ${a.level}`,
        class_year: a.classYear,
        height: a.height || null,
        awards: a.awards || [],
        photos: [photo(a.sport)],
        videos: [],
        profile_views: a.views,
        profile_completion: a.completion,
      },
      { onConflict: "user_id" }
    );
    if (perr) console.error("  athlete_profiles error:", a.email, perr.message);

    done.push(a);
    console.log("OK", a.email.padEnd(26), `${a.sport}/${a.country}`.padEnd(30), id);
  }

  console.log("\n===================== SUMMARY =====================");
  console.log(`Seeded ${done.length}/${ATHLETES.length}   password: ${PASSWORD}`);
  const bySport = {};
  for (const a of done) bySport[a.sport] = (bySport[a.sport] || 0) + 1;
  console.log("Per sport (new only):", JSON.stringify(bySport));
  console.log("Countries:", [...new Set(done.map((a) => a.country))].join(", "));
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
