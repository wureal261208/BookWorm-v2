const express = require('express');
const { createBook, listBooks, getBook, updateBook, deleteBook } = require('../controllers/bookController');
const { identify, protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Anyone (including anonymous) can browse and read, with chapter limits enforced in the controller.
router.get('/', identify, listBooks);
router.get('/:id', identify, getBook);

// Only admin/manager/employee can push (create), update, or remove books.
router.post('/', protect, authorize('admin', 'manager', 'employee'), createBook);
router.patch('/:id', protect, authorize('admin', 'manager', 'employee'), updateBook);
router.delete('/:id', protect, authorize('admin', 'manager', 'employee'), deleteBook);

module.exports = router;
