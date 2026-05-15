// scraper.mjs
// Detecting Rally Radar — daily sweep orchestrator
// Runs each source, geocodes locations, dedupes, writes events.json

import fs from 'node:fs/promises';
import path from 'node:path';
import { scrapeAll } from './sources.mjs';

const HOME = { lat: 52.5489, lon: 0.0875, postcode: 'PE15 9HD' };
const WINDOW_DAYS = 14;
const MAX_MILES = 200;
const CACHE_FILE = path.resolve('scraper/cache.json');
const OUT_FILE   = path.resolve('events.json');

// ---------- Cache (geocoding + page hashes) ----------

async function loadCache() {
  try { return JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')); }
  catch { return { geo: {}, pages: {} }; }
}
async function saveCache(cache) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ---------- Geocoding ----------

async function geocodePostcode(pc, cache) {
  const key = 'pc:' + pc.toUpperCase().replace(/\s+/g, '');
  if (cache.geo[key]) return cache.geo[key];
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 200) return null;
    const result = { lat: data.result.latitude, lon: data.result.longitude };
    cache.geo[key] = result;
    return result;
  } catch { return null; }
}

async function geocodePlace(name, cache) {
  if (!name) return null;
  const key = 'p:' + name.toLowerCase().replace(/\s+/g, '_');
  if (cache.geo[key]) return cache.geo[key];

  // Polite Nominatim use: 1 req/sec, descriptive UA, countrycodes=gb
  await new Promise(r => setTimeout(r, 1100));
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name + ', UK')}&countrycodes=gb&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RallyRadar/1.0 (paul@detectinginsights)' }
    });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!arr.length) return null;
    const result = { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
    cache.geo[key] = result;
    return result;
  } catch { return null; }
}

// ---------- Distance ----------

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// ---------- Dedup ----------

function dedupe(events) {
  const out = [];
  const seen = new Map();
  for (const e of events) {
    if (!e.date || !e.title) continue;
    const norm = e.title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
    const key = e.date + ':' + norm;
    if (seen.has(key)) {
      // Merge — prefer entry with a URL
      const existing = seen.get(key);
      if (!existing.url && e.url) existing.url = e.url;
      if (!existing.location && e.location) existing.location = e.location;
      continue;
    }
    seen.set(key, e);
    out.push(e);
  }
  return out;
}

// ---------- Filter window ----------

function inWindow(e) {
  const d = new Date(e.date + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const end = new Date(today); end.setDate(end.getDate() + WINDOW_DAYS);
  return d >= today && d <= end;
}

// ---------- Main ----------

async function main() {
  console.log(`[${new Date().toISOString()}] Rally Radar sweep starting`);

  const cache = await loadCache();
  const raw = await scrapeAll({ cache });

  console.log(`Got ${raw.length} raw events across all sources`);

  // Geocode
  const geocoded = [];
  for (const e of raw) {
    if (e.lat && e.lon) { geocoded.push(e); continue; }
    let geo = null;
    if (e.postcode) geo = await geocodePostcode(e.postcode, cache);
    if (!geo && e.location) geo = await geocodePlace(e.location, cache);
    if (geo) { e.lat = geo.lat; e.lon = geo.lon; geocoded.push(e); }
    else {
      console.warn(`  No geocode for: ${e.title} @ ${e.location || e.postcode || '???'}`);
      // Keep without coords but distance will be omitted
      geocoded.push(e);
    }
  }

  // Distance + filter
  const enriched = geocoded.map(e => ({
    ...e,
    distance: (e.lat && e.lon) ? haversine(HOME.lat, HOME.lon, e.lat, e.lon) : null
  }));

  const inRange = enriched.filter(e => e.distance !== null && e.distance <= MAX_MILES);
  const inDateWindow = inRange.filter(inWindow);
  const final = dedupe(inDateWindow).sort((a,b) => a.date.localeCompare(b.date));

  console.log(`After geocode+dedupe: ${final.length} events in ${MAX_MILES}mi / ${WINDOW_DAYS}d window`);

  // Write events.json (the file the HTML viewer reads)
  const out = {
    generated: new Date().toISOString(),
    home: HOME,
    window_days: WINDOW_DAYS,
    max_miles: MAX_MILES,
    sources_run: [...new Set(raw.map(r => r.source))],
    total_raw: raw.length,
    total_in_range: final.length,
    events: final
  };
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2));
  await saveCache(cache);

  // Also write a digest.md for the email/whatsapp senders to read
  const digest = buildDigest(out);
  await fs.writeFile(path.resolve('scraper/digest.txt'), digest);

  console.log('Done.');
}

function buildDigest(out) {
  const lines = [];
  lines.push(`*Rally Radar* — ${new Date(out.generated).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}`);
  lines.push(`PE15 9HD · ${out.window_days}-day window · ${out.max_miles} mi radius`);
  lines.push('');

  if (out.events.length === 0) {
    lines.push('No rallies in range today. Sweep completed cleanly across ' + out.sources_run.length + ' sources.');
    return lines.join('\n');
  }

  lines.push(`*${out.events.length} event${out.events.length === 1 ? '' : 's'} in range:*`);
  lines.push('');
  for (const e of out.events) {
    const d = new Date(e.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
    lines.push(`• ${d} — ${e.title}`);
    lines.push(`   ${e.location || '—'} · ${e.distance} mi · ${e.source}`);
    if (e.url) lines.push(`   ${e.url}`);
    lines.push('');
  }
  return lines.join('\n');
}

main().catch(err => {
  console.error('FATAL', err);
  process.exit(1);
});
