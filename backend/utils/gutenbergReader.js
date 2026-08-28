const cheerio = require('cheerio');

// Every Gutenberg ebook page (readOnlineUrl, e.g.
// https://www.gutenberg.org/cache/epub/1/pg1-images.html) wraps the actual
// book between these two markers - everything before is license
// boilerplate, everything after is the standard License text. Matches
// "*** START OF THE PROJECT GUTENBERG EBOOK ... ***" and the THIS/END
// variants Gutenberg has used over the years.
const START_MARKER = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
const END_MARKER = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;

const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BookWorm-v2/1.0 (+https://github.com)' },
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
  if (readOnlineUrl) {
    try {
      const html = await fetchWithTimeout(readOnlineUrl);
      const text = extractReadableTextFromHtml(html);
      if (text.length > 200) return text;
    } catch (error) {
      // fall through to the plain-text mirror below
    }
  }

  if (plainTextUtf8Url) {
    const raw = await fetchWithTimeout(plainTextUtf8Url);
    const text = extractReadableTextFromPlainText(raw);
    if (text.length > 200) return text;
  }

  throw new Error('Could not extract readable text from any available Gutenberg source.');
}

module.exports = { fetchGutenbergReaderText, extractReadableTextFromHtml, extractReadableTextFromPlainText };
