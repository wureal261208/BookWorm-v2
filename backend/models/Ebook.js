const mongoose = require('mongoose');

// Shared shape for both authors and translators, matching Gutendex's
// "Person" object (name + birth/death year, either of which can be null).
const PersonSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    birthYear: { type: Number, default: null },
    deathYear: { type: Number, default: null },
  },
  { _id: false }
);

const EbookSchema = new mongoose.Schema(
  {
    // Project Gutenberg ID as Gutendex reports it (its own "id" field) -
    // this is the natural upsert key, so re-running the daily sync never
    // creates duplicates, it just refreshes the existing document's fields
    // (download_count in particular moves over time).
    gutendexId: { type: Number, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    authors: { type: [PersonSchema], default: [] },
    translators: { type: [PersonSchema], default: [] },
    subjects: { type: [String], default: [] },
    bookshelves: { type: [String], default: [] },
    summaries: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    copyright: { type: Boolean, default: null },
    mediaType: { type: String, default: 'Text' },
    // Raw mime-type -> URL map exactly as Gutendex returns it (e.g.
    // "text/html", "application/epub+zip", "image/jpeg" for the cover).
    // Kept as-is instead of picking out fields one by one, so a new format
    // Gutendex starts returning tomorrow shows up here without a code change.
    formats: { type: Map, of: String, default: {} },
    // Pulled out of formats['image/jpeg'] at sync time purely so listing
    // pages can read book.coverUrl directly instead of every screen having
    // to know the formats-map convention.
    coverUrl: { type: String, default: '' },
    downloadCount: { type: Number, default: 0 },
    // Set on every cron run that still sees this id in the fetched page -
    // lets you tell "never synced" apart from "synced today" without
    // relying on updatedAt (which would also move on unrelated app writes).
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Guards against "Cannot overwrite model" errors when this file is
// require()'d more than once in the same warm serverless instance.
module.exports = mongoose.models.Ebook || mongoose.model('Ebook', EbookSchema);
