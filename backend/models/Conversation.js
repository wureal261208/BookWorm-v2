const mongoose = require('mongoose');

// A field literally named `type` inside an inline array-item schema
// confuses Mongoose's shorthand detection - it sees a `type` key and
// treats the WHOLE array as that type (here, effectively `[String]`),
// silently dropping id/title/author as unrecognized options instead of
// building a real subdocument schema. That's exactly what caused every
// assistant message with suggestions to fail to save with a
// "Cast to [string] failed" error, wiping out the reply along with it.
// A real, separate Schema() instance sidesteps the ambiguity entirely.
const SuggestionSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Content' },
    title: String,
    author: String,
    type: String,
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant', 'admin', 'system'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
    // Only ever set on 'assistant' messages in an 'ai-suggestions'
    // conversation - real Content _ids the model recommended (see
    // utils/openrouter.js's generateChatSuggestion), stored so the
    // frontend can re-render the same clickable cards without redoing the
    // catalog lookup every time the conversation is reopened.
    suggestions: { type: [SuggestionSchema], default: undefined },
    // ai-suggestions only - short clickable choices the model offers when
    // it's asking a clarifying question instead of recommending yet (see
    // utils/openrouter.js's generateChatSuggestion "progressive
    // clarification" instructions). Only set on that kind of message -
    // empty/omitted once the model actually recommends something.
    options: { type: [String], default: undefined },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const ConversationSchema = new mongoose.Schema(
  {
    // Always required, always the sole access-control boundary - see the
    // ownership checks in both controllers that read this collection.
    // Nobody (including admins) can list or open another user's
    // 'ai-suggestions' conversations; admins can only ever reach a
    // 'support' conversation through the escalation queue below.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // 'ai-suggestions': a private book-recommendation chat, never surfaced
    // to an admin. 'support': a help conversation that starts with the AI
    // answering and can be escalated to a human (see status).
    kind: { type: String, enum: ['ai-suggestions', 'support'], required: true, index: true },
    // ai-suggestions only - a short auto-generated label for the sidebar
    // list (see controllers/aiSuggestionsController.js).
    title: { type: String, default: '' },
    // support only: 'ai' (the bot is still handling it), 'escalated'
    // (waiting on an admin reply), 'closed' (an admin ended it - the next
    // message from this user starts a brand new conversation instead of
    // reopening this one, per Wun's call).
    status: { type: String, enum: ['ai', 'escalated', 'closed'], default: 'ai', index: true },
    // support only - which admin closed it (so the visitor can see who
    // they were talking to when rating the interaction) and their
    // satisfaction rating of that admin, if they've given one yet.
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    satisfactionRating: { type: Number, min: 1, max: 5, default: null },
    ratedAt: { type: Date, default: null },
    messages: { type: [MessageSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
