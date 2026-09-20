const mongoose = require('mongoose');

const ChapterSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
  },
  { _id: false }
);

const BookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'General' },
    coverUrl: { type: String, default: '' },
    // The Gutenberg (or other) reader page URL a manually-typed book uses -
    // catalog-linked books (sourceEtextNumber set) don't need this, since
    // getBookReaderText fetches live from book_metadata.readOnlineUrl
    // instead, but manually-typed books have no other reader source.
    readerUrl: { type: String, default: '' },
    chapters: { type: [ChapterSchema], default: [] },
    // Publishing state set from the admin "Status" dropdown. Hidden/draft
    // books still live in Mongo (so staff can keep editing them) but should
    // be filtered out of the public catalog - see listBooks below.
    status: { type: String, enum: ['draft', 'published', 'hidden'], default: 'draft' },
    subjects: { type: [String], default: [] },
    language: { type: String, default: 'en' },
    // Staff member (admin/manager/employee) OR customer who pushed this
    // book - customers can now submit books too (see createBook), tagged
    // via createdByRole below so listings can show "Admin"/"Customer" etc.
    // without populating the User document on every row.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Denormalized copy of the pusher's role *at the time they pushed this
    // book* - kept even if that account's role changes later, since this
    // describes how the book got here, not the account's current standing.
    createdByRole: { type: String, enum: ['admin', 'manager', 'employee', 'customer'], required: true },
    // Real, persisted read count - incremented via POST /:id/view. Powers
    // the "most viewed" dashboard stat; the old client-only counter never
    // survived a refresh or counted anything for other visitors.
    views: { type: Number, default: 0 },
    // Links this Book back to its BookMetadata entry (book_metadata.etextNumber)
    // when it was pushed via "Import from catalog" or manually tagged to a
    // Gutenberg record. Optional - manually-typed books can leave this null.
    sourceEtextNumber: { type: Number, default: null, index: true },
    // Lowercase/trimmed mirror of `title`, kept in sync in the pre-validate
    // hook below. A plain unique index on `title` itself can't be
    // case/whitespace-insensitive, so this is the field that actually gets
    // the uniqueness constraint - it's what makes duplicate-title pushes
    // impossible even when two requests race each other (see createBook),
    // since MongoDB enforces this atomically at write time, unlike an
    // application-level "does this already exist?" check beforehand.
    normalizedTitle: { type: String, unique: true },
  },
  { timestamps: true }
);

BookSchema.pre('validate', function setNormalizedTitle(next) {
  this.normalizedTitle = (this.title || '').trim().toLowerCase();
  next();
});

// Powers the `q=` search param on GET /api/books - needed once the catalog
// can hold tens of thousands of books and a plain regex scan is too slow.
BookSchema.index({ title: 'text', author: 'text', subjects: 'text' });

const Book = mongoose.model('Book', BookSchema);

// Surfaces a failed index build in the server logs instead of it failing
// silently - the most common cause is leftover duplicate titles already in
// the collection from before this unique index existed (MongoDB can't build
// a unique index over data that already violates it). If you see this, use
// Admin > Remove to delete the duplicate-titled books, then restart the
// server so the index can build.
Book.on('index', (error) => {
  if (error) {
    console.error('Book collection index build failed (likely duplicate titles already in the database):', error.message);
  }
});

// The number of chapters an anonymous (not logged in) reader may access.
BookSchema.statics.ANONYMOUS_CHAPTER_LIMIT = 3;

module.exports = Book;
