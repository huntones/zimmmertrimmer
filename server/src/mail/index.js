// Mailer facade. Driver is chosen by MAIL_DRIVER.
//   console  — captures messages in an in-memory outbox (for dev/tests);
//              logs ONLY the recipient + subject, never the body, so
//              verification codes never reach the logs.
//   provider — real send via Resend/SendGrid/Postmark/SMTP2GO/MailChannels
//              (mirrors worker/src/index.js sendEmail()).
import config from '../config.js';

const outbox = []; // console driver only

export function getOutbox() { return outbox; }
export function clearOutbox() { outbox.length = 0; }

async function consoleSend(msg) {
  outbox.push({ ...msg, at: Date.now() });
  // Redacted log line — subject + recipient only.
  console.log(`[mail:console] -> ${msg.to} : ${msg.subject}`);
  return { ok: true, id: `console-${outbox.length}` };
}

export async function sendMail(msg) {
  // msg: { to, subject, text, html?, meta? }
  if (!msg || !msg.to) return { ok: false, error: 'no_recipient' };
  if (config.mail.driver === 'provider') {
    const { providerSend } = await import('./provider.js');
    return providerSend(msg);
  }
  return consoleSend(msg);
}
