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
    chapters: { type: [ChapterSchema], default: [] },
    isAvailableToRent: { type: Boolean, default: true },
    totalCopies: { type: Number, default: 1, min: 0 },
    availableCopies: { type: Number, default: 1, min: 0 },
    // Publishing state set from the admin "Status" dropdown. Hidden/draft
    // books still live in Mongo (so staff can keep editing them) but should
    // be filtered out of the public catalog - see listBooks below.
    status: { type: String, enum: ['draft', 'published', 'hidden'], default: 'draft' },
    // Which admin shelf this book is filed under - matches the frontend's
    // "To Read" / "To Rent" toggle. Distinct from isAvailableToRent (which
    // actually gates the rental flow) - this is just a catalog grouping.
    access: { type: String, enum: ['read', 'rent'], default: 'read' },
    subjects: { type: [String], default: [] },
    language: { type: String, default: 'en' },
    // Staff member (admin/manager/employee) who pushed this book.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Links this Book back to its BookMetadata entry (book_metadata.etextNumber)
    // when it was pushed via "Import from catalog" or manually tagged to a
    // Gutenberg record. Optional - manually-typed books can leave this null.
    sourceEtextNumber: { type: Number, default: null, index: true },
  },
  { timestamps: true }
);

// The number of chapters an anonymous (not logged in) reader may access.
BookSchema.statics.ANONYMOUS_CHAPTER_LIMIT = 3;

module.exports = mongoose.model('Book', BookSchema);
