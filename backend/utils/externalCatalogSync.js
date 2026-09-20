// Keeps the Ebook/Audiobook collections warm so the frontend never has to
// wait on Gutendex/LibriVox directly. A Vercel Cron job (see vercel.json)
// hits GET /api/cron/sync-catalog once a day, which calls syncExternalCatalog
// below; the public GET /api/ebooks and /api/audiobooks routes only ever
// read from MongoDB, so a slow or rate-limited upstream API never turns
// into a slow page load for an actual visitor.
//
// Uses Node's built-in fetch (Node 18+, which is what Vercel runs) instead
// of adding an HTTP client dependency - there was nothing here already, no
// reason to add one just for two GET requests.
const Ebook = require('../models/Ebook');
const Audiobook = require('../models/Audiobook');

// Exactly the two URLs given - page=1 of Gutendex's default (most-popular)
// ordering, and LibriVox's default 50-record feed. Overridable via env if
// the scope ever needs to change (more pages, a different sort, a higher
// limit) without a code edit.
const GUTENDEX_URL = process.env.GUTENDEX_URL || 'https://gutendex.com/books/?page=1';
const LIBRIVOX_URL = process.env.LIBRIVOX_URL || 'https://librivox.org/api/feed/audiobooks?format=json&limit=50';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }
  return response.json();
}

async function syncEbooks() {
  const data = await fetchJson(GUTENDEX_URL);
  const books = Array.isArray(data.results) ? data.results : [];

  if (!books.length) {
    return { source: 'gutendex', fetched: 0, upserted: 0 };
  }

  const now = new Date();
  const toPerson = (person) => ({
    name: person.name || '',
    birthYear: person.birth_year ?? null,
    deathYear: person.death_year ?? null,
  });

  // bulkWrite + upsert instead of one save() per book - one round trip to
  // Mongo for the whole page instead of ~32, and re-running this never
  // creates duplicates because the filter is the unique gutendexId.
  const operations = books.map((book) => ({
    updateOne: {
      filter: { gutendexId: book.id },
      update: {
        $set: {
          gutendexId: book.id,
          title: book.title || 'Untitled',
          authors: (book.authors || []).map(toPerson),
          translators: (book.translators || []).map(toPerson),
          subjects: book.subjects || [],
          bookshelves: book.bookshelves || [],
          summaries: book.summaries || [],
          languages: book.languages || [],
          copyright: typeof book.copyright === 'boolean' ? book.copyright : null,
          mediaType: book.media_type || 'Text',
          formats: book.formats || {},
          coverUrl: (book.formats && book.formats['image/jpeg']) || '',
          downloadCount: book.download_count || 0,
          lastSyncedAt: now,
        },
      },
      upsert: true,
    },
  }));

  const result = await Ebook.bulkWrite(operations);
  return {
    source: 'gutendex',
    fetched: books.length,
    upserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
  };
}

async function syncAudiobooks() {
  const data = await fetchJson(LIBRIVOX_URL);
  const books = Array.isArray(data.books) ? data.books : [];

  if (!books.length) {
    return { source: 'librivox', fetched: 0, upserted: 0 };
  }

  const now = new Date();

  const operations = books.map((book) => ({
    updateOne: {
      filter: { librivoxId: Number(book.id) },
      update: {
        $set: {
          librivoxId: Number(book.id),
          title: book.title || 'Untitled',
          description: book.description || '',
          language: book.language || '',
          authors: (book.authors || []).map((author) => ({
            firstName: author.first_name || '',
            lastName: author.last_name || '',
            birthYear: author.dob || '',
            deathYear: author.dod || '',
          })),
          totalTime: book.totaltime || '',
          totalTimeSecs: Number(book.totaltimesecs) || 0,
          numSections: Number(book.num_sections) || 0,
          urlLibrivox: book.url_librivox || '',
          urlIarchive: book.url_iarchive || '',
          urlProject: book.url_project || '',
          urlRss: book.url_rss || '',
          urlZipFile: book.url_zip_file || '',
          lastSyncedAt: now,
        },
      },
      upsert: true,
    },
  }));

  const result = await Audiobook.bulkWrite(operations);
  return {
    source: 'librivox',
    fetched: books.length,
    upserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
  };
}

async function syncExternalCatalog() {
  // Run both independently and report on each - a LibriVox hiccup
  // shouldn't stop the Gutendex refresh from landing, or vice versa.
  const [ebooksResult, audiobooksResult] = await Promise.allSettled([syncEbooks(), syncAudiobooks()]);

  return {
    ebooks:
      ebooksResult.status === 'fulfilled' ? ebooksResult.value : { source: 'gutendex', error: ebooksResult.reason.message },
    audiobooks:
      audiobooksResult.status === 'fulfilled'
        ? audiobooksResult.value
        : { source: 'librivox', error: audiobooksResult.reason.message },
  };
}

module.exports = { syncExternalCatalog, syncEbooks, syncAudiobooks };
