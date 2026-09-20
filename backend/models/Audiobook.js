const mongoose = require('mongoose');

// LibriVox's author objects use first_name/last_name (+ dob/dod as plain
// strings, not always 4-digit years) rather than Gutendex's name/birth_year
// shape, so this gets its own schema instead of reusing Ebook's PersonSchema.
const NarratorAuthorSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    birthYear: { type: String, default: '' },
    deathYear: { type: String, default: '' },
  },
  { _id: false }
);

const AudiobookSchema = new mongoose.Schema(
  {
    // LibriVox's own numeric project id - the upsert key, same role as
    // gutendexId on the Ebook model.
    librivoxId: { type: Number, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    language: { type: String, default: '' },
    authors: { type: [NarratorAuthorSchema], default: [] },
    totalTime: { type: String, default: '' },
    totalTimeSecs: { type: Number, default: 0 },
    numSections: { type: Number, default: 0 },
    urlLibrivox: { type: String, default: '' },
    urlIarchive: { type: String, default: '' },
    urlProject: { type: String, default: '' },
    urlRss: { type: String, default: '' },
    urlZipFile: { type: String, default: '' },
    // Same purpose as Ebook.lastSyncedAt - when the daily cron last saw
    // this record in the LibriVox feed.
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Audiobook || mongoose.model('Audiobook', AudiobookSchema);
