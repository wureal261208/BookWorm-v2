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
    // Staff member (admin/manager/employee) who pushed this book.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// The number of chapters an anonymous (not logged in) reader may access.
BookSchema.statics.ANONYMOUS_CHAPTER_LIMIT = 3;

module.exports = mongoose.model('Book', BookSchema);
