const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorName: { type: String, default: 'Anonymous', trim: true },
    authorAvatar: { type: String, default: '' },
    audioUrl: { type: String, default: '' },
    audioDuration: { type: Number, default: 0 },
    coverUrl: { type: String, default: '' },
    tags: { type: [String], default: ['stories'] },
    type: { type: String, enum: ['story', 'audio-story'], default: 'story', index: true },
    status: { type: String, enum: ['published', 'hidden'], default: 'published', index: true },
    deletedReason: { type: String, default: '' },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    views: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'stories' }
);

StorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Story', StorySchema);
