const express = require('express');
const { listContent } = require('../controllers/contentController');

const router = express.Router();

// GET /api/content?type=ebook|audiobook&search=&category=&language=&page=&limit=
// Public, no auth - reads the Content collection that
// utils/contentIngestion.js keeps filled. Always status:'approved' only.
router.get('/', listContent);

// Not built yet, on purpose (Wun's call: schema + ingestion first):
//   POST   /api/content            - user uploads (status starts 'pending')
//   PATCH  /api/content/:id/status - admin approve/reject
// Both need the auth/role middleware from middleware/auth.js and belong
// with the Admin Panel + user-upload phases, not this one.

module.exports = router;
