const mongoose = require('mongoose');

// Anchored to a paragraph INDEX (see backend/utils/gutenbergReader.js's
// fetchGutenbergParagraphs, which the reader fetches the same paragraph
// array from), not a character range - a real, achievable slice of the
// "Genius for classic books" idea rather than promising word-level
// highlight anchoring, which would need a much more complex range-anchoring
// scheme (and would still drift if the source text ever changes). `quote`
// keeps a copy of the exact text the note was attached to, mostly so it
// still means something to a reader even if paragraph numbering ever shifts
// (a re-ingested edition, a parsing fix, etc.).
const MarginNoteSchema = new mongoose.Schema(
  {
    content: { type: mongoose.Schema.Types.ObjectId, ref: 'Content', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paragraphIndex: { type: Number, required: true, min: 0 },
    quote: { type: String, required: true, trim: true, maxlength: 500 },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

MarginNoteSchema.index({ content: 1, paragraphIndex: 1 });

module.exports = mongoose.models.MarginNote || mongoose.model('MarginNote', MarginNoteSchema);
