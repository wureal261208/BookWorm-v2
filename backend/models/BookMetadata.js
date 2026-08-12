const mongoose = require('mongoose');

// Mirrors the 21 columns of gutenberg_metadata.csv (see the "Gutenberg
// Metadata Downloader" Kaggle notebook by lokeshparab). This collection is
// a reference catalog imported from that CSV via
// backend/scripts/importBookMetadata.js - it is not the app's rentable
// "Book" model (see models/Book.js), though a Book can reference an entry
// here by etextNumber to pull in bibliographic data.
const BookMetadataSchema = new mongoose.Schema(
  {
    etextNumber: { type: Number, required: true, unique: true }, // "Etext Number"
    type: { type: String, default: '' }, // "Type"
    issued: { type: String, default: '' }, // "Issued"
    title: { type: String, default: '' }, // "Title"
    language: { type: String, default: '' }, // "Language"
    locc: { type: String, default: '' }, // "LoCC"
    bookshelves: { type: String, default: '' }, // "Bookshelves"
    authors: { type: String, default: '' }, // "Authors"
    rights: { type: String, default: '' }, // "rights"
    subjects: { type: String, default: '' }, // "Subjects"
    readOnlineUrl: { type: String, default: '' }, // "Read online (web)"
    epub3Url: { type: String, default: '' }, // "EPUB3 (E-readers incl. Send-to-Kindle)"
    epubOlderUrl: { type: String, default: '' }, // "EPUB (older E-readers)"
    epubNoImagesUrl: { type: String, default: '' }, // "EPUB (no images, older E-readers)"
    kindleUrl: { type: String, default: '' }, // "Kindle"
    kindleSendUrl: { type: String, default: '' }, // "Kindle (E-readers incl. Send-to-Kindle)"
    kindleNoImagesUrl: { type: String, default: '' }, // "Kindle (no images, older E-readers)"
    plainTextUtf8Url: { type: String, default: '' }, // "Plain Text UTF-8"
    downloadHtmlZipUrl: { type: String, default: '' }, // "Download HTML(zip)"
    rdfUrl: { type: String, default: '' }, // "Resource Description Framework (RDF)"
    otherLinks: { type: String, default: '' }, // "Other Links"
  },
  { timestamps: true, collection: 'book_metadata' }
);

BookMetadataSchema.index({ title: 'text', authors: 'text', subjects: 'text' });

module.exports = mongoose.model('BookMetadata', BookMetadataSchema);
