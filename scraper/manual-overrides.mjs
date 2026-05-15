// manual-overrides.mjs
// Two responsibilities:
//   1. Known-bad title fragments — when a parser dredges these up, the row is junk, drop it.
//   2. Known annual / recurring rallies — provide manual geocodes for venues the geocoder fails on.
//
// Whenever you find a new rally venue the scraper can't auto-geocode, add it to KNOWN_VENUES below.

export const JUNK_TITLE_FRAGMENTS = [
  'book tickets',
  'more info',
  'online entries',
  'closing soon',
  'tickets coming soon',
  'sold out',
  'dates announced',
  'add to basket',
  'view event',
  'read more',
  'click here',
  'find out more',
  'register interest',
  '📅',
  '📍',
  '🌱',
  '🏆',
  '⭐',
  '✨',
  '👉'
];

// County centroids for vague locations like "Somerset" or "BA4 area, Somerset"
export const COUNTY_CENTROIDS = {
  'somerset':         { lat: 51.139, lon: -2.972 },
  'cambridgeshire':   { lat: 52.205, lon: 0.121 },
  'norfolk':          { lat: 52.674, lon: 0.943 },
  'suffolk':          { lat: 52.184, lon: 0.971 },
  'lincolnshire':     { lat: 53.013, lon: -0.247 },
  'essex':            { lat: 51.737, lon: 0.479 },
  'kent':             { lat: 51.276, lon: 0.521 },
  'leicestershire':   { lat: 52.638, lon: -1.139 },
  'nottinghamshire':  { lat: 53.140, lon: -1.197 },
  'derbyshire':       { lat: 53.106, lon: -1.567 },
  'northamptonshire': { lat: 52.270, lon: -0.886 },
  'oxfordshire':      { lat: 51.752, lon: -1.258 },
  'buckinghamshire':  { lat: 51.815, lon: -0.812 },
  'hertfordshire':    { lat: 51.808, lon: -0.236 },
  'bedfordshire':     { lat: 52.045, lon: -0.476 },
  'yorkshire':        { lat: 54.000, lon: -1.500 },
  'staffordshire':    { lat: 52.876, lon: -2.057 },
  'warwickshire':     { lat: 52.281, lon: -1.585 },
  'worcestershire':   { lat: 52.193, lon: -2.221 },
  'shropshire':       { lat: 52.706, lon: -2.752 },
  'cheshire':         { lat: 53.181, lon: -2.604 },
  'lancashire':       { lat: 53.806, lon: -2.605 },
  'cumbria':          { lat: 54.580, lon: -2.766 },
  'durham':           { lat: 54.778, lon: -1.575 },
  'northumberland':   { lat: 55.207, lon: -2.078 },
  'wiltshire':        { lat: 51.349, lon: -1.992 },
  'dorset':           { lat: 50.748, lon: -2.348 },
  'devon':            { lat: 50.715, lon: -3.531 },
  'cornwall':         { lat: 50.266, lon: -5.054 },
  'gloucestershire':  { lat: 51.864, lon: -2.244 },
  'hampshire':        { lat: 51.057, lon: -1.309 },
  'sussex':           { lat: 50.928, lon: -0.422 },
  'surrey':           { lat: 51.236, lon: -0.570 },
  'denbighshire':     { lat: 53.182, lon: -3.422 },
  'flintshire':       { lat: 53.166, lon: -3.142 },
  'powys':            { lat: 52.515, lon: -3.319 },
  'gwynedd':          { lat: 52.928, lon: -4.108 }
};

// UK postcode area centroids — first letter group of the outward code
export const POSTCODE_AREAS = {
  'AB': { lat: 57.149, lon: -2.094 }, // Aberdeen
  'AL': { lat: 51.752, lon: -0.336 }, // St Albans
  'B':  { lat: 52.483, lon: -1.893 }, // Birmingham
  'BA': { lat: 51.380, lon: -2.359 }, // Bath
  'BB': { lat: 53.745, lon: -2.480 }, // Blackburn
  'BD': { lat: 53.795, lon: -1.759 }, // Bradford
  'BH': { lat: 50.728, lon: -1.875 }, // Bournemouth
  'BL': { lat: 53.578, lon: -2.428 }, // Bolton
  'BN': { lat: 50.823, lon: -0.143 }, // Brighton
  'BR': { lat: 51.405, lon: 0.014  }, // Bromley
  'BS': { lat: 51.454, lon: -2.587 }, // Bristol
  'BT': { lat: 54.597, lon: -5.930 }, // Belfast
  'CA': { lat: 54.892, lon: -2.933 }, // Carlisle
  'CB': { lat: 52.205, lon: 0.121  }, // Cambridge
  'CF': { lat: 51.481, lon: -3.179 }, // Cardiff
  'CH': { lat: 53.190, lon: -2.890 }, // Chester
  'CM': { lat: 51.736, lon: 0.469  }, // Chelmsford
  'CO': { lat: 51.889, lon: 0.904  }, // Colchester
  'CR': { lat: 51.376, lon: -0.098 }, // Croydon
  'CT': { lat: 51.280, lon: 1.078  }, // Canterbury
  'CV': { lat: 52.408, lon: -1.510 }, // Coventry
  'CW': { lat: 53.097, lon: -2.443 }, // Crewe
  'DA': { lat: 51.443, lon: 0.214  }, // Dartford
  'DD': { lat: 56.462, lon: -2.971 }, // Dundee
  'DE': { lat: 52.921, lon: -1.474 }, // Derby
  'DH': { lat: 54.776, lon: -1.578 }, // Durham
  'DL': { lat: 54.527, lon: -1.553 }, // Darlington
  'DN': { lat: 53.522, lon: -1.135 }, // Doncaster
  'DT': { lat: 50.713, lon: -2.441 }, // Dorchester
  'DY': { lat: 52.512, lon: -2.082 }, // Dudley
  'E':  { lat: 51.540, lon: -0.020 }, // East London
  'EC': { lat: 51.515, lon: -0.092 }, // City of London
  'EH': { lat: 55.953, lon: -3.188 }, // Edinburgh
  'EN': { lat: 51.652, lon: -0.082 }, // Enfield
  'EX': { lat: 50.725, lon: -3.527 }, // Exeter
  'FK': { lat: 56.117, lon: -3.937 }, // Falkirk
  'FY': { lat: 53.815, lon: -3.054 }, // Blackpool
  'G':  { lat: 55.864, lon: -4.252 }, // Glasgow
  'GL': { lat: 51.864, lon: -2.244 }, // Gloucester
  'GU': { lat: 51.235, lon: -0.575 }, // Guildford
  'HA': { lat: 51.578, lon: -0.336 }, // Harrow
  'HD': { lat: 53.645, lon: -1.785 }, // Huddersfield
  'HG': { lat: 53.992, lon: -1.541 }, // Harrogate
  'HP': { lat: 51.628, lon: -0.749 }, // Hemel Hempstead
  'HR': { lat: 52.057, lon: -2.715 }, // Hereford
  'HS': { lat: 57.812, lon: -6.836 }, // Stornoway (Outer Hebrides)
  'HU': { lat: 53.745, lon: -0.336 }, // Hull
  'HX': { lat: 53.722, lon: -1.857 }, // Halifax
  'IG': { lat: 51.560, lon: 0.080  }, // Ilford
  'IP': { lat: 52.057, lon: 1.156  }, // Ipswich
  'IV': { lat: 57.480, lon: -4.225 }, // Inverness
  'KA': { lat: 55.610, lon: -4.661 }, // Kilmarnock
  'KT': { lat: 51.412, lon: -0.300 }, // Kingston upon Thames
  'KW': { lat: 58.643, lon: -3.087 }, // Kirkwall
  'KY': { lat: 56.066, lon: -3.151 }, // Kirkcaldy
  'L':  { lat: 53.408, lon: -2.991 }, // Liverpool
  'LA': { lat: 54.046, lon: -2.802 }, // Lancaster
  'LD': { lat: 52.245, lon: -3.380 }, // Llandrindod Wells
  'LE': { lat: 52.637, lon: -1.139 }, // Leicester
  'LL': { lat: 53.184, lon: -3.819 }, // Llandudno
  'LN': { lat: 53.236, lon: -0.541 }, // Lincoln
  'LS': { lat: 53.801, lon: -1.549 }, // Leeds
  'LU': { lat: 51.879, lon: -0.420 }, // Luton
  'M':  { lat: 53.483, lon: -2.244 }, // Manchester
  'ME': { lat: 51.394, lon: 0.540  }, // Medway
  'MK': { lat: 52.041, lon: -0.760 }, // Milton Keynes
  'ML': { lat: 55.788, lon: -3.997 }, // Motherwell
  'N':  { lat: 51.580, lon: -0.100 }, // North London
  'NE': { lat: 54.978, lon: -1.617 }, // Newcastle
  'NG': { lat: 52.954, lon: -1.158 }, // Nottingham
  'NN': { lat: 52.241, lon: -0.902 }, // Northampton
  'NP': { lat: 51.585, lon: -2.998 }, // Newport
  'NR': { lat: 52.628, lon: 1.299  }, // Norwich
  'NW': { lat: 51.547, lon: -0.180 }, // North West London
  'OL': { lat: 53.541, lon: -2.119 }, // Oldham
  'OX': { lat: 51.752, lon: -1.258 }, // Oxford
  'PA': { lat: 55.847, lon: -4.421 }, // Paisley
  'PE': { lat: 52.566, lon: -0.243 }, // Peterborough
  'PH': { lat: 56.396, lon: -3.437 }, // Perth
  'PL': { lat: 50.376, lon: -4.143 }, // Plymouth
  'PO': { lat: 50.819, lon: -1.087 }, // Portsmouth
  'PR': { lat: 53.766, lon: -2.706 }, // Preston
  'RG': { lat: 51.454, lon: -0.973 }, // Reading
  'RH': { lat: 51.114, lon: -0.187 }, // Redhill
  'RM': { lat: 51.575, lon: 0.183  }, // Romford
  'S':  { lat: 53.380, lon: -1.470 }, // Sheffield
  'SA': { lat: 51.621, lon: -3.943 }, // Swansea
  'SE': { lat: 51.470, lon: -0.030 }, // South East London
  'SG': { lat: 51.902, lon: -0.202 }, // Stevenage
  'SK': { lat: 53.408, lon: -2.149 }, // Stockport
  'SL': { lat: 51.510, lon: -0.591 }, // Slough
  'SM': { lat: 51.358, lon: -0.193 }, // Sutton
  'SN': { lat: 51.557, lon: -1.778 }, // Swindon
  'SO': { lat: 50.909, lon: -1.404 }, // Southampton
  'SP': { lat: 51.069, lon: -1.795 }, // Salisbury
  'SR': { lat: 54.906, lon: -1.381 }, // Sunderland
  'SS': { lat: 51.539, lon: 0.713  }, // Southend
  'ST': { lat: 53.001, lon: -2.179 }, // Stoke
  'SW': { lat: 51.460, lon: -0.165 }, // South West London
  'SY': { lat: 52.708, lon: -2.756 }, // Shrewsbury
  'TA': { lat: 51.015, lon: -3.106 }, // Taunton
  'TD': { lat: 55.598, lon: -2.717 }, // Galashiels
  'TF': { lat: 52.678, lon: -2.448 }, // Telford
  'TN': { lat: 51.135, lon: 0.262  }, // Tunbridge Wells
  'TQ': { lat: 50.461, lon: -3.527 }, // Torquay
  'TR': { lat: 50.262, lon: -5.051 }, // Truro
  'TS': { lat: 54.575, lon: -1.235 }, // Teesside
  'TW': { lat: 51.447, lon: -0.327 }, // Twickenham
  'UB': { lat: 51.539, lon: -0.418 }, // Uxbridge
  'W':  { lat: 51.510, lon: -0.150 }, // West London
  'WA': { lat: 53.390, lon: -2.595 }, // Warrington
  'WC': { lat: 51.518, lon: -0.121 }, // West Central London
  'WD': { lat: 51.656, lon: -0.396 }, // Watford
  'WF': { lat: 53.683, lon: -1.498 }, // Wakefield
  'WN': { lat: 53.546, lon: -2.638 }, // Wigan
  'WR': { lat: 52.193, lon: -2.221 }, // Worcester
  'WS': { lat: 52.586, lon: -1.982 }, // Walsall
  'WV': { lat: 52.586, lon: -2.128 }, // Wolverhampton
  'YO': { lat: 53.961, lon: -1.082 }  // York
};

// Title patterns that map to known annual venues — last-resort geocoding for blockbusters
// Add new ones over time as you spot them.
export const KNOWN_VENUES = [
  { match: /mega weekender|history finders.*somerset|ukhf.*somerset/i, lat: 51.190, lon: -2.547, location: 'BA4 area, Shepton Mallet, Somerset' },
  { match: /prestatyn|treasure coast|smmdc|gronant/i,                  lat: 53.347, lon: -3.359, location: 'Gronant, Prestatyn, Denbighshire' },
  { match: /detectival/i,                                              lat: 51.875, lon: -1.491, location: 'Hook Norton, Oxfordshire' },
  { match: /minelab 500/i,                                             lat: 52.500, lon: -1.500, location: 'Midlands (TBC)' },
  { match: /rodney cook/i,                                             lat: 52.250, lon: -0.886, location: 'Northamptonshire' },
  { match: /no frills.*carlisle|detectormaina/i,                       lat: 54.892, lon: -2.933, location: 'Carlisle, Cumbria' }
];

// Returns true if the title looks like junk and the row should be dropped
export function isJunkTitle(title) {
  if (!title || title.length < 8) return true;
  const t = title.toLowerCase();
  for (const j of JUNK_TITLE_FRAGMENTS) {
    if (t.includes(j.toLowerCase())) return true;
  }
  // No alphabetic content at all? Junk.
  if (!/[a-z]{4}/i.test(title)) return true;

  // Negative keywords — definitely not a metal-detecting rally
  const negativeWords = ['cancer', 'hospital', 'clinic', 'wedding', 'funeral', 'covid', 'vaccine',
                          'pension', 'mortgage', 'recipe', 'fashion', 'shopping', 'salon'];
  for (const w of negativeWords) {
    if (t.includes(w)) return true;
  }

  // Must contain at least one detecting-related word OR look like a known rally name pattern
  const detectingWords = ['detect', 'rally', 'dig', 'metal', 'hunt', 'search', 'history', 'finder',
                           'mdc', 'club', 'memorial', 'weekender', 'treasure', 'coin', 'relic',
                           'prestatyn', 'detectival', 'minelab', 'smmdc', 'xp', 'nokta'];
  const looksDetecting = detectingWords.some(w => t.includes(w));
  if (!looksDetecting) return true;

  return false;
}

// Tries the manual lookups in order: known venue → postcode area → county
export function manualGeocode({ title, location, postcode }) {
  // 1. Title-based known-venue lookup (most specific)
  if (title) {
    for (const v of KNOWN_VENUES) {
      if (v.match.test(title)) {
        return { lat: v.lat, lon: v.lon, source: 'known_venue', resolvedLocation: v.location };
      }
    }
  }

  // 2. Postcode area (e.g. "BA4" with no inward)
  if (postcode) {
    const area = postcode.match(/^([A-Z]{1,2})/i)?.[1]?.toUpperCase();
    if (area && POSTCODE_AREAS[area]) {
      return { lat: POSTCODE_AREAS[area].lat, lon: POSTCODE_AREAS[area].lon, source: 'postcode_area' };
    }
  }

  // 3. County centroid mention in location text
  if (location) {
    const loc = location.toLowerCase();
    for (const [county, coords] of Object.entries(COUNTY_CENTROIDS)) {
      if (loc.includes(county)) {
        return { lat: coords.lat, lon: coords.lon, source: 'county_centroid' };
      }
    }
  }

  return null;
}
