const express = require('express');
const { createBook, listBooks, listMyBooks, getBook, updateBook, deleteBook, getBookReaderText } = require('../controllers/bookController');
const { identify, protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Anyone (including anonymous) can browse and read, with chapter limits enforced in the controller.
router.get('/', identify, listBooks);

// Staff-only full catalog (with chapters) for the Admin panel. Must come
// before GET /:id, or Express would match "mine" as an :id and 400 on the
// ObjectId cast.
router.get('/mine', protect, authorize('admin', 'manager', 'employee'), listMyBooks);

router.get('/:id', identify, getBook);
router.get('/:id/reader-text', identify, getBookReaderText);

// Only admin/manager/employee can push (create), update, or remove books.
router.post('/', protect, authorize('admin', 'manager', 'employee'), createBook);
router.put('/:id', protect, authorize('admin', 'manager', 'employee'), updateBook);
router.patch('/:id', protect, authorize('admin', 'manager', 'employee'), updateBook);
router.delete('/:id', protect, authorize('admin', 'manager', 'employee'), deleteBook);

module.exports = router;
