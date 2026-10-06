const mongoose = require('mongoose');

const ReadingProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    contentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    author: {
      type: String,
      default: 'Unknown author',
      trim: true,
    },
    cover: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['ebook', 'audiobook'],
      default: 'ebook',
    },
    chapterIndex: {
      type: Number,
      default: 0,
    },
    chapterOrder: {
      type: Number,
      default: 0,
    },
    chapterTitle: {
      type: String,
      default: '',
    },
    percent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    currentTime: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 0,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, collection: 'reading_progress' }
);

// Enforce unique progress entry per user per book/content
ReadingProgressSchema.index({ user: 1, contentId: 1 }, { unique: true });

module.exports = mongoose.model('ReadingProgress', ReadingProgressSchema);
