const express = require('express');
const { listEbooks, listAudiobooks } = require('../controllers/catalogController');

const router = express.Router();

// Public, no auth needed - these only ever read from MongoDB. The daily
// cron job (routes/cronRoutes.js) is what keeps the collections fresh, so
// there's no live Gutendex/LibriVox call hiding behind either of these.
router.get('/ebooks', listEbooks);
router.get('/audiobooks', listAudiobooks);

module.exports = router;
