const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    // Firebase Authentication owns credentials (password, email verification,
    // etc). This document only stores the app-specific profile and role.
    firebaseUid: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ['admin', 'manager', 'employee', 'customer'],
      default: 'customer',
    },
    // True when an admin/manager has restricted this customer's account.
    isRestricted: { type: Boolean, default: false },
    // True when a manager/employee account has been resigned (revoked) by an admin/manager.
    isResigned: { type: Boolean, default: false },
    // Who created this account (used for manager/employee accounts created via one-time code).
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'user_profiles' }
);

module.exports = mongoose.model('User', UserSchema);
