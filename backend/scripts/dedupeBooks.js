// One-time cleanup for the Book collection, needed once when upgrading to
// the new unique index on `normalizedTitle` (see models/Book.js) - that
// index can only build if every document already has a unique
// normalizedTitle, so this script:
//
//   1. Finds every group of books that share the same title
//      (case/whitespace-insensitive).
//   2. For each group with more than one book, keeps exactly one copy -
//      preferring a published one over a draft/hidden one, and the oldest
//      if several have the same status - and deletes the rest.
//   3. Sets `normalizedTitle` on every remaining book.
//
// Safe to re-run: with no duplicates left, it only does step 3.
//
// Run it once after pulling this update, before restarting the server:
//   cd backend
//   npm run dedupe-books

require('dotenv').config();

const connectDB = require('../config/db');
const Book = require('../models/Book');
const mongoose = require('mongoose');

const STATUS_RANK = { published: 0, draft: 1, hidden: 2 };

async function run() {
  await connectDB();

  const books = await Book.find({}).sort({ createdAt: 1 });
  console.log(`Found ${books.length} book(s) total.`);

  const groups = new Map();
  for (const book of books) {
    const key = (book.title || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(book);
  }

  let deletedCount = 0;
  let keptCount = 0;

  for (const [normalizedTitle, group] of groups) {
    let survivor = group[0];
    for (const candidate of group.slice(1)) {
      const survivorRank = STATUS_RANK[survivor.status] ?? 3;
      const candidateRank = STATUS_RANK[candidate.status] ?? 3;
      if (candidateRank < survivorRank) survivor = candidate;
    }

    const toDelete = group.filter((book) => book._id.toString() !== survivor._id.toString());
    if (toDelete.length) {
      console.log(`"${survivor.title}" - keeping 1, deleting ${toDelete.length} duplicate(s).`);
      await Book.deleteMany({ _id: { $in: toDelete.map((book) => book._id) } });
      deletedCount += toDelete.length;
    }

    if (survivor.normalizedTitle !== normalizedTitle) {
      survivor.normalizedTitle = normalizedTitle;
      await survivor.save();
    }
    keptCount += 1;
  }

  console.log(`Done. Kept ${keptCount} book(s), deleted ${deletedCount} duplicate(s).`);
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error('Dedupe script failed:', error);
  process.exit(1);
});
