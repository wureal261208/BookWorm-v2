// Fills the Content collection from Gutendex (ebooks) and the LibriVox feed
// (audiobooks). Deliberately bounded per run (see the *_PER_RUN constants
// below) rather than "grab everything in one call" - a full walk of
// Gutendex's ~75k books or LibriVox's catalog can't fit inside a single
// Vercel serverless invocation's time limit. Progress is tracked in
// SyncState so a cron job hitting this once a day keeps making forward
// progress across many runs until INITIAL_IMPORT_LIMIT is reached (per
// Wun's call: start bounded, raise the limit later to pull in more).
const Content = require('../models/Content');
const SyncState = require('../models/SyncState');
const { fetchLibrivoxAudiobooks } = require('./librivoxFetcher');

const GUTENDEX_BASE_URL = process.env.GUTENDEX_BASE_URL || 'https://gutendex.com/books/';

// How many pages/batches to walk forward in a single run - kept small so
// one cron invocation stays well inside Vercel's execution time limit.
const GUTENDEX_PAGES_PER_RUN = Number(process.env.GUTENDEX_PAGES_PER_RUN) || 5;
const LIBRIVOX_BATCHES_PER_RUN = Number(process.env.LIBRIVOX_BATCHES_PER_RUN) || 5;
const LIBRIVOX_BATCH_SIZE = 50;

// The "bắt đầu giới hạn" ceiling, per source. Raise this (and, if it already
// finished, flip that source's SyncState.initialBackfillComplete back to
// false) to pull in more later - ingestion resumes from nextCursor, it
// doesn't start over.
const INITIAL_IMPORT_LIMIT = Number(process.env.INITIAL_IMPORT_LIMIT) || 3000;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }
  return response.json();
}

async function getOrCreateSyncState(source) {
  let state = await SyncState.findOne({ source });
  if (!state) {
    state = await SyncState.create({ source, nextCursor: source === 'Gutenberg' ? 1 : 0 });
  }
  return state;
}

function joinNames(people, nameFn) {
  const names = (people || []).map(nameFn).filter(Boolean);
  return names.join(', ') || 'Unknown author';
}

// Gutendex's own mime-type keys, translated to the short format labels the
// frontend's reader/download buttons key off of. Cover images are handled
// separately (cover_image), not listed as a downloadable file.
const GUTENDEX_FORMAT_LABELS = {
  'text/html': 'html',
  'application/epub+zip': 'epub',
  'application/x-mobipocket-ebook': 'mobi',
  'text/plain': 'txt',
  'application/rdf+xml': 'rdf',
};

function gutendexToContent(book) {
  const files = Object.entries(book.formats || {})
    .filter(([mime]) => GUTENDEX_FORMAT_LABELS[mime])
    .map(([mime, url]) => ({ format: GUTENDEX_FORMAT_LABELS[mime], url }));

  return {
    type: 'ebook',
    title: book.title || 'Untitled',
    author: joinNames(book.authors, (person) => person.name),
    description: (book.summaries && book.summaries[0]) || '',
    categories: book.subjects || [],
    language: (book.languages && book.languages[0]) || 'en',
    release_date: null,
    cover_image: (book.formats && book.formats['image/jpeg']) || '',
    source: 'Gutenberg',
    files,
    externalId: String(book.id),
    // Gutenberg content is already public/curated - no admin review needed
    // before it's visible, unlike a User upload (see models/Content.js).
    // Matches the same lowercase draft/published/hidden values Book.js
    // already uses, so the admin panel's status vocabulary stays one thing.
    status: 'published',
    downloadCount: book.download_count || 0,
    lastSyncedAt: new Date(),
  };
}

// Adapts librivoxFetcher.js's shapeLibrivoxBook() output (title, author,
// description, categories, language, url_zip_file, url_text_source,
// url_librivox, cover_image - the exact fields asked for) into the Content
// schema's shape (type/source/files/status/...). Both the live preview
// route (routes/librivoxRoutes.js) and this cached ingestion path share the
// same underlying mapping, so a fix to one never drifts from the other.
function shapedLibrivoxBookToContent(book) {
  const files = [
    book.url_zip_file ? { format: 'zip', url: book.url_zip_file } : null,
    book.url_text_source ? { format: 'text_source', url: book.url_text_source } : null,
  ].filter(Boolean);

  return {
    type: 'audiobook',
    title: book.title,
    author: book.author,
    description: book.description,
    categories: book.categories,
    language: book.language,
    release_date: book.release_date,
    cover_image: book.cover_image,
    source: 'LibriVox',
    files,
    externalId: book.id,
    status: 'published',
    downloadCount: 0, // LibriVox has no equivalent popularity metric
    lastSyncedAt: new Date(),
  };
}

async function upsertContent(source, items) {
  if (!items.length) return { upserted: 0, updated: 0 };

  const operations = items.map((doc) => ({
    updateOne: {
      filter: { source, externalId: doc.externalId },
      update: { $set: doc },
      upsert: true,
    },
  }));

  const result = await Content.bulkWrite(operations);
  return { upserted: result.upsertedCount || 0, updated: result.modifiedCount || 0 };
}

async function ingestGutendex() {
  const state = await getOrCreateSyncState('Gutenberg');

  if (state.initialBackfillComplete) {
    // Top-up mode: re-check page 1 (Gutendex's default "most popular"
    // order) so already-imported books get fresh download_count numbers,
    // without re-walking the whole catalog every run.
    const data = await fetchJson(`${GUTENDEX_BASE_URL}?page=1`);
    const books = data.results || [];
    const { upserted, updated } = await upsertContent('Gutenberg', books.map(gutendexToContent));
    state.lastRunAt = new Date();
    await state.save();
    return { source: 'Gutenberg', mode: 'top-up', fetched: books.length, upserted, updated };
  }

  let pagesThisRun = 0;
  let fetchedThisRun = 0;

  while (pagesThisRun < GUTENDEX_PAGES_PER_RUN && state.totalImported < INITIAL_IMPORT_LIMIT) {
    // eslint-disable-next-line no-await-in-loop
    const data = await fetchJson(`${GUTENDEX_BASE_URL}?page=${state.nextCursor}`);
    const books = data.results || [];
    if (!books.length) break;

    // eslint-disable-next-line no-await-in-loop
    await upsertContent('Gutenberg', books.map(gutendexToContent));

    state.totalImported += books.length;
    fetchedThisRun += books.length;
    state.totalAvailable = data.count ?? state.totalAvailable;
    state.nextCursor += 1;
    pagesThisRun += 1;

    if (!data.next) {
      state.initialBackfillComplete = true;
      break;
    }
  }

  if (state.totalImported >= INITIAL_IMPORT_LIMIT) {
    state.initialBackfillComplete = true;
  }

  state.lastRunAt = new Date();
  await state.save();

  return {
    source: 'Gutenberg',
    mode: 'backfill',
    fetchedThisRun,
    totalImported: state.totalImported,
    totalAvailable: state.totalAvailable,
    initialBackfillComplete: state.initialBackfillComplete,
  };
}

async function ingestLibrivox() {
  const state = await getOrCreateSyncState('LibriVox');

  if (state.initialBackfillComplete) {
    try {
      const books = await fetchLibrivoxAudiobooks({ limit: LIBRIVOX_BATCH_SIZE, offset: 0 });
      const { upserted, updated } = await upsertContent('LibriVox', books.map(shapedLibrivoxBookToContent));
      state.lastRunAt = new Date();
      await state.save();
      return { source: 'LibriVox', mode: 'top-up', fetched: books.length, upserted, updated };
    } catch (error) {
      // Same known-quirk situation as the backfill loop below - offset 0
      // itself can occasionally be one of the bad pages. Report it instead
      // of throwing, so this doesn't take down the whole daily cron run.
      state.lastRunAt = new Date();
      await state.save();
      return { source: 'LibriVox', mode: 'top-up', fetched: 0, error: error.message };
    }
  }

  let batchesThisRun = 0;
  let fetchedThisRun = 0;
  const skippedOffsets = [];

  while (batchesThisRun < LIBRIVOX_BATCHES_PER_RUN && state.totalImported < INITIAL_IMPORT_LIMIT) {
    const currentOffset = state.nextCursor;

    let books;
    try {
      // eslint-disable-next-line no-await-in-loop
      books = await fetchLibrivoxAudiobooks({ limit: LIBRIVOX_BATCH_SIZE, offset: currentOffset });
    } catch (error) {
      // LibriVox's own feed has known quirks where a specific record in a
      // batch (e.g. an uncommon language value) makes their server error
      // out for the whole page - see forum.librivox.org discussions of
      // this API's "quirks & limitations". There's nothing to fix on our
      // side, so skip past this one batch (losing at most 50 records) and
      // keep going, rather than getting permanently stuck retrying the
      // same offset forever.
      skippedOffsets.push({ offset: currentOffset, reason: error.message });
      state.nextCursor += LIBRIVOX_BATCH_SIZE;
      batchesThisRun += 1;
      // eslint-disable-next-line no-continue
      continue;
    }

    if (!books.length) {
      state.initialBackfillComplete = true;
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    await upsertContent('LibriVox', books.map(shapedLibrivoxBookToContent));

    state.totalImported += books.length;
    fetchedThisRun += books.length;
    state.nextCursor += LIBRIVOX_BATCH_SIZE;
    batchesThisRun += 1;

    if (books.length < LIBRIVOX_BATCH_SIZE) {
      state.initialBackfillComplete = true;
      break;
    }
  }

  if (state.totalImported >= INITIAL_IMPORT_LIMIT) {
    state.initialBackfillComplete = true;
  }

  state.lastRunAt = new Date();
  await state.save();

  return {
    source: 'LibriVox',
    mode: 'backfill',
    fetchedThisRun,
    totalImported: state.totalImported,
    initialBackfillComplete: state.initialBackfillComplete,
    ...(skippedOffsets.length ? { skippedOffsets } : {}),
  };
}

async function ingestAllContent() {
  // Independent per source - a LibriVox hiccup shouldn't stop the Gutendex
  // batch from landing, or vice versa.
  const [gutenbergResult, librivoxResult] = await Promise.allSettled([ingestGutendex(), ingestLibrivox()]);

  return {
    gutenberg:
      gutenbergResult.status === 'fulfilled' ? gutenbergResult.value : { source: 'Gutenberg', error: gutenbergResult.reason.message },
    librivox:
      librivoxResult.status === 'fulfilled' ? librivoxResult.value : { source: 'LibriVox', error: librivoxResult.reason.message },
  };
}

module.exports = { ingestAllContent, ingestGutendex, ingestLibrivox };
