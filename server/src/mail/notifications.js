// Notification service. Builds a message from a (stub) template and
// hands it to the mailer. Templates are intentionally minimal for the
// infrastructure phase — the structure is stable; polished HTML/i18n
// templates get plugged in later (spec §"תבניות מייל ... בהמשך").
import config from '../config.js';
import { sendMail } from './index.js';

const brand = () => config.mail.brand;
const clientLink = (publicId) => `${config.publicBaseUrl}/d/${publicId}`;

export function verificationCode({ to, code, title }) {
  return sendMail({
    to,
    subject: `${brand()} — your verification code`,
    text: `Your verification code for "${title || 'a file delivery'}" is: ${code}\n` +
          `It expires in ${config.verify.codeTtlMin} minutes.`,
    meta: { kind: 'verification_code' },
  });
}

export function newDelivery({ to, publicId, title, message, senderName }) {
  return sendMail({
    to,
    subject: `${senderName || brand()} sent you files: ${title || ''}`.trim(),
    text: `${senderName || 'Someone'} sent you a file delivery via ${brand()}.\n` +
          (message ? `\nMessage: ${message}\n` : '') +
          `\nOpen it here: ${clientLink(publicId)}`,
    meta: { kind: 'new_delivery' },
  });
}

export function openedAlert({ to, title, recipientName }) {
  return sendMail({
    to,
    subject: `${brand()} — your delivery was opened`,
    text: `${recipientName || 'A recipient'} opened "${title || 'your delivery'}".`,
    meta: { kind: 'opened_alert' },
  });
}

export function downloadedAlert({ to, title, fileName, recipientName }) {
  return sendMail({
    to,
    subject: `${brand()} — a file was downloaded`,
    text: `${recipientName || 'A recipient'} downloaded ` +
          `${fileName ? `"${fileName}"` : 'a file'} from "${title || 'your delivery'}".`,
    meta: { kind: 'downloaded_alert' },
  });
}

export function allDownloadedAlert({ to, title, recipientName }) {
  return sendMail({
    to,
    subject: `${brand()} — all files downloaded`,
    text: `${recipientName || 'A recipient'} downloaded all files from "${title || 'your delivery'}".`,
    meta: { kind: 'all_downloaded_alert' },
  });
}

export function expiryReminder({ to, publicId, title, expiresAt }) {
  return sendMail({
    to,
    subject: `${brand()} — delivery expiring soon`,
    text: `"${title || 'Your delivery'}" expires at ${new Date(expiresAt).toISOString()}.\n` +
          `Link: ${clientLink(publicId)}`,
    meta: { kind: 'expiry_reminder' },
  });
}
