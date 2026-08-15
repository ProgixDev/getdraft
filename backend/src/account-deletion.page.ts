// Served at GET /api/account-deletion.
//
// Google Play requires apps that let users create an account to publish a
// deletion route reachable from OUTSIDE the app -- a reviewer, or a former
// user who has already uninstalled, must be able to reach it from a browser.
// In-app deletion (Settings and Profile, both via useDeleteAccount) satisfies
// the other half of the requirement; this page satisfies the web half and is
// what goes in the Play Console "Data deletion" field.
//
// Styling mirrors privacy.page.ts so the three public pages read as one site.
export const ACCOUNT_DELETION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GetDraft — Delete Your Account</title>
<style>
  :root{--green:#0984E3;--green-d:#0a4d8f;--ink:#121A24;--muted:#5D6672;--line:#E3E7EA;--bg:#F8FAFB}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);line-height:1.65;background:#fff;font-size:16px}
  .hero{background:linear-gradient(135deg,#121212,#0D2C4D 65%,#0A4D8F 140%);color:#fff;padding:44px 22px 36px}
  .wrap{max-width:760px;margin:0 auto}
  .hero h1{font-size:30px;line-height:1.2;margin-bottom:8px}
  .hero p{opacity:.85;font-size:15px}
  main{padding:34px 22px 64px}
  h2{font-size:20px;margin:32px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
  p{margin-bottom:14px}
  ol,ul{margin:0 0 16px 22px}
  li{margin-bottom:8px}
  .card{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:18px 0}
  .card h3{font-size:16px;margin-bottom:8px}
  a{color:var(--green-d)}
  code{background:var(--bg);border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:14px}
  table{width:100%;border-collapse:collapse;margin:12px 0 18px;font-size:15px}
  th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--muted);font-weight:600;width:38%}
  footer{color:var(--muted);font-size:14px;border-top:1px solid var(--line);padding-top:18px;margin-top:34px}
</style>
</head>
<body>
<div class="hero"><div class="wrap">
  <h1>Delete your GetDraft account</h1>
  <p>How to remove your account and everything stored with it.</p>
</div></div>
<main><div class="wrap">

  <h2>Delete from inside the app</h2>
  <p>This is immediate and needs no request. In the GetDraft app:</p>
  <ol>
    <li>Open <strong>More &rarr; Settings</strong> (or your <strong>Profile</strong>).</li>
    <li>Tap <strong>Delete Account</strong>.</li>
    <li>Confirm twice. The second prompt is the point of no return.</li>
  </ol>
  <p>Your account and data are erased straight away. There is no waiting period and no recovery.</p>

  <h2>If you no longer have the app</h2>
  <p>Email <a href="mailto:support@getdraft.net">support@getdraft.net</a> from the address on
     your account, with the subject <code>Delete my account</code>. We verify ownership of the
     address, then delete the account within <strong>30 days</strong> and confirm by email.</p>
  <p>If you signed up with a phone number rather than an email, include that number so we can
     locate the account.</p>

  <h2>What is deleted</h2>
  <table>
    <tr><th>Deleted immediately</th><td>Profile and athlete details, photos and videos, posts and
      comments, Drafts and matches, messages, rankings entry, push tokens, saved items, and your
      login credentials.</td></tr>
    <tr><th>Kept briefly</th><td>Payment and invoice records, where tax and accounting law requires
      us to retain them. These are held by our payment processor and are not used to identify you
      in the app.</td></tr>
    <tr><th>Kept by the other person</th><td>Messages you sent remain visible to the person you
      sent them to, in the same way a sent SMS stays on the recipient's phone.</td></tr>
  </table>

  <div class="card">
    <h3>Under-18 accounts</h3>
    <p>A parent or guardian linked to a minor's account may request deletion on their behalf using
       the email route above. Say that you are the guardian and name the athlete's account.</p>
  </div>

  <h2>Deleting a subscription instead</h2>
  <p>To stop paying without losing your account, cancel your subscription in the app under
     <strong>More &rarr; Subscription</strong>. Deleting your account also ends any active
     subscription.</p>

  <footer>
    GetDraft &middot; <a href="/api/privacy">Privacy Policy</a> &middot;
    <a href="/api/terms">Terms of Service</a> &middot;
    <a href="mailto:support@getdraft.net">support@getdraft.net</a>
  </footer>
</div></main>
</body>
</html>`;
