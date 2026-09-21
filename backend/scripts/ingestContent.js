// One-off local runner for the same ingestion the daily Vercel Cron job
// calls in production (see routes/cronRoutes.js) - run this a few times in
// a row to walk further into the catalog without waiting on the schedule,
// or just once to sanity-check the Gutendex/LibriVox field mapping before
// deploying.
// Usage: npm run ingest:content
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { ingestAllContent } = require('../utils/contentIngestion');

(async () => {
  await connectDB();
  const result = await ingestAllContent();
  console.log(JSON.stringify(result, null, 2));
  await mongoose.connection.close();
  process.exit(0);
})().catch((error) => {
  console.error('Content ingestion failed:', error);
  process.exit(1);
});
