const mongoose = require('mongoose');

const RatingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

RatingSchema.index({ user: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model('Rating', RatingSchema);
