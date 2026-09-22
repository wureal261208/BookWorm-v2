const mongoose = require('mongoose');

// Real, persisted comments. Previously comments were a client-only demo
// (see utils/firebaseData.js "demo only" stubs) that never survived a
// refresh and weren't visible to other visitors - this is the real
// backing store, and also what the Admin Dashboard's "most commented"
// stat counts against.
const CommentSchema = new mongoose.Schema(
  {
    // Exactly one of book/content is set per comment - `book` for the
    // existing catalog (Book model), `content` for the newer unified
    // Gutendex/LibriVox/user-upload collection (Content model). Two
    // separate ref fields rather than one polymorphic field, so every
    // existing query against `book` (comment counts, admin's "most
    // commented" stat, etc.) keeps working exactly as it did before this
    // changed from required.
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', default: null, index: true },
    content: { type: mongoose.Schema.Types.ObjectId, ref: 'Content', default: null, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true, collection: 'comments' }
);

CommentSchema.pre('validate', function enforceExactlyOneTarget(next) {
  if (Boolean(this.book) === Boolean(this.content)) {
    next(new Error('A comment must reference exactly one of book or content.'));
    return;
  }
  next();
});

module.exports = mongoose.model('Comment', CommentSchema);
