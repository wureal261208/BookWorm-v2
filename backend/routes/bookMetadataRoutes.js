const express = require('express');
const { searchBookMetadata, getBookMetadata, getBookMetadataBatch } = require('../controllers/bookMetadataController');

const router = express.Router();

// Public catalog - same "anyone can browse" spirit as /api/books.
router.get('/', searchBookMetadata);
// Must come before '/:etextNumber' or express would treat "batch" as an id.
router.get('/batch', getBookMetadataBatch);
router.get('/:etextNumber', getBookMetadata);

module.exports = router;
