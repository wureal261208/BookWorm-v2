const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    rental: { type: mongoose.Schema.Types.ObjectId, ref: 'Rental', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ['card', 'bank_transfer', 'cash', 'wallet'],
      default: 'card',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'completed',
    },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'payments' }
);

module.exports = mongoose.model('Payment', PaymentSchema);
