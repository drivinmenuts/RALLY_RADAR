// send-whatsapp.mjs
// Sends the digest via CallMeBot's free WhatsApp endpoint.
// CallMeBot has a per-message URL length limit (~3500 chars); we chunk long digests.

import fs from 'node:fs/promises';

const PHONE = process.env.CALLMEBOT_PHONE;
const KEY = process.env.CALLMEBOT_KEY;

if (!PHONE) {
  console.log('CALLMEBOT_PHONE not set — skipping WhatsApp');
  process.exit(0);
}
if (!KEY) {
  console.log('CALLMEBOT_KEY not set — skipping WhatsApp');
  process.exit(0);
}

const digest = await fs.readFile('scraper/digest.txt', 'utf8').catch(() => null);
if (!digest) {
  console.warn('No digest.txt — nothing to send');
  process.exit(0);
}

// Chunk on event boundaries — split on double-newline (between events)
function chunk(text, maxLen = 1500) {
  const parts = [];
  const blocks = text.split(/\n\n+/);
  let cur = '';
  for (const b of blocks) {
    const candidate = cur ? cur + '\n\n' + b : b;
    if (candidate.length > maxLen && cur) {
      parts.push(cur);
      cur = b;
    } else {
      cur = candidate;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

const chunks = chunk(digest);
let ok = true;
for (let i = 0; i < chunks.length; i++) {
  const prefix = chunks.length > 1 ? `(${i+1}/${chunks.length})\n` : '';
  const msg = prefix + chunks[i];
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(PHONE)}&apikey=${encodeURIComponent(KEY)}&text=${encodeURIComponent(msg)}`;
  try {
    const res = await fetch(url);
    const txt = await res.text();
    console.log(`CallMeBot ${i+1}/${chunks.length} HTTP ${res.status} — ${txt.slice(0,180)}`);
    if (!res.ok) ok = false;
    // CallMeBot wants a small pause between messages
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 4000));
  } catch (e) {
    console.error('CallMeBot send error:', e.message);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
