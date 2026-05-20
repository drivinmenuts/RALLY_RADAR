// sources.mjs (v2)
// Per-source scrapers. Returns array of:
// { source, title, date (YYYY-MM-DD), location, postcode?, url, organiser?, lat?, lon? }
//
// Defensive: any source that fails logs and returns []. The pipeline keeps going.

import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { isJunkTitle } from './manual-overrides.mjs';

// Browser-style UA — UKHF and others reject the previous bot-flavoured one
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0'
};

// ---------- Helpers ----------

const MONTHS = {
  jan:1, january:1, feb:2, february:2, mar:3, march:3, apr:4, april:4,
  may:5, jun:6, june:6, jul:7, july:7, aug:8, august:8,
  sep:9, sept:9, september:9, oct:10, october:10, nov:11, november:11, dec:12, december:12
};

function parseUkDate(s) {
  if (!s) return null;
  s = s.replace(/\s+/g, ' ').trim();

  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m && parseInt(m[2]) >= 1 && parseInt(m[2]) <= 12) {
    const hasMonthName = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(s);
    if (!hasMonthName) {
      let y = m[3] ? parseInt(m[3]) : new Date().getFullYear();
      if (y < 100) y += 2000;
      return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    }
  }

  const months = Object.keys(MONTHS).join('|');
  const re = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})(?:\\s+(\\d{2,4}))?`, 'i');
  m = s.match(re);
  if (m) {
    const rangeRe = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*[\\-\\u2013\\u2014to]+\\s*(?:\\w{3,9}\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(${months})`, 'i');
    const rangeMatch = s.match(rangeRe);
    const day = rangeMatch ? parseInt(rangeMatch[1]) : parseInt(m[1]);
    const mon = MONTHS[(rangeMatch ? rangeMatch[2] : m[2]).toLowerCase()];
    let year = m[3] ? parseInt(m[3]) : null;
    if (year && year < 100) year += 2000;
    if (!year) {
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
  // Full postcode: AA9 9AA or A9 9AA etc.
  let m = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  if (m) return m[1].toUpperCase().replace(/\s+/g, ' ');
  // Outward only: BA4, NG24, LL19 etc. — useful for vague "BA4 area" listings
  m = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\b(?!\d)/);
  if (m && m[1].length <= 4) return m[1].toUpperCase();
  return null;
}

// Cleans noisy emoji/whitespace from a candidate title and trims to a reasonable length
function cleanTitle(s) {
  if (!s) return '';
  return s
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, ' ') // emoji
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 130);
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
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

// Common post-processing applied to every source's output
function clean(events) {
  return events
    .filter(e => e && e.date && e.title)
    .filter(e => !isJunkTitle(e.title))
    .map(e => ({ ...e, title: cleanTitle(e.title) }))
    .filter(e => e.title.length >= 8);
}

// ============================================================================
// SOURCE 1: ukdetectorist.co.uk events page
// ============================================================================
async function scrapeUkDetectorist() {
  const html = await fetchText('https://www.ukdetectorist.co.uk/metal-detecting-events');
  const $ = cheerio.load(html);
  const out = [];

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
    if (title.length < 8) return;
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

  return clean(dedupe(out));
}

// ============================================================================
// SOURCE 2: bookitzone.com
// ============================================================================
async function scrapeBookitzone() {
  const html = await fetchText('https://bookitzone.com/uk-metal-detecting-rallies-events/any_time');
  const $ = cheerio.load(html);
  const out = [];

  $('.event-card, .event-listing, article, .listing-item, li.event, [class*="event"]').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length < 30) return;
    const date = parseUkDate(text);
    if (!date) return;
    const link = $el.find('a[href*="bookitzone.com"]').first();
    const url = link.attr('href');
    const title = ($el.find('h2,h3,h4,.title').first().text().trim()) || link.text().trim() || text.split(/[.•|]/)[0];
    if (!title || title.length < 8) return;
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

  return clean(dedupe(out));
}

// ============================================================================
// SOURCE 3: paulcee.co.uk
// ============================================================================
async function scrapePaulCee() {
  const html = await fetchText('http://www.paulcee.co.uk/detecting-rallies.php');
  const $ = cheerio.load(html);
  const out = [];

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
    if (!title || title.length < 8) return;
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

  return clean(dedupe(out));
}

// ============================================================================
// SOURCE 4: ukhfevent.co.uk - now with proper browser headers + Playwright fallback
// ============================================================================
async function scrapeUkhf() {
  const urls = [
    'https://ukhfevent.co.uk/2026-events-c-13/',
    'https://ukhfevent.co.uk/2025-events-c-12/',
    'https://ukhfevent.co.uk/'
  ];
  const out = [];

  // Try plain HTTP first with new headers
  let succeeded = false;
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      succeeded = true;
      parseUkhfHtml(html, url, out);
    } catch (e) {
      console.warn(`  UKHF http ${url}: ${e.message}`);
    }
  }

  // If HTTP failed everywhere, fall back to Playwright (full real browser)
  if (!succeeded) {
    console.log('  UKHF: falling back to Playwright (full browser)');
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const ctx = await browser.newContext({ userAgent: UA });
      for (const url of urls) {
        try {
          const page = await ctx.newPage();
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);
          const html = await page.content();
          await page.close();
          parseUkhfHtml(html, url, out);
        } catch (e) {
          console.warn(`  UKHF playwright ${url}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`  UKHF playwright init: ${e.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  return clean(dedupe(out));
}

function parseUkhfHtml(html, sourceUrl, out) {
  const $ = cheerio.load(html);
  $('.productholder, .product, li.event, article, [class*="product"], .productListing').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const date = parseUkDate(text);
    if (!date) return;
    const link = $el.find('a').first();
    const href = link.attr('href');
    const title = ($el.find('h2,h3,.productname,.title').first().text().trim()) || link.text().trim();
    if (!title || title.length < 8) return;
    const postcode = extractPostcode(text);
    out.push({
      source: 'ukhfevent',
      title: title.slice(0, 120),
      date,
      location: text.match(/(?:nr|near|at|in)\s+([A-Z][\w\s,]+?)(?:[.,]|$)/)?.[1]?.trim() || postcode || '',
      postcode,
      url: href ? (href.startsWith('http') ? href : `https://ukhfevent.co.uk${href.startsWith('/') ? '' : '/'}${href}`) : sourceUrl,
      organiser: 'UK History Finders'
    });
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
        if (!title || title.length < 8) return;
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
      console.warn(`  Lothian ${url}: ${e.message}`);
    }
  }
  return clean(dedupe(out));
}

// ============================================================================
// SOURCE 6: rodneycookmemorial.co.uk
// ============================================================================
async function scrapeRodneyCook() {
  try {
    const url = 'https://rodneycookmemorial.co.uk/';
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const out = [];
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const date = parseUkDate(bodyText);
    if (date) {
      const title = $('h1').first().text().trim() || 'Rodney Cook Memorial Rally';
      if (!isJunkTitle(title)) {
        out.push({
          source: 'rodneycook',
          title: cleanTitle(title),
          date,
          location: extractPostcode(bodyText) || '',
          postcode: extractPostcode(bodyText),
          url,
          organiser: 'Rodney Cook Memorial'
        });
      }
    }
    return out;
  } catch (e) {
    console.warn(`  rodneycook: ${e.message}`);
    return [];
  }
}

// ============================================================================
// SOURCE 7: detectival.com
// ============================================================================
async function scrapeDetectival() {
  try {
    const url = 'https://www.detectival.com/';
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const date = parseUkDate(bodyText);
    if (!date) return [];
    const title = $('h1').first().text().trim() || 'Detectival';
    if (isJunkTitle(title)) return [];
    return [{
      source: 'detectival',
      title: cleanTitle(title),
      date,
      location: extractPostcode(bodyText) || 'Detectival site',
      postcode: extractPostcode(bodyText),
      url,
      organiser: 'Detectival'
    }];
  } catch (e) {
    console.warn(`  Detectival: ${e.message}`);
    return [];
  }
}

// ============================================================================
// SOURCE 8: crawfordsmd.com - rallies page (JavaScript-rendered, needs Playwright)
// ============================================================================
async function scrapeCrawfords() {
  const url = 'https://crawfordsmd.com/metal-detecting-rallies-events-2026';
  let browser;
  const out = [];

  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 1024 } });
    const page = await ctx.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForTimeout(3000);

    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(800);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);

    try {
      const allTab = await page.locator('text="All Events"').first();
      if (await allTab.isVisible({ timeout: 2000 })) await allTab.click();
      await page.waitForTimeout(1500);
    } catch { /* not critical */ }

    const html = await page.content();
    await page.close();

    const $ = cheerio.load(html);

    const candidates = $('.event, .rally, .event-card, [class*="event"], [class*="rally"], article, li, .card, .panel, [class*="card"]');

    candidates.each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (text.length < 20 || text.length > 1500) return;
      const date = parseUkDate(text);
      if (!date) return;
      const link = $el.find('a').first();
      const href = link.attr('href');
      const title = ($el.find('h1,h2,h3,h4,h5,strong,.title,.event-title').first().text().trim())
                 || link.text().trim()
                 || text.split(/[•|·\n]/)[0].trim().slice(0, 120);
      if (!title || title.length < 8) return;
      const postcode = extractPostcode(text);
      let location = '';
      const locMatch = text.match(/(?:location|venue)[:\s]+([A-Z][\w\s,]+?)(?:[.,]|\sf|$)/i)
                    || text.match(/(?:nr|near|at|in)\s+([A-Z][\w\s,]+?)(?:[.,]|$)/);
      if (locMatch) location = locMatch[1].trim();
      out.push({
        source: 'crawfords',
        title: title.slice(0, 120),
        date,
        location: location || postcode || '',
        postcode,
        url: href ? (href.startsWith('http') ? href : `https://crawfordsmd.com${href.startsWith('/') ? '' : '/'}${href}`) : url,
        organiser: null
      });
    });

    if (out.length === 0) {
      const text = $('body').text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 15 && l.length < 300);
      for (const line of lines) {
        const date = parseUkDate(line);
        if (!date) continue;
        if (!/dig|rally|detecting|hunt|search|memorial|weekender|championship/i.test(line)) continue;
        const postcode = extractPostcode(line);
        out.push({
          source: 'crawfords',
          title: line.slice(0, 120),
          date,
          location: postcode || '',
          postcode,
          url,
          organiser: null
        });
      }
    }
  } catch (e) {
    console.warn(`  Crawfords: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return clean(dedupe(out));
}

// ============================================================================
// SOURCE 9: swingbeepdigrepeat.com - calendar (JavaScript-rendered)
// ============================================================================
async function scrapeSwingBeep() {
  const months = getNextThreeMonthQueries(); // covers current + next 2 months
  let browser;
  const out = [];

  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 1024 } });

    for (const m of months) {
      const url = `https://www.swingbeepdigrepeat.com/uk-metal-detecting-dig-dates-days-rallies/?grid-list-toggle=list&month=${m.month}&yr=${m.year}`;
      try {
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3500);
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 1500));
          await page.waitForTimeout(800);
        }
        const html = await page.content();
        await page.close();

        const $ = cheerio.load(html);

        // The Modern Events Calendar plugin uses .mec-event-* classes. Try those plus generic fallbacks.
        const selector = '.mec-event-article, .mec-event-list-classic .mec-event-list-content, [class*="mec-event"], .event-list-item, article.event';
        $(selector).each((_, el) => {
          const $el = $(el);
          const text = $el.text().replace(/\s+/g, ' ').trim();
          if (text.length < 15 || text.length > 1500) return;
          const date = parseUkDate(text);
          if (!date) return;
          const link = $el.find('a').first();
          const href = link.attr('href');
          const title = ($el.find('.mec-event-title, h3, h4, .event-title, .entry-title').first().text().trim())
                     || link.text().trim()
                     || text.split(/[•|·\n]/)[0].trim();
          if (!title || title.length < 8) return;
          const postcode = extractPostcode(text);
          const locElement = $el.find('.mec-event-loc-place, .mec-event-address, .event-location').first().text().trim();
          out.push({
            source: 'swingbeep',
            title: title.slice(0, 120),
            date,
            location: locElement || postcode || '',
            postcode,
            url: href ? (href.startsWith('http') ? href : `https://www.swingbeepdigrepeat.com${href}`) : url,
            organiser: null
          });
        });
      } catch (e) {
        console.warn(`  SwingBeep ${m.month}/${m.year}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`  SwingBeep init: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return clean(dedupe(out));
}

function getNextThreeMonthQueries() {
  const monthAbbr = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const out = [];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({ month: monthAbbr[d.getMonth()], year: d.getFullYear() });
  }
  return out;
}

// ============================================================================
// SOURCE 10: eastofenglandrallies.co.uk - Norfolk specialist
// ============================================================================
async function scrapeEastOfEngland() {
  try {
    const url = 'https://eastofenglandrallies.co.uk/';
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const out = [];

    $('article, .event, li, div, section, p').each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (text.length < 20 || text.length > 1200) return;
      const date = parseUkDate(text);
      if (!date) return;
      const link = $el.find('a').first();
      const href = link.attr('href');
      const title = ($el.find('h1,h2,h3,h4,strong').first().text().trim())
                 || link.text().trim()
                 || text.split(/[•|·.\n]/)[0].trim();
      if (!title || title.length < 8) return;
      const postcode = extractPostcode(text);
      out.push({
        source: 'eastofengland',
        title: title.slice(0, 120),
        date,
        location: postcode || 'Norfolk',
        postcode,
        url: href ? (href.startsWith('http') ? href : `https://eastofenglandrallies.co.uk${href.startsWith('/') ? '' : '/'}${href}`) : url,
        organiser: 'East of England Rallies'
      });
    });

    return clean(dedupe(out));
  } catch (e) {
    console.warn(`  EastOfEngland: ${e.message}`);
    return [];
  }
}

// ============================================================================
// SOURCE 11: metaldetectingforum.co.uk - rallies forum board
// ============================================================================
async function scrapeMDForum() {
  try {
    const url = 'https://www.metaldetectingforum.co.uk/Rallies';
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const out = [];

    // Forum thread listings — typically have a title link and date
    $('.threadtitle, .topictitle, li.thread, .topic-row, tr.thread, .forum-thread, a').each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (text.length < 15 || text.length > 400) return;
      const date = parseUkDate(text);
      if (!date) return;
      // Forum threads must clearly look like rally announcements
      if (!/rally|dig|detecting|weekender|memorial|charity\s+day/i.test(text)) return;
      const link = $el.is('a') ? $el : $el.find('a').first();
      const href = link.attr('href');
      const title = link.text().trim() || text.split(/[•|·.\n]/)[0].trim();
      if (!title || title.length < 8) return;
      const postcode = extractPostcode(text);
      out.push({
        source: 'mdforum',
        title: title.slice(0, 120),
        date,
        location: postcode || '',
        postcode,
        url: href ? (href.startsWith('http') ? href : `https://www.metaldetectingforum.co.uk${href.startsWith('/') ? '' : '/'}${href}`) : url,
        organiser: null
      });
    });

    return clean(dedupe(out));
  } catch (e) {
    console.warn(`  MDForum: ${e.message}`);
    return [];
  }
}

// ============================================================================
// FACEBOOK SOURCES
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

    if (process.env.FB_COOKIE) {
      try { await ctx.addCookies(JSON.parse(process.env.FB_COOKIE)); }
      catch { console.warn('  FB_COOKIE present but invalid JSON; continuing unauthenticated.'); }
    }

    for (const p of pages) {
      try {
        const page = await ctx.newPage();
        await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 1500));
          await page.waitForTimeout(1500);
        }
        const text = await page.evaluate(() => document.body.innerText);
        await page.close();

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const date = parseUkDate(line);
          if (!date) continue;
          const around = [lines[i-1], line, lines[i+1], lines[i+2]].filter(Boolean).join(' ');
          if (!/dig|rally|detecting|hunt|search/i.test(around)) continue;
          const postcode = extractPostcode(around);
          const title = cleanTitle(line);
          if (isJunkTitle(title)) continue;

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
        console.warn(`  FB ${p.source}: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`  Playwright init: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return clean(dedupe(out));
}

// ---------- Per-source dedupe ----------
function dedupe(events) {
  const seen = new Set();
  return events.filter(e => {
    if (!e.date || !e.title) return false;
    const k = e.source + ':' + e.date + ':' + e.title.slice(0,40).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ============================================================================
// Public entry
// ============================================================================
export async function scrapeAll(opts = {}) {
  console.log('Running all source scrapers in parallel…');
  const results = await Promise.all([
    safe(scrapeUkDetectorist,  'ukdetectorist'),
    safe(scrapeBookitzone,     'bookitzone'),
    safe(scrapePaulCee,        'paulcee'),
    safe(scrapeUkhf,           'ukhfevent'),
    safe(scrapeLothian,        'lothianrelics'),
    safe(scrapeRodneyCook,     'rodneycook'),
    safe(scrapeDetectival,     'detectival'),
    safe(scrapeCrawfords,      'crawfords'),
    safe(scrapeSwingBeep,      'swingbeep'),
    safe(scrapeEastOfEngland,  'eastofengland'),
    safe(scrapeMDForum,        'mdforum'),
    safe(scrapeFacebookPages,  'facebook')
  ]);
  const flat = results.flat();
  const counts = {};
  for (const e of flat) counts[e.source] = (counts[e.source] || 0) + 1;
  for (const [src, n] of Object.entries(counts)) console.log(`  ${src}: ${n}`);
  return flat;
}
