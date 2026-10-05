const cheerio = require('cheerio');

// Every Gutenberg ebook page (readOnlineUrl, e.g.
// https://www.gutenberg.org/cache/epub/1/pg1-images.html) wraps the actual
// book between these two markers - everything before is license
// boilerplate, everything after is the standard License text. Matches
// "*** START OF THE PROJECT GUTENBERG EBOOK ... ***" and the THIS/END
// variants Gutenberg has used over the years.
const START_MARKER = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
const END_MARKER = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;

const FETCH_TIMEOUT_MS = 7500;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_CACHE_ENTRIES = 120;

// In-memory cache & in-flight deduplication to prevent Gutenberg rate-limiting & eliminate reader lag
const paragraphCache = new Map();
const textCache = new Map();
const inFlightParagraphs = new Map();
const inFlightText = new Map();

function setCache(map, key, value) {
  if (!key || !value) return;
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getFromCache(map, key) {
  if (!key) return null;
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BookWorm-v2/1.0',
        Accept: 'text/html,text/plain,*/*',
      },
    });
    if (!response.ok) {
      throw new Error(`Gutenberg responded with status ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Turns a Gutenberg reading-page's HTML into plain paragraphs, cropped down
// to just the book body (license boilerplate stripped from both ends).
function extractReadableTextFromHtml(html) {
  const $ = cheerio.load(html);
  $('script, style, nav, noscript').remove();

  const blocks = [];
  $('body')
    .find('p, h1, h2, h3, h4, h5, h6, blockquote, li, pre')
    .each((_, el) => {
      const text = $(el).text().replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
      if (text) blocks.push(text);
    });

  let text = blocks.join('\n\n');

  const startMatch = text.match(START_MARKER);
  if (startMatch) {
    text = text.slice(startMatch.index + startMatch[0].length);
  }

  const endMatch = text.match(END_MARKER);
  if (endMatch) {
    text = text.slice(0, endMatch.index);
  }

  return text.trim();
}

// Plain-text mirrors (plainTextUtf8Url) use the same *** START/END ***
// markers, just without any HTML around them.
function extractReadableTextFromPlainText(raw) {
  let text = raw;

  const startMatch = text.match(START_MARKER);
  if (startMatch) {
    text = text.slice(startMatch.index + startMatch[0].length);
  }

  const endMatch = text.match(END_MARKER);
  if (endMatch) {
    text = text.slice(0, endMatch.index);
  }

  return text.trim();
}

// Fetches a book's readable text server-side (browsers can't fetch
// gutenberg.org directly here due to CORS) and returns cleaned plain text.
// Tries the HTML "read online" page first, falls back to the plain-text
// mirror if that fails or comes back too short to be real book content.
async function fetchGutenbergReaderText({ readOnlineUrl, plainTextUtf8Url }) {
  const cacheKey = readOnlineUrl || plainTextUtf8Url;
  if (!cacheKey) {
    throw new Error('No valid URL provided for Gutenberg text.');
  }

  const cached = getFromCache(textCache, cacheKey);
  if (cached) return cached;

  if (inFlightText.has(cacheKey)) {
    return inFlightText.get(cacheKey);
  }

  const fetchPromise = (async () => {
    if (readOnlineUrl) {
      try {
        const html = await fetchWithTimeout(readOnlineUrl);
        const text = extractReadableTextFromHtml(html);
        if (text.length > 200) {
          setCache(textCache, cacheKey, text);
          return text;
        }
      } catch (error) {
        // fall through to the plain-text mirror below
      }
    }

    if (plainTextUtf8Url) {
      const raw = await fetchWithTimeout(plainTextUtf8Url);
      const text = extractReadableTextFromPlainText(raw);
      if (text.length > 200) {
        setCache(textCache, cacheKey, text);
        return text;
      }
    }

    throw new Error('Could not extract readable text from any available Gutenberg source.');
  })();

  inFlightText.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightText.delete(cacheKey);
  }
}

// Same cropped text as above, but as an array of paragraphs instead of one
// joined string - what the margin-notes reader needs, since a note anchors
// to a paragraph INDEX (see models/MarginNote.js), not a position in a
// giant blob of text. Reuses the exact same extraction/cropping logic (the
// paragraphs were joined with "\n\n" to build that string in the first
// place) rather than re-deriving crop points a second way.
function extractParagraphsFromHtml(html) {
  const text = extractReadableTextFromHtml(html);
  return text
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function extractParagraphsFromPlainText(raw) {
  const text = extractReadableTextFromPlainText(raw);
  return text
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

async function fetchGutenbergParagraphs({ readOnlineUrl, plainTextUtf8Url }) {
  const cacheKey = readOnlineUrl || plainTextUtf8Url;
  if (!cacheKey) {
    throw new Error('No valid URL provided for Gutenberg paragraphs.');
  }

  const cached = getFromCache(paragraphCache, cacheKey);
  if (cached) return cached;

  if (inFlightParagraphs.has(cacheKey)) {
    return inFlightParagraphs.get(cacheKey);
  }

  const fetchPromise = (async () => {
    if (readOnlineUrl) {
      try {
        const html = await fetchWithTimeout(readOnlineUrl);
        const paragraphs = extractParagraphsFromHtml(html);
        if (paragraphs.length > 3) {
          setCache(paragraphCache, cacheKey, paragraphs);
          return paragraphs;
        }
      } catch (error) {
        // fall through to the plain-text mirror below
      }
    }

    if (plainTextUtf8Url) {
      const raw = await fetchWithTimeout(plainTextUtf8Url);
      const paragraphs = extractParagraphsFromPlainText(raw);
      if (paragraphs.length > 3) {
        setCache(paragraphCache, cacheKey, paragraphs);
        return paragraphs;
      }
    }

    throw new Error('Could not extract readable paragraphs from any available Gutenberg source.');
  })();

  inFlightParagraphs.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightParagraphs.delete(cacheKey);
  }
}

module.exports = {
  fetchGutenbergReaderText,
  fetchGutenbergParagraphs,
  extractReadableTextFromHtml,
  extractReadableTextFromPlainText,
  extractParagraphsFromHtml,
  extractParagraphsFromPlainText,
};
