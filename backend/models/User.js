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
    // Remembers the user's light/dark preference across devices/sessions -
    // opt-in, set only when they actually toggle it (see
    // PATCH /api/users/me/theme). Not required, so accounts before this
    // field existed just fall back to the app's default until they pick one.
    themePreference: { type: String, enum: ['light', 'dark'], default: null },
    // Bumped once per book a signed-in reader opens (see POST
    // /:id/view) - purely a simple activity counter for the Admin
    // "Top readers" stat, not a full reading-history log.
    booksReadCount: { type: Number, default: 0 },
    // Explicit genre picks from the signup onboarding step (or set/changed
    // later from Profile) - see PATCH /api/users/me/preferences. Empty
    // until they've actually chosen something; hasSetPreferences is what
    // tells the frontend "show the onboarding prompt" apart from "they
    // deliberately picked nothing".
    preferredCategories: { type: [String], default: [] },
    hasSetPreferences: { type: Boolean, default: false },
    // Real behavior, not just stated preference - bumped a little each time
    // this reader opens a Content item's reader/player page (see POST
    // /api/users/me/engagement), keyed by category name. Used together
    // with preferredCategories to build Home's "For You" row (see
    // GET /api/content/for-you) - a category they keep actually opening
    // counts for something even if they never filled in the onboarding
    // step, and vice versa.
    categoryEngagement: { type: Map, of: Number, default: {} },
    // Array of book/content IDs saved (bookmarked) by this user
    savedBooks: { type: [String], default: [] },
    // Shelved books with status ('reading', 'want_to_read', 'finished')
    shelvedBooks: [
      {
        bookId: { type: String, required: true },
        status: { type: String, enum: ['reading', 'want_to_read', 'finished'], default: 'want_to_read' },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, collection: 'user_profiles' }
);

module.exports = mongoose.model('User', UserSchema);
