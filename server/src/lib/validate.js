// Upload validation. Never trusts the file extension alone: the file's
// magic bytes are sniffed and cross-checked, the name is sanitised, and
// a blocklist of executable/script types is enforced by BOTH extension
// and detected content.
import { fileTypeFromBuffer } from 'file-type';
import config from '../config.js';

// Executable / script types blocked by default (spec §"קבצים מסוכנים").
export const DANGEROUS_EXT = new Set([
  'exe','msi','bat','cmd','com','scr','dll','sys','drv',
  'vbs','vbe','js','jse','wsf','wsh','hta','ps1','psm1','psc1',
  'php','phtml','php3','php4','php5','phar',
  'sh','bash','zsh','csh','ksh','run','bin',
  'jar','msc','cpl','lnk','reg','pif','gadget','application','msp',
]);

// Detected content types that indicate an executable/script regardless
// of the file's name.
const DANGEROUS_MIME = new Set([
  'application/x-msdownload','application/x-dosexec','application/x-msi',
  'application/vnd.microsoft.portable-executable','application/x-executable',
  'application/x-elf','application/x-mach-binary','application/x-sharedlib',
  'application/x-sh','text/x-shellscript','application/x-bat',
]);

// Control characters 0x00-0x1F and 0x7F. Built via RegExp so this source
// file contains only printable ASCII.
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

export function extOf(name) {
  const m = /\.([A-Za-z0-9]{1,12})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

// Strip any path, control chars, and leading dots. Prevents directory
// traversal (no `/`, `\`, `..`) and keeps the name to a sane length.
export function sanitizeFilename(name) {
  let s = String(name || '').replace(/\\/g, '/');
  s = s.split('/').pop();               // drop any path component
  s = s.replace(CTRL, '');              // control chars
  s = s.replace(/^\.+/, '');            // no leading dots
  s = s.replace(/[<>:"|?*]/g, '_');     // reserved on Windows
  s = s.trim();
  if (s.length > 200) {
    const e = extOf(s);
    s = s.slice(0, 200 - (e ? e.length + 1 : 0)) + (e ? '.' + e : '');
  }
  return s;
}

export function isDangerousExtension(name) {
  return DANGEROUS_EXT.has(extOf(name));
}

// Sniff magic bytes from the file head. Returns { ext, mime } or null.
export async function sniffContent(headBuffer) {
  try { return (await fileTypeFromBuffer(headBuffer)) || null; }
  catch { return null; }
}

// Validate a completed/streaming upload's metadata + head bytes.
// Returns { ok:true, safeName, mime } or { ok:false, code, reason }.
export async function validateUpload({ filename, declaredMime, size, headBuffer }) {
  if (typeof size === 'number' && size > config.maxFileBytes) {
    return { ok: false, code: 'file_too_large', reason: `max ${config.maxFileBytes} bytes` };
  }
  const safeName = sanitizeFilename(filename);
  if (!safeName) return { ok: false, code: 'invalid_filename', reason: 'empty after sanitising' };

  if (isDangerousExtension(safeName)) {
    return { ok: false, code: 'blocked_type', reason: `.${extOf(safeName)} is not allowed` };
  }

  const sniffed = headBuffer && headBuffer.length ? await sniffContent(headBuffer) : null;
  if (sniffed) {
    if (DANGEROUS_MIME.has(sniffed.mime) || DANGEROUS_EXT.has(sniffed.ext)) {
      return { ok: false, code: 'blocked_content', reason: `detected ${sniffed.mime}` };
    }
  }

  const mime = (sniffed && sniffed.mime) || declaredMime || 'application/octet-stream';
  if (DANGEROUS_MIME.has(mime)) {
    return { ok: false, code: 'blocked_content', reason: `declared ${mime}` };
  }
  return { ok: true, safeName, mime };
}
