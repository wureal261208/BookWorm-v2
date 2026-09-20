const mongoose = require('mongoose');

// Real, persisted comments. Previously comments were a client-only demo
// (see utils/firebaseData.js "demo only" stubs) that never survived a
// refresh and weren't visible to other visitors - this is the real
// backing store, and also what the Admin Dashboard's "most commented"
// stat counts against.
const CommentSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true, collection: 'comments' }
);

module.exports = mongoose.model('Comment', CommentSchema);
