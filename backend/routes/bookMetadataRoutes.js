const express = require('express');
const { searchBookMetadata, getBookMetadata } = require('../controllers/bookMetadataController');

const router = express.Router();

// Public catalog - same "anyone can browse" spirit as /api/books.
router.get('/', searchBookMetadata);
router.get('/:etextNumber', getBookMetadata);

module.exports = router;
