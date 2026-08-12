const express = require('express');
const { rentBook, getMyRentals, returnBook } = require('../controllers/rentalController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect, authorize('customer'));

router.post('/', rentBook);
router.get('/mine', getMyRentals);
router.patch('/:id/return', returnBook);

module.exports = router;
