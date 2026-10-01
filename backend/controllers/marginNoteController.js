const MarginNote = require('../models/MarginNote');
const Content = require('../models/Content');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

function serializeNote(note) {
  return {
    id: note._id,
    paragraphIndex: note.paragraphIndex,
    quote: note.quote,
    text: note.text,
    author: note.user?.name || 'Reader',
    userId: note.user?._id || note.user,
    createdAt: note.createdAt,
  };
}

// @route GET /api/content/:id/notes
// @desc  Public - every margin note is visible to every reader, same as
//        a Genius-style annotation would be. Sorted by paragraph so the
//        reader can group them by position in one pass.
const listNotes = asyncHandler(async (req, res) => {
  const notes = await MarginNote.find({ content: req.params.id })
    .sort({ paragraphIndex: 1, createdAt: 1 })
    .populate('user', 'name')
    .lean();

  return success(res, 200, 'Notes fetched.', notes.map(serializeNote));
});

// @route POST /api/content/:id/notes
const createNote = asyncHandler(async (req, res) => {
  const paragraphIndex = Number(req.body.paragraphIndex);
  const quote = (req.body.quote || '').trim();
  const text = (req.body.text || '').trim();

  if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
    return fail(res, 400, 'paragraphIndex must be a non-negative integer.');
  }
  if (!text) return fail(res, 400, 'text is required.');

  const content = await Content.findOne({ _id: req.params.id, status: 'published' }).select('_id');
  if (!content) return fail(res, 404, 'Content not found.');

  const note = await MarginNote.create({
    content: content._id,
    user: req.user._id,
    paragraphIndex,
    quote: quote.slice(0, 500),
    text,
  });
  await note.populate('user', 'name');

  return success(res, 201, 'Note added.', serializeNote(note));
});

// @route DELETE /api/content/:id/notes/:noteId
// @desc  Only the note's own author can remove it - no admin override here
//        yet (a note isn't reviewed content the way a Content document is,
//        it's more like a comment).
const deleteNote = asyncHandler(async (req, res) => {
  const note = await MarginNote.findOneAndDelete({ _id: req.params.noteId, content: req.params.id, user: req.user._id });
  if (!note) return fail(res, 404, 'Note not found.');
  return success(res, 200, 'Note deleted.', null);
});

module.exports = { listNotes, createNote, deleteNote };
