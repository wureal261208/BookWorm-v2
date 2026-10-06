const express = require('express');
const { protect, identify } = require('../middleware/auth');
const {
  listContent,
  createUserContent,
  listMyContent,
  getPublicContentDetail,
  getContentText,
  getAudiobookChapters,
  searchAuthors,
  getTopCategories,
  getLanguageFacets,
  getForYou,
  incrementContentViews,
} = require('../controllers/contentController');
const {
  listContentComments,
  createContentComment,
  updateContentComment,
  deleteContentComment,
} = require('../controllers/contentCommentController');
const { listNotes, createNote, deleteNote } = require('../controllers/marginNoteController');

const router = express.Router();

// GET /api/content/top-categories?limit=12 - unused by the frontend since
// AI Suggestions became a chat, kept as a working endpoint regardless.
// Must come before GET /:id, so "top-categories" isn't parsed as an id.
router.get('/top-categories', getTopCategories);

// GET /api/content/authors?q=&limit= - backs the search page's Authors
// tab. Same before-GET-/:id reasoning.
router.get('/authors', searchAuthors);

// GET /api/content/languages - backs the search page's language facet.
router.get('/languages', getLanguageFacets);

// GET /api/content/mine - a reader's own submissions (any status), for
// CommunityPage.jsx's "Your submissions" list. Before GET /:id for the
// same before-GET-/:id reasoning, and requires login (a submission has to
// belong to someone).
router.get('/mine', protect, listMyContent);

// GET /api/content/for-you - personalized Home row, blends reader's preferredCategories
// with engagement, or falls back to top categories for guests.
router.get('/for-you', identify, getForYou);

// The AI Suggestions chatbot moved to /api/ai-suggestions/conversations
// (see routes/aiSuggestionsRoutes.js) - it's now a persisted, per-user
// chat history and needs login, so it no longer fits as a stateless public
// route here.

// GET /api/content?type=ebook|audiobook&search=&category=&language=&page=&limit=
// Public, no auth - reads the Content collection that
// utils/contentIngestion.js keeps filled. Always status:'published' only.
router.get('/', listContent);

// POST /api/content - community crowd-narration/upload (see
// CommunityPage.jsx and createUserContent's own comments). Any logged-in
// user, no special role - lands as status:'draft', reviewed the same way
// as any synced content in the existing Book Management admin panel.
router.post('/', protect, createUserContent);

// Comments - same public-read/logged-in-write split as book comments (see
// commentController.js).
router.get('/:id/comments', listContentComments);
router.post('/:id/comments', protect, createContentComment);
router.patch('/:id/comments/:commentId', protect, updateContentComment);
router.delete('/:id/comments/:commentId', protect, deleteContentComment);

// GET /api/content/:id/chapters - audiobook chapter list (title + playable
// mp3 URL per chapter), parsed live from the item's LibriVox RSS feed. See
// ContentPlayerPage.jsx on the frontend.
router.get('/:id/chapters', getAudiobookChapters);

// GET /api/content/:id/text - the book's paragraphs, for the margin-notes
// reader (see ContentReaderPage.jsx and models/MarginNote.js).
router.get('/:id/text', getContentText);

// Margin notes - public read (every note is visible to every reader),
// logged-in write, own-note delete.
router.get('/:id/notes', listNotes);
router.post('/:id/notes', protect, createNote);
router.delete('/:id/notes/:noteId', protect, deleteNote);

// GET /api/content/:id - single item, for the in-app reader/player pages.
router.get('/:id', getPublicContentDetail);

// POST /api/content/:id/view - records view/read counts
router.post('/:id/view', identify, incrementContentViews);

module.exports = router;
