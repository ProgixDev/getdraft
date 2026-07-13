// Auto-generated from docs/LICENSES.html — the canonical copy.
// Served at GET /api/licenses — open-source acknowledgements for the
// "Licenses" row on the app's About screen.
export const LICENSES_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GetDraft — Open Source Licenses</title>
<style>
  :root{--green:#0984E3;--green-d:#0a4d8f;--ink:#121A24;--muted:#5D6672;--line:#E3E7EA;--bg:#F8FAFB}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);line-height:1.65;background:#fff;font-size:16px}
  .hero{background:linear-gradient(135deg,#121212,#0D2C4D 65%,#0A4D8F 140%);color:#fff;padding:44px 22px 36px}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:18px;max-width:820px;margin-left:auto;margin-right:auto}
  .logo{width:30px;height:30px;border-radius:8px;background:var(--green);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:17px}
  .brand b{font-size:17px}.brand b span{color:var(--green)}
  .hero h1{font-size:30px;font-weight:800;max-width:820px;margin:0 auto}
  .hero p{color:#9CC7F0;margin-top:8px;max-width:820px;margin-left:auto;margin-right:auto;font-size:14px}
  main{max-width:820px;margin:0 auto;padding:34px 22px 60px}
  h2{font-size:20px;margin:34px 0 10px;color:var(--green-d)}
  p,li{color:#2A3340;font-size:15px}
  table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
  th,td{text-align:left;padding:9px 12px;border:1px solid var(--line);vertical-align:top}
  th{background:var(--bg);font-weight:600}
  .note{background:var(--bg);border:1px solid var(--line);border-left:4px solid var(--green);border-radius:8px;padding:13px 16px;margin:16px 0;font-size:14px}
  footer{border-top:1px solid var(--line);padding:22px;text-align:center;color:var(--muted);font-size:13px}
  a{color:var(--green-d)}
</style>
</head>
<body>

<div class="hero">
  <div class="brand"><div class="logo">G</div><b>Get<span>Draft</span></b></div>
  <h1>Open Source Licenses</h1>
  <p>Last updated: July 13, 2026</p>
</div>

<main>
  <p>GetDraft is built with the help of outstanding open-source software. We are grateful to the maintainers and communities behind these projects. The main components and their licenses are listed below; the complete license texts are available in each project's repository.</p>

  <h2>Mobile app</h2>
  <table>
    <tr><th>Project</th><th>License</th></tr>
    <tr><td>React &amp; React Native</td><td>MIT</td></tr>
    <tr><td>Expo (SDK, Router, and expo-* modules)</td><td>MIT</td></tr>
    <tr><td>React Native Reanimated</td><td>MIT</td></tr>
    <tr><td>React Native Gesture Handler</td><td>MIT</td></tr>
    <tr><td>React Native SVG</td><td>MIT</td></tr>
    <tr><td>React Redux &amp; Redux Toolkit</td><td>MIT</td></tr>
    <tr><td>Stripe React Native SDK</td><td>MIT</td></tr>
    <tr><td>Three.js</td><td>MIT</td></tr>
    <tr><td>Socket.IO client</td><td>MIT</td></tr>
    <tr><td>Ionicons (via @expo/vector-icons)</td><td>MIT</td></tr>
    <tr><td>Poppins typeface</td><td>SIL Open Font License 1.1</td></tr>
  </table>

  <h2>Backend</h2>
  <table>
    <tr><th>Project</th><th>License</th></tr>
    <tr><td>NestJS</td><td>MIT</td></tr>
    <tr><td>Fastify</td><td>MIT</td></tr>
    <tr><td>Prisma</td><td>Apache-2.0</td></tr>
    <tr><td>Supabase JS client</td><td>MIT</td></tr>
    <tr><td>Stripe Node SDK</td><td>MIT</td></tr>
    <tr><td>Socket.IO</td><td>MIT</td></tr>
  </table>

  <h2>Maps</h2>
  <p>Map views are powered by the <strong>Mapbox Maps SDK</strong>, used under the <a href="https://www.mapbox.com/legal/tos">Mapbox Terms of Service</a>. Map data © Mapbox and © OpenStreetMap contributors.</p>

  <div class="note">This list covers the principal components. The app and its services also rely on many smaller open-source packages, each governed by its own license (predominantly MIT).</div>

  <h2>Contact</h2>
  <p>Questions about licensing: <a href="mailto:support@getdraft.net">support@getdraft.net</a></p>

</main>

<footer>© 2026 GetDraft — All rights reserved.</footer>
</body>
</html>
`;
