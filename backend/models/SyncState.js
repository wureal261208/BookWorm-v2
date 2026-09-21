const mongoose = require('mongoose');

// One document per external source. This is what makes "bắt đầu giới hạn,
// mở rộng dần" possible: each ingestion run only pages forward a bounded
// amount (see utils/contentIngestion.js), picking up next time from
// wherever this document says it left off, instead of re-walking the whole
// catalog - or worse, only ever being able to fetch everything in one shot.
const SyncStateSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['Gutenberg', 'LibriVox'], required: true, unique: true },
    // Gutendex: next page number to fetch (1-based). LibriVox: next
    // offset to fetch. Same field, different meaning per source's own
    // pagination style.
    nextCursor: { type: Number, default: 0 },
    totalAvailable: { type: Number, default: null }, // Gutendex's own reported count, once known
    totalImported: { type: Number, default: 0 },
    // Once true, the bounded initial import has either hit its target
    // count or reached the real end of the catalog. Future runs then just
    // top up with the source's first page instead of continuing to page
    // through - "mở rộng dần" means raising INITIAL_IMPORT_LIMIT (see
    // contentIngestion.js) and flipping this back to false so it resumes
    // from nextCursor.
    initialBackfillComplete: { type: Boolean, default: false },
    lastRunAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.SyncState || mongoose.model('SyncState', SyncStateSchema);
