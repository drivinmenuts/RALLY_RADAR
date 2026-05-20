// scraper.mjs (v2)
// Daily sweep orchestrator with manual-geocode fallback

import fs from 'node:fs/promises';
import path from 'node:path';
import { scrapeAll } from './sources.mjs';
import { manualGeocode } from './manual-overrides.mjs';

const HOME = { lat: 52.5489, lon: 0.0875, postcode: 'PE15 9HD' };
const WINDOW_DAYS = 14;
const MAX_MILES = 500;

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CACHE_FILE = path.resolve(SCRIPT_DIR, 'cache.json');
const OUT_FILE   = path.resolve(SCRIPT_DIR, '..', 'events.json');
const DIGEST_FILE = path.resolve(SCRIPT_DIR, 'digest.txt');

async function loadCache() {
  try { return JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')); }
  catch { return { geo: {}, pages: {} }; }
}
async function saveCache(cache) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

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

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function dedupe(events) {
  const out = [];
  const seen = new Map();
  for (const e of events) {
    if (!e.date || !e.title) continue;
    const norm = e.title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
    const key = e.date + ':' + norm;
    if (seen.has(key)) {
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

function inWindow(e) {
  const d = new Date(e.date + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const end = new Date(today); end.setDate(end.getDate() + WINDOW_DAYS);
  return d >= today && d <= end;
}

async function main() {
  console.log(`[${new Date().toISOString()}] Rally Radar sweep starting (v2)`);

  const cache = await loadCache();
  const raw = await scrapeAll({ cache });

  console.log(`Got ${raw.length} raw events across all sources`);

  // Geocode in order: full postcode → place name → manual fallback (known venue / area / county)
  const geocoded = [];
  for (const e of raw) {
    if (e.lat && e.lon) { geocoded.push(e); continue; }

    let geo = null;
    let source = null;

    if (e.postcode) {
      geo = await geocodePostcode(e.postcode, cache);
      if (geo) source = 'postcodes_io';
    }
    if (!geo && e.location) {
      geo = await geocodePlace(e.location, cache);
      if (geo) source = 'nominatim';
    }
    if (!geo) {
      const manual = manualGeocode({ title: e.title, location: e.location, postcode: e.postcode });
      if (manual) {
        geo = { lat: manual.lat, lon: manual.lon };
        source = manual.source;
        if (manual.resolvedLocation && !e.location) e.location = manual.resolvedLocation;
      }
    }

    if (geo) {
      e.lat = geo.lat;
      e.lon = geo.lon;
      e.geocode_source = source;
      geocoded.push(e);
    } else {
      console.warn(`  No geocode: ${e.title.slice(0,60)} @ ${e.location || e.postcode || '???'}`);
    }
  }

  // Distance + window filter
  const enriched = geocoded.map(e => ({
    ...e,
    distance: (e.lat && e.lon) ? haversine(HOME.lat, HOME.lon, e.lat, e.lon) : null
  }));

  const inRange = enriched.filter(e => e.distance !== null && e.distance <= MAX_MILES);
  const inDateWindow = inRange.filter(inWindow);
  const final = dedupe(inDateWindow).sort((a,b) => a.date.localeCompare(b.date));

  console.log(`Final: ${final.length} events in ${MAX_MILES}mi / ${WINDOW_DAYS}d window`);

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

  const digest = buildDigest(out);
  await fs.writeFile(DIGEST_FILE, digest);

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
