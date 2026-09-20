// One-off local runner for the same sync the daily Vercel Cron job calls in
// production (see routes/cronRoutes.js) - use this to test or force-refresh
// the Ebook/Audiobook cache from your own machine without deploying or
// waiting for the schedule.
// Usage: npm run sync:catalog
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { syncExternalCatalog } = require('../utils/externalCatalogSync');

(async () => {
  await connectDB();
  const result = await syncExternalCatalog();
  console.log(JSON.stringify(result, null, 2));
  await mongoose.connection.close();
  process.exit(0);
})().catch((error) => {
  console.error('Catalog sync failed:', error);
  process.exit(1);
});
