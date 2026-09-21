// Fetches audiobooks straight from LibriVox's own API and shapes them into
// clean JSON. This is the live, uncached version - hits LibriVox on every
// call. utils/contentIngestion.js (the actual site's data source) builds on
// top of the exact same shapeLibrivoxBook() function below, then caches the
// result in the Content collection so real page loads never wait on
// LibriVox directly.
const LIBRIVOX_BASE_URL = process.env.LIBRIVOX_BASE_URL || 'https://librivox.org/api/feed/audiobooks';

// extended=1 is required to get description + genres at all - LibriVox's
// plain feed (no extended param) only returns bare catalog fields (title,
// urls, authors, timings), nothing else. coverart=1 asks LibriVox itself
// for cover art where it has any, so the archive.org guessing below only
// has to run when LibriVox doesn't provide one.
function buildUrl({ limit, offset }) {
  return `${LIBRIVOX_BASE_URL}?format=json&extended=1&coverart=1&limit=${limit}&offset=${offset}`;
}

// LibriVox project pages are themselves mirrored on archive.org, and
// archive.org serves a cover thumbnail for any identifier at a predictable
// URL - so a details-page link is enough to build a working cover image
// URL without scraping anything.
function getArchiveOrgCover(urlIarchive) {
  const match = (urlIarchive || '').match(/archive\.org\/details\/([^/?#]+)/);
  return match ? `https://archive.org/services/img/${match[1]}` : '';
}

// Last-resort fallback when a book has neither LibriVox's own cover art nor
// a usable url_iarchive: LibriVox audiobooks are almost always mirrored on
// archive.org under an identifier built from the same slug as their own
// url_librivox path, suffixed "_librivox" (LibriVox's own long-standing
// archive.org upload convention). This is a best-effort guess, not a
// documented API guarantee - it can 404 for older or nonstandard uploads.
function guessCoverFromLibrivoxUrl(urlLibrivox) {
  const match = (urlLibrivox || '').match(/librivox\.org\/([^/?#]+)\/?$/);
  return match ? `https://archive.org/services/img/${match[1]}_librivox` : '';
}

function resolveCoverImage(book) {
  return (
    book.coverart_jpg || book.coverart_thumbnail || getArchiveOrgCover(book.url_iarchive) || guessCoverFromLibrivoxUrl(book.url_librivox) || ''
  );
}

function joinAuthors(authors) {
  const names = (authors || [])
    .map((person) => `${person.first_name || ''} ${person.last_name || ''}`.trim())
    .filter(Boolean);
  return names.join(', ') || 'Unknown author';
}

// The exact field set asked for, plus `id`/`source` so a consumer can tell
// entries apart and reuse this shape as an upsert key.
function shapeLibrivoxBook(book) {
  return {
    id: String(book.id),
    title: book.title || 'Untitled',
    author: joinAuthors(book.authors),
    description: book.description || '',
    categories: (book.genres || []).map((genre) => genre.name).filter(Boolean),
    language: book.language || 'English',
    // LibriVox has no single "release date" field on a catalog entry - only
    // copyright_year (a bare year, no month/day) - so this is left null
    // rather than faking a Jan-1st date out of a year-only value.
    release_date: null,
    url_zip_file: book.url_zip_file || '',
    url_text_source: book.url_text_source || '',
    url_librivox: book.url_librivox || '',
    cover_image: resolveCoverImage(book),
    source: 'LibriVox',
  };
}

async function fetchLibrivoxAudiobooks({ limit = 50, offset = 0 } = {}) {
  const cappedLimit = Math.min(Number(limit) || 50, 50); // LibriVox itself caps at 50/request
  const response = await fetch(buildUrl({ limit: cappedLimit, offset: Number(offset) || 0 }));

  if (!response.ok) {
    throw new Error(`LibriVox request failed with status ${response.status}`);
  }

  const data = await response.json();
  const books = data.books || [];
  return books.map(shapeLibrivoxBook);
}

module.exports = { fetchLibrivoxAudiobooks, shapeLibrivoxBook, resolveCoverImage };
