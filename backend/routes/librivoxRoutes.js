const express = require('express');
const { previewLibrivoxAudiobooks } = require('../controllers/librivoxController');

const router = express.Router();

// GET /api/librivox/preview?limit=50&offset=0 - live LibriVox passthrough,
// nothing cached, nothing written to Mongo. Separate from GET /api/content,
// which is what the actual site and admin panel read from.
router.get('/preview', previewLibrivoxAudiobooks);

module.exports = router;
