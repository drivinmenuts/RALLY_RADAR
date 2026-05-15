// send-email.mjs
// Sends the digest as an email via Resend.

import fs from 'node:fs/promises';
import path from 'node:path';

const API_KEY  = process.env.RESEND_API_KEY;
const EMAIL_TO = process.env.EMAIL_TO;

if (!API_KEY) {
  console.log('RESEND_API_KEY not set — skipping email');
  process.exit(0);
}
if (!EMAIL_TO) {
  console.log('EMAIL_TO not set — skipping email');
  process.exit(0);
}

const digestPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'digest.txt');
const digest = await fs.readFile(digestPath, 'utf8').catch(() => null);
if (!digest) {
  console.warn('No digest.txt found — nothing to send');
  process.exit(0);
}

const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Resend wants HTML. Convert the plain-text digest with minimal formatting.
const htmlBody = digest
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\*([^\*]+)\*/g, '<strong>$1</strong>')          // *bold* → <strong>
  .replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')      // auto-link URLs
  .replace(/\n/g, '<br>');

const body = {
  from: 'Rally Radar <onboarding@resend.dev>',
  to: [EMAIL_TO],
  subject: `Rally Radar · ${today}`,
  html: `<div style="font-family:-apple-system,sans-serif;line-height:1.5;color:#222;max-width:640px;">${htmlBody}</div>`,
  text: digest
};

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  },
  body: JSON.stringify(body)
});

const result = await res.text();
console.log(`Resend HTTP ${res.status} — ${result.slice(0, 300)}`);

if (!res.ok) process.exit(1);
