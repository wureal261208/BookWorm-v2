const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema(
  {
    // e.g. "html", "epub", "pdf", "mp3", "zip", "rss" - short and
    // display-friendly rather than a raw MIME type, since this drives the
    // download/reader/player buttons on the frontend.
    format: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const ContentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['ebook', 'audiobook'], required: true, index: true },
    title: { type: String, required: true, trim: true },
    // A single display string, not an authors array - Gutendex/LibriVox
    // authors are joined with ", " at ingestion time (see
    // utils/contentIngestion.js) to match this field as specced.
    author: { type: String, default: 'Unknown author', trim: true },
    description: { type: String, default: '' },
    categories: { type: [String], default: [] },
    language: { type: String, default: 'en' },
    // Neither Gutendex nor the LibriVox feed expose a clean single
    // publication/catalog date on their book objects, so this is null for
    // every synced item today - it's a real field for user uploads (which
    // can state one) and for whenever the source APIs add one, not a
    // fabricated value.
    release_date: { type: Date, default: null },
    cover_image: { type: String, default: '' },
    source: { type: String, enum: ['Gutenberg', 'LibriVox', 'User'], required: true, index: true },
    files: { type: [FileSchema], default: [] },

    // Fields beyond the original spec, added because the rest of section
    // 3/4 (admin moderation, "who uploaded this") is impossible to build
    // without them - flagged here rather than added silently:
    // - externalId + the compound index below: the natural de-dup key for
    //   Gutenberg/LibriVox re-syncs (their own catalog id), so re-running
    //   ingestion never creates duplicate documents.
    // - status: everything from Gutenberg/LibriVox is auto-approved (it's
    //   already public, curated content); a User upload starts 'pending'
    //   until an admin approves/rejects it (section 3).
    // - uploadedBy: which user submitted it, for the admin panel and for
    //   "ban a user" to make sense of what they uploaded.
    // - downloadCount: Gutendex's own real popularity number, kept so a
    //   "Hot ebooks" sort has something honest to sort by (LibriVox has no
    //   equivalent metric, so this stays 0 for audiobooks).
    externalId: { type: String, default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    downloadCount: { type: Number, default: 0 },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One externalId per source - this is what makes ingestion idempotent.
// Sparse so it doesn't apply to User uploads, which have no externalId.
ContentSchema.index({ source: 1, externalId: 1 }, { unique: true, sparse: true });
ContentSchema.index({ title: 'text', author: 'text', categories: 'text' });

// Guards against "Cannot overwrite model" on a warm serverless instance
// after a schema change. There's no name collision with the old Book model
// to worry about here since this is a new model under a new name - a
// mongoose.deleteModel('Book') call isn't needed for this file to work.
module.exports = mongoose.models.Content || mongoose.model('Content', ContentSchema);
