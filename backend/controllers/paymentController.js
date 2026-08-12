const Rental = require('../models/Rental');
const Payment = require('../models/Payment');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

// @route POST /api/payments
// @desc  Customer pays for one of their own rentals.
const createPayment = asyncHandler(async (req, res) => {
  const { rentalId, amount, method } = req.body;

  if (!rentalId || !amount) {
    return fail(res, 400, 'rentalId and amount are required.');
  }

  const rental = await Rental.findById(rentalId);
  if (!rental) {
    return fail(res, 404, 'Rental not found.');
  }

  if (String(rental.customer) !== String(req.user._id)) {
    return fail(res, 403, 'You can only pay for your own rentals.');
  }

  const payment = await Payment.create({
    rental: rental._id,
    customer: req.user._id,
    amount,
    method: method || 'card',
    status: 'completed',
  });

  return success(res, 201, 'Payment completed successfully.', { payment });
});

// @route GET /api/payments/mine
const getMyPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ customer: req.user._id })
    .populate('rental')
    .sort({ createdAt: -1 });

  return success(res, 200, 'Your payments were retrieved successfully.', { payments });
});

module.exports = { createPayment, getMyPayments };
