// Imports the Gutenberg metadata catalog CSV (from the "Gutenberg Metadata
// Downloader" Kaggle notebook by lokeshparab, ~75k rows / 21 columns) into
// the `book_metadata` collection in MongoDB Atlas.
//
// This backend has no network access to Kaggle, so it cannot download the
// CSV itself: download gutenberg_metadata.csv from Kaggle yourself first,
// then run this script locally, e.g.:
//
//   npm run import:book-metadata -- ./gutenberg_metadata.csv
//
// Safe to re-run: rows are upserted by "Etext Number", so running it again
// (e.g. with a refreshed CSV) updates existing rows instead of duplicating.

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const connectDB = require('../config/db');
const BookMetadata = require('../models/BookMetadata');
const mongoose = require('mongoose');

const BATCH_SIZE = 1000;

// Maps the exact CSV column headers to our schema fields.
const COLUMN_MAP = {
  'Etext Number': 'etextNumber',
  Type: 'type',
  Issued: 'issued',
  Title: 'title',
  Language: 'language',
  LoCC: 'locc',
  Bookshelves: 'bookshelves',
  Authors: 'authors',
  rights: 'rights',
  Subjects: 'subjects',
  'Read online (web)': 'readOnlineUrl',
  'EPUB3 (E-readers incl. Send-to-Kindle)': 'epub3Url',
  'EPUB (older E-readers)': 'epubOlderUrl',
  'EPUB (no images, older E-readers)': 'epubNoImagesUrl',
  Kindle: 'kindleUrl',
  'Kindle (E-readers incl. Send-to-Kindle)': 'kindleSendUrl',
  'Kindle (no images, older E-readers)': 'kindleNoImagesUrl',
  'Plain Text UTF-8': 'plainTextUtf8Url',
  'Download HTML(zip)': 'downloadHtmlZipUrl',
  'Resource Description Framework (RDF)': 'rdfUrl',
  'Other Links': 'otherLinks',
};

function mapRow(row) {
  const doc = {};
  for (const [csvHeader, field] of Object.entries(COLUMN_MAP)) {
    const value = row[csvHeader];
    doc[field] = field === 'etextNumber' ? Number(value) : (value || '').trim();
  }
  return doc;
}

async function flushBatch(batch) {
  if (batch.length === 0) return;

  const operations = batch
    .filter((doc) => Number.isFinite(doc.etextNumber))
    .map((doc) => ({
      updateOne: {
        filter: { etextNumber: doc.etextNumber },
        update: { $set: doc },
        upsert: true,
      },
    }));

  if (operations.length > 0) {
    await BookMetadata.bulkWrite(operations, { ordered: false });
  }
}

async function run() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error('Usage: npm run import:book-metadata -- /path/to/gutenberg_metadata.csv');
    process.exit(1);
  }

  const resolvedPath = path.resolve(csvPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  await connectDB();

  let batch = [];
  let total = 0;
  const startedAt = Date.now();

  const parser = fs.createReadStream(resolvedPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    })
  );

  for await (const row of parser) {
    batch.push(mapRow(row));
    total += 1;

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch);
      batch = [];
      console.log(`Imported ${total} rows so far...`);
    }
  }

  await flushBatch(batch);

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done. Imported/updated ${total} rows into book_metadata in ${seconds}s.`);

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
