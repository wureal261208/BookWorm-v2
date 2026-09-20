const mongoose = require('mongoose');

// Every readable/downloadable rendition belonging to a catalog record.
const FileSchema = new mongoose.Schema(
  {
    format: { type: String, required: true, trim: true, lowercase: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

// This is intentionally a fresh catalog model.  `deleteModel` prevents
// Mongoose's development hot-reload cache from retaining the legacy Book
// schema that used category/chapters/status fields.
if (mongoose.models.Book) {
  mongoose.deleteModel('Book');
}

const BookSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['ebook', 'audiobook'], required: true, index: true },
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    categories: { type: [String], default: [], index: true },
    language: { type: String, default: 'en', trim: true, lowercase: true, index: true },
    release_date: { type: Date, default: null },
    cover_image: { type: String, default: '' },
    source: { type: String, enum: ['Gutenberg', 'LibriVox', 'User'], required: true, index: true },
    files: {
      type: [FileSchema],
      validate: {
        validator: (files) => Array.isArray(files) && files.length > 0,
        message: 'At least one book file is required.',
      },
    },

    // Moderation metadata for user contributions. Imported sources are
    // published by default; user content is pending until staff approves it.
    moderationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    externalId: { type: String, default: '', index: true },
  },
  // Separate collection means legacy `books` documents are never mixed with
  // the new catalog shape. This also makes rollout reversible.
  { timestamps: true, collection: 'catalog_books' }
);

BookSchema.index({ title: 'text', author: 'text', categories: 'text' });
BookSchema.index({ source: 1, externalId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Book', BookSchema);
