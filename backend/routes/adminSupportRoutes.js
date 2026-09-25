const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { listConversations, getConversation, replyToConversation, closeConversation } = require('../controllers/adminSupportController');

const router = express.Router();

// Same staff roles the rest of the admin panel uses.
router.use(protect, authorize('admin', 'manager', 'employee'));

router.get('/conversations', listConversations);
router.get('/conversations/:id', getConversation);
router.post('/conversations/:id/reply', replyToConversation);
router.post('/conversations/:id/close', closeConversation);

module.exports = router;
