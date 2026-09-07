// One-time bulk import: turns every row already sitting in `book_metadata`
// (the ~75k-book Gutenberg CSV catalog - see importBookMetadata.js) into a
// real, published Book document, so the site actually has a large catalog
// to browse instead of only whatever's been pushed by hand one at a time.
//
// Each imported book:
//   - is tagged createdByRole: 'admin', createdBy: <the default admin
//     account>, exactly like a book an admin pushed through the UI
//   - is published immediately (status: 'published') so it shows up on the
//     public site right away
//   - is linked via sourceEtextNumber, so reading it fetches live text from
//     Project Gutenberg through the existing /reader-text endpoint - no
//     chapter content is copied in, keeping this import light and fast
//
// Safe to re-run: books already imported (same normalizedTitle or
// sourceEtextNumber) are skipped, not duplicated - see the unique index on
// Book.normalizedTitle. Titles that collide with something already pushed
// by hand are skipped the same way and counted separately below.
//
// This is a genuinely large one-time job (~75,000 books) - expect it to
// take several minutes and use a meaningful chunk of your Atlas storage.
// Run it once:
//   cd backend
//   npm run import-metadata-to-books

require('dotenv').config({ override: true });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Book = require('../models/Book');
const BookMetadata = require('../models/BookMetadata');
const User = require('../models/User');

const BATCH_SIZE = 500;

function buildCoverUrl(etextNumber) {
  return `https://www.gutenberg.org/cache/epub/${etextNumber}/pg${etextNumber}.cover.medium.jpg`;
}

function splitList(value) {
  return (value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function toBookDoc(metadata, adminId) {
  const title = (metadata.title || '').trim();
  if (!title) return null; // a handful of rows in the CSV have no title - nothing to show, skip them

  const subjects = splitList(metadata.subjects);
  const bookshelves = splitList(metadata.bookshelves);

  return {
    title,
    author: metadata.authors || 'Unknown',
    description: '',
    category: bookshelves[0] || subjects[0] || 'General',
    coverUrl: buildCoverUrl(metadata.etextNumber),
    readerUrl: metadata.readOnlineUrl || '',
    chapters: [],
    createdBy: adminId,
    createdByRole: 'admin',
    sourceEtextNumber: metadata.etextNumber,
    status: 'published',
    subjects: subjects.length ? subjects : bookshelves,
    language: metadata.bookLanguage || 'en',
    normalizedTitle: title.toLowerCase(),
  };
}

async function run() {
  await connectDB();

  const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
  if (!admin) {
    console.error('No admin account found - log in as the default admin at least once (or check DEFAULT_ADMIN_EMAIL in .env) before running this.');
    process.exit(1);
  }
  console.log(`Importing as admin: ${admin.email}`);

  // Skip etextNumbers already linked to a Book (from a previous run, or
  // something pushed by hand through "Find it in the Gutenberg catalog") -
  // cheaper to filter these out up front than to rely solely on the unique
  // index rejecting them one row at a time.
  const alreadyLinked = await Book.distinct('sourceEtextNumber', { sourceEtextNumber: { $ne: null } });
  const alreadyLinkedSet = new Set(alreadyLinked);
  console.log(`${alreadyLinkedSet.size} book(s) already linked to a Gutenberg entry - these will be skipped.`);

  const totalMetadata = await BookMetadata.countDocuments({});
  console.log(`Found ${totalMetadata} row(s) in book_metadata. Importing in batches of ${BATCH_SIZE}...`);

  const cursor = BookMetadata.find({}).lean().cursor();

  let batch = [];
  let processed = 0;
  let inserted = 0;
  let skippedLinked = 0;
  let skippedNoTitle = 0;
  let skippedDuplicate = 0;

  async function flushBatch() {
    if (!batch.length) return;
    try {
      const result = await Book.insertMany(batch, { ordered: false });
      inserted += result.length;
    } catch (error) {
      // ordered:false means Mongo still inserts every doc that *didn't*
      // conflict - this catch only tallies the ones that did (duplicate
      // title or duplicate sourceEtextNumber against another row in this
      // same import, e.g. two CSV rows with the same title).
      const writeErrors = error.writeErrors || [];
      skippedDuplicate += writeErrors.length;
      inserted += batch.length - writeErrors.length;
    }
    batch = [];
  }

  for await (const metadata of cursor) {
    processed += 1;

    if (alreadyLinkedSet.has(metadata.etextNumber)) {
      skippedLinked += 1;
    } else {
      const doc = toBookDoc(metadata, admin._id);
      if (!doc) {
        skippedNoTitle += 1;
      } else {
        batch.push(doc);
      }
    }

    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }

    if (processed % 5000 === 0) {
      console.log(`...${processed}/${totalMetadata} processed (${inserted} inserted so far)`);
    }
  }

  await flushBatch();

  console.log('');
  console.log('Done.');
  console.log(`  Processed:        ${processed}`);
  console.log(`  Inserted:         ${inserted}`);
  console.log(`  Skipped (already linked): ${skippedLinked}`);
  console.log(`  Skipped (no title):       ${skippedNoTitle}`);
  console.log(`  Skipped (duplicate title/etext in this run): ${skippedDuplicate}`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
