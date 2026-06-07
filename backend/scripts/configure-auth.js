const fs=require('fs'),path=require('path');
const env={};
fs.readFileSync(path.join(__dirname,'..','.env'),'utf8').split(/\r?\n/).forEach(l=>{const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);if(m)env[m[1]]=m[2].replace(/^["']|["']$/g,'').trim();});
const PAT=process.env.SUPABASE_PAT||process.argv[2];
const ref='jzzsnputbvzxssbraetl';
const body={
  smtp_host:env.SMTP_HOST, smtp_port:env.SMTP_PORT, smtp_user:env.SMTP_USER,
  smtp_pass:env.SMTP_PASS, smtp_admin_email:env.SMTP_USER, smtp_sender_name:'GetDraft',
  mailer_autoconfirm:false, external_email_enabled:true, mailer_otp_length:6,
  mailer_subjects_confirmation:'Your GetDraft code',
  mailer_templates_confirmation_content:'<h2>Welcome to GetDraft</h2><p>Your verification code:</p><h1 style="letter-spacing:4px;font-family:monospace">{{ .Token }}</h1><p>This code expires in 1 hour. If you did not request this, ignore this email.</p>'
};
(async()=>{
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`,{method:'PATCH',headers:{Authorization:`Bearer ${PAT}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json();
  console.log('status',r.status);
  console.log('autoconfirm=',j.mailer_autoconfirm,'otp_len=',j.mailer_otp_length,'smtp_host=',j.smtp_host);
  console.log('template_has_Token=',/\.Token/.test(j.mailer_templates_confirmation_content||''));
})().catch(e=>{console.error(e);process.exit(1);});
