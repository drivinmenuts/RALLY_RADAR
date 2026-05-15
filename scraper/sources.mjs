// sources.mjs
// Per-source scrapers. Each returns an array of normalised events:
// { source, title, date (YYYY-MM-DD), location, postcode?, url, organiser?, lat?, lon? }
//
// Defensive: any source that fails logs and returns []. The pipeline keeps going.

import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (compatible; RallyRadarBot/1.0; +https://github.com/Drivinmenuts/RALLY_RADAR)';

// ---------- Helpers ----------

const MONTHS = {
  jan:1, january:1, feb:2, february:2, mar:3, march:3, apr:4, april:4,
  may:5, jun:6, june:6, jul:7, july:7, aug:8, august:8,
  sep:9, sept:9, september:9, oct:10, october:10, nov:11, november:11, dec:12, december:12
};

function parseUkDate(s) {
  // Returns YYYY-MM-DD or null. Handles "18 May 2026", "18th May", "Sun 18 May 2026", "18/05/2026", "2026-05-18"
  if (!s) return null;
  s = s.replace(/\s+/g, ' ').trim();

  // ISO
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY  (only if no month-name appears later — otherwise we'd grab "22-24 May" as 22nd day, 24th month)
  m = s.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m && parseInt(m[2]) >= 1 && parseInt(m[2]) <= 12) {
    const hasMonthName = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(s);
    if (!hasMonthName) {
      let y = m[3] ? parseInt(m[3]) : new Date().getFullYear();
      if (y < 100) y += 2000;
      return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
  }

  // 18 May 2026 / 18th May / Sun 18 May 2026
  const months = Object.keys(MONTHS).join('|');
  const re = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})(?:\\s+(\\d{2,4}))?`, 'i');
  m = s.match(re);
  if (m) {
    // Check for a range like "22-24 May" or "Fri 22 - Sun 24 May" — if so, use the earlier day
    const rangeRe = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*[\\-\\u2013\\u2014to]+\\s*(?:\\w{3,9}\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(${months})`, 'i');
    const rangeMatch = s.match(rangeRe);
    const day = rangeMatch ? parseInt(rangeMatch[1]) : parseInt(m[1]);
    const mon = MONTHS[(rangeMatch ? rangeMatch[2] : m[2]).toLowerCase()];
    let year = m[3] ? parseInt(m[3]) : null;
    if (year && year < 100) year += 2000;
    if (!year) {
      // Use current year, roll forward if more than 30 days in the past
      const now = new Date();
      year = now.getFullYear();
      const candidate = new Date(year, mon-1, day);
      if (candidate.getTime() < now.getTime() - 30*86400000) year++;
    }
    return `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  return null;
}

function extractPostcode(text) {
  if (!text) return null;
  const m = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  return m ? m[1].toUpperCase().replace(/\s+/g, ' ').replace(/^(.+)(\d[A-Z]{2})$/, (_, a, b) => a.trim() + ' ' + b) : null;
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
    ...opts
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return await res.text();
}

function safe(fn, name) {
  return fn().catch(err => {
    console.warn(`[${name}] failed: ${err.message}`);
    return [];
  });
}

// ============================================================================
// SOURCE 1: ukdetectorist.co.uk events page
// ============================================================================
async function scrapeUkDetectorist() {
  const html = await fetchText('https://www.ukdetectorist.co.uk/metal-detecting-events');
  const $ = cheerio.load(html);
  const out = [];

  // Site is a flat events page. Each event commonly inside a card / list item.
  // We use a permissive heuristic: any element with both a date-looking string and a link.
  $('article, .event, li, .et_pb_blurb_content, div').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length < 20 || text.length > 1200) return;

    const date = parseUkDate(text);
    if (!date) return;

    const link = $el.find('a').first();
    const url = link.attr('href');
    if (!url) return;

    const title = link.text().trim() || text.split(/[.•|]/)[0].trim().slice(0, 100);
    if (title.length < 5) return;

    const postcode = extractPostcode(text);
    const location = text.match(/(?:at|in|near)\s+([A-Z][a-zA-Z\s,]+?)(?:\s*[.,]|$)/)?.[1]?.trim() || null;

    out.push({
      source: 'ukdetectorist',
      title: title.slice(0, 120),
      date,
      location: location || postcode || '',
      postcode,
      url: url.startsWith('http') ? url : `https://www.ukdetectorist.co.uk${url}`,
      organiser: null
    });
  });

  // Dedupe within this source
  const seen = new Set();
  return out.filter(e => {
    const k = e.date + e.title.slice(0,40);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ============================================================================
// SOURCE 2: bookitzone.com - metal-detecting-rallies-events
// ============================================================================
async function scrapeBookitzone() {
  const html = await fetchText('https://bookitzone.com/uk-metal-detecting-rallies-events/any_time');
  const $ = cheerio.load(html);
  const out = [];

  // BookitZone uses event cards. Each card typically has the event title, date, location, and a link.
  $('.event-card, .event-listing, article, .listing-item, li.event, [class*="event"]').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length < 30) return;

    const date = parseUkDate(text);
    if (!date) return;

    const link = $el.find('a[href*="bookitzone.com"]').first();
    const url = link.attr('href');

    const title = ($el.find('h2,h3,h4,.title').first().text().trim()) || link.text().trim() || text.split(/[.•|]/)[0];
    if (!title || title.length < 5) return;

    const postcode = extractPostcode(text);
    const location = text.match(/(?:at|in|near|venue)[:\s]+([A-Z][\w\s,]+?)(?:[.,]|\sf|$)/i)?.[1]?.trim() || null;

    out.push({
      source: 'bookitzone',
      title: title.slice(0, 120),
      date,
      location: location || postcode || '',
      postcode,
      url: url ? (url.startsWith('http') ? url : `https://bookitzone.com${url}`) : null,
      organiser: null
    });
  });

  const seen = new Set();
  return out.filter(e => {
    const k = e.date + e.title.slice(0,40);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ============================================================================
// SOURCE 3: paulcee.co.uk/detecting-rallies.php
// ============================================================================
async function scrapePaulCee() {
  const html = await fetchText('http://www.paulcee.co.uk/detecting-rallies.php');
  const $ = cheerio.load(html);
  const out = [];

  // paulcee.co.uk uses tables (old-school HTML). Walk every table row.
  $('tr, p, div').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length < 15 || text.length > 800) return;

    const date = parseUkDate(text);
    if (!date) return;

    const link = $el.find('a').first();
    const url = link.attr('href');

    const cells = $el.find('td').map((i, td) => $(td).text().trim()).get();
    const title = cells[1] || link.text().trim() || text.split(/[.•|]/)[0];
    if (!title || title.length < 4) return;

    const postcode = extractPostcode(text);

    out.push({
      source: 'paulcee',
      title: title.slice(0, 120),
      date,
      location: cells[2] || '',
      postcode,
      url: url ? (url.startsWith('http') ? url : `http://www.paulcee.co.uk/${url}`) : null,
      organiser: cells[3] || null
    });
  });

  const seen = new Set();
  return out.filter(e => {
    const k = e.date + e.title.slice(0,40);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ============================================================================
// SOURCE 4: ukhfevent.co.uk - UK History Finders
// ============================================================================
async function scrapeUkhf() {
  // Try the 2026 events index first, fall back to 2025/26 root
  const urls = [
    'https://ukhfevent.co.uk/2026-events-c-13/',
    'https://ukhfevent.co.uk/2025-events-c-12/',
    'https://ukhfevent.co.uk/'
  ];
  const out = [];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const $ = cheerio.load(html);
      $('.productholder, .product, li.event, article, [class*="product"]').each((_, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, ' ').trim();
        const date = parseUkDate(text);
        if (!date) return;

        const link = $el.find('a').first();
        const href = link.attr('href');
        const title = ($el.find('h2,h3,.productname,.title').first().text().trim()) || link.text().trim();
        if (!title || title.length < 5) return;

        const postcode = extractPostcode(text);

        out.push({
          source: 'ukhfevent',
          title: title.slice(0, 120),
          date,
          location: text.match(/(?:nr|near|at|in)\s+([A-Z][\w\s,]+?)(?:[.,]|$)/)?.[1]?.trim() || postcode || '',
          postcode,
          url: href ? (href.startsWith('http') ? href : `https://ukhfevent.co.uk${href.startsWith('/') ? '' : '/'}${href}`) : url,
          organiser: 'UK History Finders'
        });
      });
    } catch (e) {
      console.warn(`  UKHF ${url} failed: ${e.message}`);
    }
  }
  const seen = new Set();
  return out.filter(e => {
    const k = e.date + e.title.slice(0,40);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ============================================================================
// SOURCE 5: lothianrelics.com
// ============================================================================
async function scrapeLothian() {
  const urls = [
    'https://www.lothianrelics.com/events',
    'https://www.lothianrelics.com/'
  ];
  const out = [];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const $ = cheerio.load(html);
      $('a, article, li, div').each((_, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, ' ').trim();
        if (text.length < 20 || text.length > 800) return;
        const date = parseUkDate(text);
        if (!date) return;
        const link = $el.is('a') ? $el : $el.find('a').first();
        const href = link.attr('href');
        const title = link.text().trim() || text.split(/[.•|]/)[0];
        if (!title || title.length < 5) return;

        const postcode = extractPostcode(text);
        out.push({
          source: 'lothianrelics',
          title: title.slice(0, 120),
          date,
          location: postcode || '',
          postcode,
          url: href ? (href.startsWith('http') ? href : `https://www.lothianrelics.com${href}`) : url,
          organiser: 'Lothian Relics'
        });
      });
    } catch (e) {
      console.warn(`  Lothian ${url} failed: ${e.message}`);
    }
  }
  const seen = new Set();
  return out.filter(e => {
    const k = e.date + e.title.slice(0,40);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ============================================================================
// SOURCE 6: rodneycookmemorial.co.uk
// ============================================================================
async function scrapeRodneyCook() {
  const url = 'https://rodneycookmemorial.co.uk/';
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const out = [];
  // Single annual event — pull main heading + first date mention
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const date = parseUkDate(bodyText);
  if (date) {
    const title = $('h1').first().text().trim() || 'Rodney Cook Memorial Rally';
    out.push({
      source: 'rodneycook',
      title: title.slice(0, 120),
      date,
      location: extractPostcode(bodyText) || '',
      postcode: extractPostcode(bodyText),
      url,
      organiser: 'Rodney Cook Memorial'
    });
  }
  return out;
}

// ============================================================================
// SOURCE 7: detectival.com
// ============================================================================
async function scrapeDetectival() {
  const url = 'https://www.detectival.com/';
  try {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const date = parseUkDate(bodyText);
    if (!date) return [];
    return [{
      source: 'detectival',
      title: $('h1').first().text().trim() || 'Detectival',
      date,
      location: extractPostcode(bodyText) || 'Detectival site',
      postcode: extractPostcode(bodyText),
      url,
      organiser: 'Detectival'
    }];
  } catch (e) {
    console.warn(`  Detectival failed: ${e.message}`);
    return [];
  }
}

// ============================================================================
// FACEBOOK SOURCES (Playwright headless)
// ============================================================================
async function scrapeFacebookPages() {
  const pages = [
    { source: 'findafield',    url: 'https://www.facebook.com/groups/findafield' },
    { source: 'joanallen',     url: 'https://www.facebook.com/JoanAllenDetectors' },
    { source: 'noblepursuits', url: 'https://www.facebook.com/npmetaldetecting' }
  ];

  let browser;
  const out = [];
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 1024 } });

    // Apply cookie if provided
    if (process.env.FB_COOKIE) {
      try {
        const cookies = JSON.parse(process.env.FB_COOKIE);
        await ctx.addCookies(cookies);
      } catch (e) {
        console.warn('  FB_COOKIE present but not valid JSON; continuing unauthenticated.');
      }
    }

    for (const p of pages) {
      try {
        const page = await ctx.newPage();
        await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Wait a bit for posts to lazy-load
        await page.waitForTimeout(4000);
        // Scroll a couple of times to load more posts
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 1500));
          await page.waitForTimeout(1500);
        }

        const text = await page.evaluate(() => document.body.innerText);
        await page.close();

        // Find candidate event posts (lines with a date AND a postcode or "dig"/"rally"/"detecting")
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const date = parseUkDate(line);
          if (!date) continue;
          if (!/dig|rally|detecting|hunt|search/i.test(line) &&
              !/dig|rally|detecting|hunt|search/i.test(lines[i+1] || '') &&
              !/dig|rally|detecting|hunt|search/i.test(lines[i-1] || '')) continue;

          const ctx = [lines[i-1], line, lines[i+1], lines[i+2]].filter(Boolean).join(' ');
          const postcode = extractPostcode(ctx);
          const title = line.slice(0, 100);

          out.push({
            source: p.source,
            title,
            date,
            location: postcode || '',
            postcode,
            url: p.url,
            organiser: p.source === 'findafield' ? 'Find a Field' : p.source === 'joanallen' ? 'Joan Allen' : 'Noble Pursuits'
          });
        }
      } catch (e) {
        console.warn(`  FB ${p.source} failed: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`  Playwright init failed: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }

  // Dedupe heavily — FB pages repeat themselves
  const seen = new Set();
  return out.filter(e => {
    const k = e.source + e.date + e.title.slice(0,30);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ============================================================================
// Public entry point
// ============================================================================

export async function scrapeAll(opts = {}) {
  console.log('Running all source scrapers in parallel…');
  const results = await Promise.all([
    safe(scrapeUkDetectorist, 'ukdetectorist'),
    safe(scrapeBookitzone,    'bookitzone'),
    safe(scrapePaulCee,       'paulcee'),
    safe(scrapeUkhf,          'ukhfevent'),
    safe(scrapeLothian,       'lothianrelics'),
    safe(scrapeRodneyCook,    'rodneycook'),
    safe(scrapeDetectival,    'detectival'),
    safe(scrapeFacebookPages, 'facebook')
  ]);

  const flat = results.flat();
  // Per-source counts for logging
  const counts = {};
  for (const e of flat) counts[e.source] = (counts[e.source] || 0) + 1;
  for (const [src, n] of Object.entries(counts)) console.log(`  ${src}: ${n}`);
  return flat;
}
