const express = require('express');
const { createBook, listBooks, listMyBooks, getBook, updateBook, deleteBook, getBookReaderText, incrementBookViews, getBookStats } = require('../controllers/bookController');
const { listComments, createComment } = require('../controllers/commentController');
const { identify, protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Anyone (including anonymous) can browse and read, with chapter limits enforced in the controller.
router.get('/', identify, listBooks);

// Staff-only full catalog (with chapters) for the Admin panel. Must come
// before GET /:id, or Express would match "mine" as an :id and 400 on the
// ObjectId cast. Customers can hit this too now (see listMyBooks) - they
// just get their own submissions back instead of the whole catalog.
router.get('/mine', protect, authorize('admin', 'manager', 'employee', 'customer'), listMyBooks);

// Admin Dashboard aggregate stats (totals, most viewed, most commented).
router.get('/stats', protect, authorize('admin', 'manager', 'employee'), getBookStats);

router.get('/:id', identify, getBook);
router.get('/:id/reader-text', identify, getBookReaderText);
router.get('/:id/comments', listComments);
router.post('/:id/comments', protect, createComment);
router.post('/:id/view', identify, incrementBookViews);

// Staff push books with whatever status they choose; customers can push
// too now, but their submissions always land as a draft pending review
// (see createBook) rather than going straight onto the public site.
router.post('/', protect, authorize('admin', 'manager', 'employee', 'customer'), createBook);
router.put('/:id', protect, authorize('admin', 'manager', 'employee'), updateBook);
router.patch('/:id', protect, authorize('admin', 'manager', 'employee'), updateBook);
// Deleting is admin-only - managers/employees can still edit (above) but
// not permanently remove a book.
router.delete('/:id', protect, authorize('admin'), deleteBook);

module.exports = router;
