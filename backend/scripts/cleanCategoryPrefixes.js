// ONE-TIME CLEANUP SCRIPT. Some Gutenberg bookshelf names carry their own
// site's browse-page label baked in verbatim, e.g. "Browsing: History -
// Ancient" - that's a real shelf name on gutenberg.org, not corrupted
// data, but earlier import code (both the bulk importMetadataToBooks.js
// script and the admin UI's "Add a new book" Gutenberg search) copied it
// as-is into a book's `category` field, where it reads oddly as a plain
// genre label. Both of those are now fixed to strip the prefix going
// forward - this script is just for books that were already imported
// before that fix and still carry the raw "Browsing: ..." value.
//
// Purely a find-and-replace on a string field already in Mongo - no AI
// call, no external fetch, runs in a few seconds regardless of catalog
// size.
//
// USAGE
//   cd backend
//   node scripts/cleanCategoryPrefixes.js          # see what it would change
//   node scripts/cleanCategoryPrefixes.js --apply  # actually save the changes

require('dotenv').config({ override: true });

const connectDB = require('../config/db');
const mongoose = require('mongoose');
const Book = require('../models/Book');

const PREFIX_PATTERN = /^browsing:\s*/i;

async function run() {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const affected = await Book.find({ category: PREFIX_PATTERN }).select('category');
  console.log(`${affected.length} book(s) have a category starting with "Browsing: ".`);

  if (!affected.length) {
    await mongoose.disconnect();
    return;
  }

  if (!apply) {
    console.log('\nDry run - no changes saved. Examples of what would change:');
    for (const book of affected.slice(0, 10)) {
      console.log(`  "${book.category}" -> "${book.category.replace(PREFIX_PATTERN, '').trim()}"`);
    }
    console.log('\nRe-run with --apply to actually save these changes.');
    await mongoose.disconnect();
    return;
  }

  const operations = affected.map((book) => ({
    updateOne: {
      filter: { _id: book._id },
      update: { $set: { category: book.category.replace(PREFIX_PATTERN, '').trim() || 'General' } },
    },
  }));
  const result = await Book.bulkWrite(operations);
  console.log(`Updated ${result.modifiedCount} book(s).`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('cleanCategoryPrefixes script crashed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
