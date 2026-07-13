// Auto-generated from docs/PRIVACY_POLICY.html — the canonical copy.
// Served at GET /api/privacy so the policy has a public URL (Google Play
// requirement) without needing access to the getdraft.net website.
export const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GetDraft — Privacy Policy</title>
<style>
  :root{--green:#0984E3;--green-d:#0a4d8f;--ink:#121A24;--muted:#5D6672;--line:#E3E7EA;--bg:#F8FAFB}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);line-height:1.65;background:#fff;font-size:16px}
  .hero{background:linear-gradient(135deg,#121212,#0D2C4D 65%,#0A4D8F 140%);color:#fff;padding:44px 22px 36px}
  .wrap{max-width:820px;margin:0 auto;padding:0 22px}
  .hero .wrap{padding:0}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:18px;max-width:820px;margin-left:auto;margin-right:auto}
  .logo{width:30px;height:30px;border-radius:8px;background:var(--green);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:17px}
  .brand b{font-size:17px}.brand b span{color:var(--green)}
  .hero h1{font-size:30px;font-weight:800;max-width:820px;margin:0 auto}
  .hero p{color:#9CC7F0;margin-top:8px;max-width:820px;margin-left:auto;margin-right:auto;font-size:14px}
  main{max-width:820px;margin:0 auto;padding:34px 22px 60px}
  h2{font-size:20px;margin:34px 0 10px;color:var(--green-d)}
  h3{font-size:16px;margin:20px 0 6px}
  p,li{color:#2A3340;font-size:15px}
  ul{padding-left:22px;margin:8px 0}
  li{margin:5px 0}
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
  <h1>Privacy Policy</h1>
  <p>Last updated: July 11, 2026</p>
</div>

<main>
  <p><strong>GetDraft</strong> ("we", "us", "the app") is a sports recruiting platform that connects athletes, coaches, recruiters (agents), and parents. This policy explains what information we collect, why we collect it, and the choices you have. By using GetDraft you agree to this policy.</p>

  <h2>1. Information we collect</h2>
  <table>
    <tr><th>Category</th><th>Examples</th><th>Why</th></tr>
    <tr><td>Account details</td><td>Name, email address, phone number, date of birth, role (athlete, coach, recruiter, parent), password</td><td>Create and secure your account; verify your contact details with one-time codes</td></tr>
    <tr><td>Profile content</td><td>Sport, position, level, bio, height/weight, photos, highlight videos, posts and comments</td><td>Present your athletic profile to other users — this is the core purpose of the app</td></tr>
    <tr><td>Location</td><td>City/country you provide; precise location only if you grant permission</td><td>Show where you're based, power local discovery and the talent map</td></tr>
    <tr><td>Identity verification</td><td>Government ID and a face/liveness check, processed by our verification partner Didit</td><td>Keep the community safe by verifying adult users are who they say they are. <strong>We never store your ID document</strong> — we only keep the approval result.</td></tr>
    <tr><td>Payments</td><td>Subscription and purchase details, processed by Stripe</td><td>Provide paid plans. <strong>We never see or store your card number</strong> — payments are handled by Stripe.</td></tr>
    <tr><td>Messages</td><td>Chat messages you exchange after connecting with another user</td><td>Deliver the in-app messaging feature</td></tr>
    <tr><td>Usage &amp; device data</td><td>App interactions, device type, push notification token</td><td>Operate, secure, and improve the app; send notifications you've enabled</td></tr>
  </table>

  <h2>2. Children and minors</h2>
  <div class="note"><strong>GetDraft is designed to be safe for young athletes.</strong></div>
  <ul>
    <li>The minimum age to have a profile is <strong>6 years old</strong>.</li>
    <li>Every user <strong>under 18</strong> must be linked to and approved by a <strong>parent or legal guardian</strong> before their account is activated. The guardian confirms their identity and consent through a dedicated verification flow (including a recorded declaration), and our team reviews each link.</li>
    <li>For children under 13, this guardian flow serves as the <strong>verifiable parental consent</strong> required by the U.S. Children's Online Privacy Protection Act (COPPA).</li>
    <li>Minors are <strong>not</strong> asked for government ID. Identity verification applies to adults (guardians, coaches, recruiters).</li>
    <li>We collect from minors only what is needed to operate the athletic profile, and parents/guardians may review the child's information or request its deletion at any time (see "Your rights" below).</li>
  </ul>

  <h2>3. How we share information</h2>
  <p>We <strong>do not sell</strong> your personal information. We share it only with:</p>
  <ul>
    <li><strong>Other users</strong> — your profile (name, photos, sport details, general location) is visible to other GetDraft users; that is the purpose of the platform. Chat opens only after both sides connect ("Draft").</li>
    <li><strong>Service providers</strong> that run the app for us:
      <ul>
        <li>Supabase (database, authentication &amp; storage)</li>
        <li>Railway (application hosting)</li>
        <li>Stripe (payments)</li>
        <li>Twilio (SMS verification codes)</li>
        <li>Resend (email delivery)</li>
        <li>Didit (identity verification)</li>
        <li>Expo (app builds and push notifications)</li>
      </ul>
    </li>
    <li><strong>Authorities</strong>, if required by law or to protect the safety of our users.</li>
  </ul>

  <h2>4. Data retention</h2>
  <p>We keep your information while your account is active. If you delete your account, we delete or anonymize your personal information within a reasonable period, except where we must keep limited records to comply with law (e.g., payment records) or resolve disputes.</p>

  <h2>5. Security</h2>
  <p>All traffic is encrypted in transit (HTTPS). Access to production data is restricted, webhooks are signature-verified, and identity documents are handled exclusively by our verification partner and never stored on our servers.</p>

  <h2>6. Your rights</h2>
  <ul>
    <li><strong>Access &amp; correction</strong> — view and edit your profile at any time in the app.</li>
    <li><strong>Deletion</strong> — delete your account in the app settings, or contact us and we will delete it for you.</li>
    <li><strong>Parents/guardians</strong> — review or request deletion of your child's information at any time.</li>
    <li><strong>Marketing</strong> — we only send service messages (verification codes, activity notifications you've enabled).</li>
  </ul>
  <p>Depending on where you live (e.g., Québec/Canada — Law 25, EU/EEA — GDPR, California — CCPA), you may have additional rights such as data portability and the right to lodge a complaint with your local authority.</p>

  <h2>7. Changes to this policy</h2>
  <p>If we make material changes, we will notify you in the app before the change takes effect.</p>

  <h2>8. Contact us</h2>
  <p>Questions, requests, or privacy concerns:<br>
  <strong>Email:</strong> <a href="mailto:support@getdraft.net">support@getdraft.net</a></p>

</main>

<footer>© 2026 GetDraft — All rights reserved.</footer>
</body>
</html>
`;
