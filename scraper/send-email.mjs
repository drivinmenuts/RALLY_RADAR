// send-email.mjs
// Sends the digest as an email via Web3Forms.

import fs from 'node:fs/promises';

const WEB3FORMS_KEY = process.env.WEB3FORMS_KEY;
const EMAIL_TO = process.env.EMAIL_TO;

if (!WEB3FORMS_KEY) {
  console.log('WEB3FORMS_KEY not set — skipping email');
  process.exit(0);
}
if (!EMAIL_TO) {
  console.log('EMAIL_TO not set — skipping email');
  process.exit(0);
}

const digest = await fs.readFile('scraper/digest.txt', 'utf8').catch(() => null);
if (!digest) {
  console.warn('No digest.txt found — nothing to send');
  process.exit(0);
}

const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Web3Forms expects multipart/form-data or JSON. JSON is simpler.
const body = {
  access_key: WEB3FORMS_KEY,
  subject: `Rally Radar · ${today}`,
  from_name: 'Rally Radar',
  email: EMAIL_TO,           // some Web3Forms setups require this echo back
  to: EMAIL_TO,
  message: digest
};

const res = await fetch('https://api.web3forms.com/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify(body)
});

const result = await res.text();
console.log(`Web3Forms HTTP ${res.status} — ${result.slice(0, 200)}`);

if (!res.ok) process.exit(1);
