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
    // Human-readable account ID shown in the UI (Profile page, admin user
    // lists) - see utils/generateDisplayId.js. AD-000001 / MA-000001 /
    // EM-000001 for staff, plain "000001" for customers. `sparse` so
    // documents created before this field existed don't collide on `null`;
    // middleware/auth.js backfills it lazily on that account's next login.
    displayId: { type: String, unique: true, sparse: true, index: true },
    // True while this account is banned (customers only - staff use
    // isResigned instead, see below).
    isRestricted: { type: Boolean, default: false },
    banReason: { type: String, default: '' },
    // null = ban only lifts when an admin/manager manually unbans. A date =
    // auto-lifts the next time this user authenticates after that date (see
    // middleware/auth.js) - no cron job needed.
    banExpiresAt: { type: Date, default: null },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    bannedAt: { type: Date, default: null },
    // True when a manager/employee account has been resigned (revoked) by an admin/manager.
    isResigned: { type: Boolean, default: false },
    // Who created this account (used for manager/employee accounts created via one-time code).
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Bumped whenever this account's password is changed from Profile -
    // audit trail + used to time the "your password changed" email.
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'user_profiles' }
);

module.exports = mongoose.model('User', UserSchema);
