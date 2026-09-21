// One-time fix for Content documents synced by an earlier version of
// contentIngestion.js, back when status used pending/approved/rejected
// instead of the app's actual draft/published/hidden vocabulary (see
// models/Content.js). Safe to run more than once - matches only the old
// values, so it's a no-op once everything's migrated.
// Usage: npm run migrate:content-status
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Content = require('../models/Content');

const RENAMES = {
  approved: 'published',
  pending: 'draft',
  rejected: 'hidden',
};

(async () => {
  await connectDB();

  let totalUpdated = 0;
  for (const [oldStatus, newStatus] of Object.entries(RENAMES)) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Content.updateMany({ status: oldStatus }, { $set: { status: newStatus } });
    console.log(`${oldStatus} -> ${newStatus}: ${result.modifiedCount} document(s)`);
    totalUpdated += result.modifiedCount;
  }

  console.log(`Done. ${totalUpdated} document(s) updated.`);
  await mongoose.connection.close();
  process.exit(0);
})().catch((error) => {
  console.error('Content status migration failed:', error);
  process.exit(1);
});
