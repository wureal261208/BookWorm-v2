const mongoose = require('mongoose');

const OneTimeCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    // Role this code grants when redeemed: 'manager' or 'employee'.
    role: { type: String, enum: ['manager', 'employee'], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    used: { type: Boolean, default: false },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OneTimeCode', OneTimeCodeSchema);
