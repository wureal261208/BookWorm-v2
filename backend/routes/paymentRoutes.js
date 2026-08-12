const express = require('express');
const { createPayment, getMyPayments } = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect, authorize('customer'));

router.post('/', createPayment);
router.get('/mine', getMyPayments);

module.exports = router;
