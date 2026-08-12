const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // 'all-customers' targets every customer account. A specific user id targets one customer.
    audience: { type: String, default: 'all-customers' },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true, collection: 'notifications' }
);

module.exports = mongoose.model('Notification', NotificationSchema);
