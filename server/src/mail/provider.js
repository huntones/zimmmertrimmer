// Real email delivery. Mirrors the provider matrix already implemented
// in worker/src/index.js sendEmail(), so a domain verified there works
// here unchanged. Returns { ok, id?, error? }.
import config from '../config.js';

function parseFrom(from) {
  const m = /^(.*)<(.+)>$/.exec(from || '');
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() }
           : { name: config.mail.brand, email: (from || '').trim() };
}

export async function providerSend(msg) {
  const provider = config.mail.provider;
  const from = config.mail.from;
  const key = config.mail.apiKey;
  const { to, subject, text, html } = msg;

  try {
    if (provider === 'resend') {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'authorization': `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text, html }),
      });
      return r.ok ? { ok: true, id: (await r.json()).id } : { ok: false, error: `resend_${r.status}` };
    }
    if (provider === 'sendgrid') {
      const f = parseFrom(from);
      const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'authorization': `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: f, subject,
          content: [{ type: 'text/plain', value: text || '' }].concat(html ? [{ type: 'text/html', value: html }] : []),
        }),
      });
      return r.ok ? { ok: true } : { ok: false, error: `sendgrid_${r.status}` };
    }
    if (provider === 'postmark') {
      const r = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: { 'x-postmark-server-token': key, 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({ From: from, To: to, Subject: subject, TextBody: text, HtmlBody: html }),
      });
      return r.ok ? { ok: true } : { ok: false, error: `postmark_${r.status}` };
    }
    if (provider === 'smtp2go') {
      const f = parseFrom(from);
      const r = await fetch('https://api.smtp2go.com/v3/email/send', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: key, sender: f.email, to: [to], subject, text_body: text, html_body: html }),
      });
      return r.ok ? { ok: true } : { ok: false, error: `smtp2go_${r.status}` };
    }
    if (provider === 'mailchannels') {
      const f = parseFrom(from);
      const r = await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: f, subject,
          content: [{ type: 'text/plain', value: text || '' }].concat(html ? [{ type: 'text/html', value: html }] : []),
        }),
      });
      return r.ok ? { ok: true } : { ok: false, error: `mailchannels_${r.status}` };
    }
    return { ok: false, error: `unknown_provider_${provider}` };
  } catch (e) {
    return { ok: false, error: `send_failed:${e.message}` };
  }
}
