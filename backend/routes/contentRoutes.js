const express = require('express');
const { protect } = require('../middleware/auth');
const { listContent, getPublicContentDetail, getAudiobookChapters, getTopCategories } = require('../controllers/contentController');
const { listContentComments, createContentComment } = require('../controllers/contentCommentController');
const { chatWithAiSuggestions } = require('../controllers/contentChatController');

const router = express.Router();

// GET /api/content/top-categories?limit=12 - backs the AI Suggestions page.
// Must come before GET /:id, so "top-categories" isn't parsed as an id.
router.get('/top-categories', getTopCategories);

// POST /api/content/ai-chat - the AI Suggestions chatbot (both the full
// page and the floating widget). Also before GET /:id for the same
// literal-path-first reason.
router.post('/ai-chat', chatWithAiSuggestions);

// GET /api/content?type=ebook|audiobook&search=&category=&language=&page=&limit=
// Public, no auth - reads the Content collection that
// utils/contentIngestion.js keeps filled. Always status:'published' only.
router.get('/', listContent);

// Comments - same public-read/logged-in-write split as book comments (see
// commentController.js).
router.get('/:id/comments', listContentComments);
router.post('/:id/comments', protect, createContentComment);

// GET /api/content/:id/chapters - audiobook chapter list (title + playable
// mp3 URL per chapter), parsed live from the item's LibriVox RSS feed. See
// ContentPlayerPage.jsx on the frontend.
router.get('/:id/chapters', getAudiobookChapters);

// GET /api/content/:id - single item, for the in-app reader/player pages.
router.get('/:id', getPublicContentDetail);

// Not built yet, on purpose (Wun's call: schema + ingestion first):
//   POST   /api/content            - user uploads (status starts 'pending')
//   PATCH  /api/content/:id/status - admin approve/reject
// Both need the auth/role middleware from middleware/auth.js and belong
// with the Community + Admin Panel upload-review phases, not this one.

module.exports = router;
