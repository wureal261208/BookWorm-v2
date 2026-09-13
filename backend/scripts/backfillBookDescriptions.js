// ONE-TIME BULK JOB - reviewed and requested explicitly by Wun as an
// exception to the normal flow (Edit Book modal's "Generate with AI"
// button, which only ever *suggests* and never writes to Mongo on its
// own - see backend/utils/openrouter.js and the /ai-fill route). This
// script is the opposite: it writes straight to the `books` collection,
// no per-book review, because reviewing tens of thousands of books by
// hand isn't realistic. Read the whole comment block below before running
// it against the real catalog.
//
// WHAT IT DOES
//   Finds every Book with an empty/missing `description`, asks OpenRouter
//   for a description + up to 5 subject tags (using a real excerpt of the
//   book's own text when one is available, same as the Edit modal button),
//   and saves the result directly to that book's `description` field.
//   Subjects are only filled in if the book doesn't already have any -
//   existing subject tags are never overwritten. While it's already
//   looking up each book's Gutenberg catalog entry for the text excerpt,
//   it also opportunistically copies that entry's reader URL onto
//   `readerUrl` if the book doesn't already have one - this part isn't
//   AI-generated, it's just data already sitting in book_metadata that
//   never got copied over onto the Book document.
//
// BEFORE YOU RUN THIS ON THE WHOLE CATALOG
//   - Cost: this calls an LLM once per book. With the default model
//     (openai/gpt-4o-mini) and a ~72k-book catalog, expect a real but
//     modest bill (rough order of magnitude: a few to some tens of USD,
//     depending on excerpt length and the model you choose) - check
//     current pricing at https://openrouter.ai/models before a full run.
//     A free-tier OpenRouter model avoids the bill but usually has a low
//     requests-per-minute cap, which will make a 72k-book run take a very
//     long time (potentially days) - --delay-ms below exists to respect
//     whatever limit your chosen model/account has.
//   - Time: even on a paid model, expect this to run for hours, not
//     minutes, once you account for fetching each book's Gutenberg text
//     and the AI call itself. Run it somewhere it can keep running
//     unattended (your own machine, a VM, a screen/tmux session) - NOT as
//     part of a Vercel deploy or serverless function, which will time out
//     long before this finishes.
//   - Quality: with tens of thousands of books, nobody is reviewing each
//     one by hand - that's the whole point of this script - so expect the
//     occasional mediocre or generic description (especially for books
//     with no fetchable Gutenberg text). Spot-check a sample afterwards.
//   - Safe to interrupt and re-run: it only ever selects books that still
//     have an empty description, so stopping it (Ctrl+C) and running it
//     again later just picks up where it left off - already-filled books
//     are never re-processed or re-billed.
//
// USAGE
//   cd backend
//   # ALWAYS try a small batch first:
//   node scripts/backfillBookDescriptions.js --limit=20
//   # then, once you're happy with the results in Mongo:
//   node scripts/backfillBookDescriptions.js
//
// FLAGS
//   --limit=N        Only process the first N books missing a description.
//                     Omit to process all of them.
//   --concurrency=N  How many books to process at once (default 3). Higher
//                     is faster but more likely to hit OpenRouter/Gutenberg
//                     rate limits.
//   --delay-ms=N     Extra pause between batches, in milliseconds (default
//                     500). Raise this if you're hitting rate-limit errors.

require('dotenv').config({ override: true });

const connectDB = require('../config/db');
const mongoose = require('mongoose');
const Book = require('../models/Book');
const { getBookAiContext } = require('../utils/bookAiContext');
const { generateBookMetadataSuggestion, OpenRouterConfigError } = require('../utils/openrouter');

function parseArgs(argv) {
  const args = { limit: null, concurrency: 3, delayMs: 500 };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (key === 'limit') args.limit = Number(value);
    if (key === 'concurrency') args.concurrency = Math.max(1, Number(value) || 3);
    if (key === 'delay-ms') args.delayMs = Math.max(0, Number(value) || 0);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processOneBook(book) {
  const { textExcerpt, readerUrlSuggestion } = await getBookAiContext(book);

  const suggestion = await generateBookMetadataSuggestion({
    title: book.title,
    author: book.author,
    category: book.category,
    existingSubjects: book.subjects,
    existingDescription: book.description,
    textExcerpt,
  });

  const update = { description: suggestion.description };
  if (!book.subjects?.length && suggestion.subjects.length) {
    update.subjects = suggestion.subjects;
  }
  if (readerUrlSuggestion) {
    update.readerUrl = readerUrlSuggestion;
  }
  await Book.updateOne({ _id: book._id }, { $set: update });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  await connectDB();

  const filter = { $or: [{ description: '' }, { description: { $exists: false } }] };
  const totalRemaining = await Book.countDocuments(filter);
  const totalToProcess = args.limit ? Math.min(args.limit, totalRemaining) : totalRemaining;

  if (!totalRemaining) {
    console.log('No books are missing a description - nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log(`${totalRemaining} book(s) currently have no description.`);
  console.log(`Processing ${totalToProcess} of them now (concurrency ${args.concurrency}, ${args.delayMs}ms between batches).`);
  console.log('Press Ctrl+C to stop at any point - already-saved books stay saved, and re-running this script picks up where you left off.\n');

  const cursor = Book.find(filter)
    .select('title author category subjects description readerUrl chapters sourceEtextNumber')
    .limit(totalToProcess)
    .cursor();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const startedAt = Date.now();
  let batch = [];

  async function flushBatch() {
    if (!batch.length) return;
    const results = await Promise.allSettled(batch.map(processOneBook));
    for (const result of results) {
      if (result.status === 'fulfilled') succeeded += 1;
      else failed += 1;
    }
    batch = [];
    await sleep(args.delayMs);
  }

  for await (const book of cursor) {
    batch.push(book);
    processed += 1;

    if (batch.length >= args.concurrency) {
      await flushBatch();
    }

    if (processed % 50 === 0 || processed === totalToProcess) {
      const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
      console.log(`...${processed}/${totalToProcess} processed (${succeeded} saved, ${failed} failed) - ${elapsedMin} min elapsed`);
    }
  }
  await flushBatch();

  console.log(`\nDone. ${succeeded} book(s) updated, ${failed} failed.`);
  if (failed) {
    console.log('Failures are usually a transient OpenRouter/Gutenberg error or rate limit - just re-run this script to retry them, it will skip everything already saved.');
  }

  await mongoose.disconnect();
}

run().catch(async (error) => {
  if (error instanceof OpenRouterConfigError) {
    console.error(`\n${error.message}`);
  } else {
    console.error('\nBackfill script crashed:', error);
  }
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
