const Book = require('../models/Book');
const Content = require('../models/Content');
const BookMetadata = require('../models/BookMetadata');
const Notification = require('../models/Notification');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');
const { fetchGutenbergReaderText } = require('../utils/gutenbergReader');
const { getBookAiContext } = require('../utils/bookAiContext');
const { generateBookMetadataSuggestion, generateBookSummary, OpenRouterConfigError } = require('../utils/openrouter');
const { splitParagraphsIntoChapters } = require('../utils/chapterSplitter');
const maskEmail = require('../utils/maskEmail');
const escapeRegExp = require('../utils/escapeRegExp');
const {
  sendBookApprovalEmail,
  sendBookRejectionEmail,
  sendBookSubmissionEmail,
} = require('../utils/emailTemplates');

// Broadcasts a "new book" notification to every customer. Only ever called
// right after a book's status actually becomes 'published' - never for
// drafts/hidden books, and never repeatedly for a book that was already
// published (see the transition checks in createBook/updateBook below).
async function notifyBookPublished(book, staffUserId) {
  await Notification.create({
    title: 'New book published',
    message: `"${book.title}" is now available to read.`,
    createdBy: staffUserId,
    audience: 'all-customers',
    book: book._id,
  });
}

// @route POST /api/books
// @desc  Admin/manager/employee push a new book.
const createBook = asyncHandler(async (req, res) => {
  const {
    title,
    author,
    description,
    category,
    coverUrl,
    readerUrl,
    chapters,
    sourceEtextNumber,
    status,
    subjects,
    language,
  } = req.body;

  if (!title || !author) {
    return fail(res, 400, 'Title and author are required.');
  }

  // Block duplicate pushes - whether that's a genuinely accidental repeat
  // push of the same title, or several near-simultaneous submits (a slow
  // connection, a form double-click) racing past the frontend's own guard.
  // Case/whitespace-insensitive so "The Odyssey " and "the odyssey" collide
  // too. A matching sourceEtextNumber (the same Gutenberg book picked twice)
  // also counts, even if the title was hand-edited afterward.
  const normalizedTitle = title.trim();
  const etextNumber = Number.isFinite(Number(sourceEtextNumber)) ? Number(sourceEtextNumber) : null;
  const duplicate = await Book.findOne({
    $or: [
      { title: { $regex: `^${normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ...(etextNumber ? [{ sourceEtextNumber: etextNumber }] : []),
    ],
  });
  if (duplicate) {
    return fail(res, 409, `"${duplicate.title}" is already in the catalog.`);
  }

  const normalizedChapters = Array.isArray(chapters)
    ? chapters.map((chapter, index) => ({
        order: chapter.order ?? index + 1,
        title: chapter.title,
        content: chapter.content,
      }))
    : [];

  // Customers can push books now, but never straight to the public site -
  // their submissions always land as a draft so a staff member reviews and
  // publishes it from User Contributions/Book Management. Staff keep full
  // control over the status they choose.
  const isCustomer = req.user.role === 'customer';
  const resolvedStatus = isCustomer
    ? 'draft'
    : (['draft', 'published', 'hidden'].includes(status) ? status : 'draft');

  let book;
  try {
    book = await Book.create({
      title,
      author,
      description,
      category,
      coverUrl,
      readerUrl,
      chapters: normalizedChapters,
      createdBy: req.user._id,
      createdByRole: req.user.role,
      sourceEtextNumber: etextNumber,
      status: resolvedStatus,
      subjects: Array.isArray(subjects) ? subjects : [],
      language: language || 'en',
    });
  } catch (error) {
    // Belt and suspenders: the findOne check above is a fast, friendly
    // pre-check, but it isn't atomic - two requests within the same few
    // milliseconds of each other (a double-click, a slow connection retried)
    // can both pass it before either has actually saved. The unique index
    // on normalizedTitle is what actually guarantees no duplicate ever gets
    // written, so this catches that case too and gives it the same clear
    // message instead of a raw 500.
    if (error.code === 11000) {
      return fail(res, 409, `"${title.trim()}" is already in the catalog.`);
    }
    throw error;
  }

  if (book.status === 'published') {
    await notifyBookPublished(book, req.user._id);
  } else if (isCustomer && req.user.email) {
    sendBookSubmissionEmail({
      to: req.user.email,
      authorName: req.user.name || book.author || 'Author',
      bookTitle: book.title,
      bookId: book._id,
    }).catch((mailErr) => console.warn('Could not dispatch book submission receipt email:', mailErr.message));
  }

  return success(res, 201, 'Book pushed successfully.', { book });
});

// @route GET /api/books?limit=&page=&q=&category=&sort=
// @desc  Public catalog listing - published books only, paginated. Staff use
//        GET /api/books/mine (below) for the full catalog including
//        drafts/hidden books. `q` full-text searches title/author/subjects,
//        `category` does a case-insensitive partial match against both the
//        book's `category` field AND its `subjects` array (see
//        escapeRegExp below - Gutenberg's own category/subject text is
//        free-form, e.g. "History - Ancient" or "American Revolutionary
//        War", so a genre pill like "History" needs to match anything
//        containing that word, not just an exact category string); pass
//        several comma-separated (e.g. "Romance,Fantasy") to match ANY of
//        them - used by the Random page's up-to-5-genre picker. `sort` is
//        "recent" (default), "views" (most-read first), or "random" (a
//        fresh, genuinely random sample each call - see the $sample branch
//        below; there's no real per-user personalization/recommendation
//        engine behind Home's "Top picks for you" style rows or the Random
//        page, so random sampling from the real published catalog is the
//        honest way to give those a different, real set of books on every
//        call rather than quietly faking a "recommendation" that isn't
//        one) - the search/pagination Discover, Home, and Random actually
//        need now that the catalog can hold ~75k books, far too many to
//        ever hand the browser in one go.
const listBooks = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 32));

  const filter = { status: 'published' };
  if (req.query.createdByRole) {
    filter.createdByRole = req.query.createdByRole;
  }
  let categoryClauses = null;
  if (req.query.category && req.query.category !== 'all') {
    const categories = req.query.category.split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 5);
    if (categories.length) {
      categoryClauses = categories.flatMap((entry) => {
        const pattern = { $regex: escapeRegExp(entry), $options: 'i' };
        return [{ category: pattern }, { subjects: pattern }];
      });
    }
  }

  // Recommended sort by user preferences if requested and user has preferences
  if (req.query.sort === 'recommended' && !categoryClauses && req.user?.preferredCategories?.length) {
    const preferred = req.user.preferredCategories.slice(0, 5);
    categoryClauses = preferred.flatMap((entry) => {
      const pattern = { $regex: escapeRegExp(entry), $options: 'i' };
      return [{ category: pattern }, { subjects: pattern }];
    });
  }

  // Hot books logic:
  // - Priority order: highest views / read counts first, then newest books.
  // - Library / staff books (createdByRole != customer) qualify based on views/reads.
  // - User-contributed books (createdByRole == customer) MUST have at least 1,000 views.
  //   Editing views in MongoDB directly updates qualification and ordering.
  const hotClauses = req.query.sort === 'hot'
    ? [
        { createdByRole: { $ne: 'customer' } },
        { createdByRole: 'customer', views: { $gte: 1000 } },
      ]
    : null;

  if (categoryClauses && hotClauses) {
    filter.$and = [{ $or: categoryClauses }, { $or: hotClauses }];
  } else if (categoryClauses) {
    filter.$or = categoryClauses;
  } else if (hotClauses) {
    filter.$or = hotClauses;
  }

  if (req.query.q && req.query.q.trim()) {
    filter.$text = { $search: req.query.q.trim() };
  }

  // Random sampling can't use .sort()/.skip() (there's no stable "page 2"
  // of a fresh random draw) - it's a separate aggregation pipeline branch.
  if (req.query.sort === 'random') {
    const [books, total] = await Promise.all([
      Book.aggregate([{ $match: filter }, { $sample: { size: limit } }, { $project: { chapters: 0 } }]),
      Book.countDocuments(filter),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return success(res, 200, 'Books retrieved successfully.', { books, page: 1, limit, total });
  }

  const sort = req.query.sort === 'views' || req.query.sort === 'hot' || req.query.sort === 'recommended'
    ? { views: -1, createdAt: -1, _id: -1 }
    : { createdAt: -1, _id: -1 };

  const [books, total] = await Promise.all([
    Book.find(filter).select('-chapters').sort(sort).skip((page - 1) * limit).limit(limit),
    Book.countDocuments(filter),
  ]);

  // Defensive: make sure nothing between here and the browser (proxy, CDN,
  // browser disk cache) ever serves a stale book list after a new book gets
  // published - this list needs to reflect Mongo on every request.
  res.setHeader('Cache-Control', 'no-store');

  return success(res, 200, 'Books retrieved successfully.', { books, page, limit, total });
});

// @route GET /api/books/hot
// @desc  Dedicated Hot Books endpoint with priority logic:
//        Highest views first, library books, and user-added books requiring >= 1,000 views.
const listHotBooks = asyncHandler(async (req, res) => {
  req.query.sort = 'hot';
  return listBooks(req, res);
});

// @route GET /api/books/recommended
// @desc  Personalized book recommendations using reader's preferredCategories.
const listRecommendedBooks = asyncHandler(async (req, res) => {
  req.query.sort = 'recommended';
  return listBooks(req, res);
});

// @route GET /api/books/categories
// @desc  Distinct published categories with book counts, most popular
//        first - powers Discover's topic filter pills. Has to come from
//        the server: with ~75k books in the catalog, the handful loaded
//        into any single page of results is never a representative sample
//        of what categories actually exist.
const listCategories = asyncHandler(async (req, res) => {
  const categories = await Book.aggregate([
    { $match: { status: 'published' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 16 },
  ]);

  res.setHeader('Cache-Control', 'no-store');
  return success(res, 200, 'Categories retrieved successfully.', {
    categories: categories.map((entry) => ({ name: entry._id || 'General', count: entry.count })),
  });
});

// @route GET /api/books/mine
// @desc  Full book records (including chapters) for the staff admin panel.
//        Not scoped to req.user - admin/manager/employee share one catalog,
//        this isn't just books that specific staffer personally pushed.
// @route GET /api/books/mine?page=&limit=&contributorRole=
// @desc  Staff (admin/manager/employee) get the full catalog, paginated -
//        this used to return every book in one array, which the 75k-book
//        Gutenberg import makes completely impractical (multi-MB payload,
//        the browser trying to hold and render tens of thousands of rows).
//        Customers get only their own submissions back (see the createdBy
//        filter below), which doubles as the data source for their
//        "My submissions" view.
const listMyBooks = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const filter = {};
  if (req.user.role === 'customer') {
    filter.createdBy = req.user._id;
  } else if (['admin', 'manager', 'employee', 'customer'].includes(req.query.contributorRole)) {
    // Lets the Admin "User Contributions" tab ask for customer-submitted
    // books specifically, without the client having to page through the
    // entire catalog to find them.
    filter.createdByRole = req.query.contributorRole;
  }
  if (['draft', 'published', 'hidden'].includes(req.query.status)) {
    // Book Management's All/Draft/Published filter chips - now a real
    // server-side filter instead of slicing whatever page happened to be
    // loaded, which is the only way that filter can mean anything once the
    // catalog holds ~75k books.
    filter.status = req.query.status;
  }
  if (req.query.q && req.query.q.trim()) {
    filter.$text = { $search: req.query.q.trim() };
  }

  const [books, total] = await Promise.all([
    Book.find(filter)
      .select('-chapters')
      // Tie-break on _id, same reasoning as the public /api/books listing
      // below: a lot of these books were bulk-imported in the same
      // millisecond, so createdAt alone doesn't fully order them and
      // MongoDB's skip/limit pagination isn't guaranteed stable across
      // requests without a fully deterministic sort. That's what was
      // showing the same book on page 1, 2, and 3 in Book Management.
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'name email role'),
    Book.countDocuments(filter),
  ]);

  return success(res, 200, 'Managed books retrieved successfully.', { books, page, limit, total });
});

// @route GET /api/books/:id
// @desc  Read a book. Anonymous visitors only get the first 3 chapters.
const getBook = asyncHandler(async (req, res) => {
  let book = await Book.findById(req.params.id);

  if (!book) {
    const content = await Content.findById(req.params.id).lean();
    if (content) {
      const isAudio = content.type === 'audiobook';
      book = {
        _id: content._id,
        id: content._id,
        title: content.title,
        author: content.author,
        description: content.description,
        category: isAudio ? 'Audiobook' : (content.categories?.[0] || 'Classic'),
        coverUrl: content.cover_image,
        readerUrl: (content.files?.find((f) => f.format === 'html')?.url) || (content.files?.find((f) => f.format === 'txt')?.url) || '',
        chapters: [],
        status: content.status || 'published',
        subjects: content.categories || [],
        language: content.language || 'en',
        views: content.downloadCount || content.views || 0,
        download_count: content.downloadCount || 0,
        type: content.type,
        files: content.files || [],
        source: content.source,
      };
      return success(res, 200, 'Book retrieved successfully.', { book, isLimited: false });
    }
    return fail(res, 404, 'Book not found.');
  }

  const isAnonymous = !req.user;
  const chapterLimit = Book.ANONYMOUS_CHAPTER_LIMIT;

  if (!isAnonymous) {
    return success(res, 200, 'Book retrieved successfully.', { book, isLimited: false });
  }

  const limitedChapters = book.chapters
    .sort((a, b) => a.order - b.order)
    .slice(0, chapterLimit);

  const limitedBook = book.toObject();
  limitedBook.chapters = limitedChapters;

  return success(
    res,
    200,
    `You are reading as a guest. Log in to unlock all chapters beyond the first ${chapterLimit}.`,
    { book: limitedBook, isLimited: book.chapters.length > chapterLimit }
  );
});

// @route PATCH /api/books/:id
// @desc  Admin/manager/employee updates a book.
const updateBook = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);

  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  const wasPublished = book.status === 'published';

  const allowedFields = [
    'title',
    'author',
    'description',
    'category',
    'coverUrl',
    'readerUrl',
    'chapters',
    'sourceEtextNumber',
    'status',
    'subjects',
    'language',
    'rejectionReason',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      book[field] = req.body[field];
    }
  });

  if (req.body.rejectionReason !== undefined) {
    book.rejectionReason = String(req.body.rejectionReason).trim();
  } else if (req.body.reason !== undefined) {
    book.rejectionReason = String(req.body.reason).trim();
  }

  if (book.status === 'published') {
    book.rejectionReason = '';
  }

  try {
    await book.save();
  } catch (error) {
    if (error.code === 11000) {
      return fail(res, 409, `"${book.title}" is already in the catalog.`);
    }
    throw error;
  }

  // Only notify on the Draft/Hidden -> Published transition - not on every
  // edit to a book that was already published, or that isn't published now.
  if (!wasPublished && book.status === 'published') {
    await notifyBookPublished(book, req.user._id);

    // If submitted by an author, dispatch an approval email
    if (book.createdBy) {
      User.findById(book.createdBy)
        .select('name email')
        .then((authorUser) => {
          if (authorUser?.email) {
            sendBookApprovalEmail({
              to: authorUser.email,
              authorName: authorUser.name || book.author || 'Author',
              bookTitle: book.title,
              bookId: book._id,
            }).catch((err) => console.warn('Could not dispatch book approval email:', err.message));
          }
        })
        .catch(() => {});
    }
  } else if (book.status === 'hidden' || (wasPublished && book.status === 'draft')) {
    // If unpublished or rejected/hidden, dispatch in-app notification & rejection email to author
    if (book.createdBy) {
      const reasonText = book.rejectionReason || req.body.reason || 'Submission did not meet publication standards or requires revisions.';
      if (!book.rejectionReason) {
        book.rejectionReason = reasonText;
        await book.save().catch(() => {});
      }

      // Create in-app notification for author
      Notification.create({
        title: 'Book Submission Review',
        message: `Admin ignored/rejected "${book.title}". Reason: ${reasonText}`,
        createdBy: req.user._id,
        audience: 'user',
        user: book.createdBy,
        book: book._id,
      }).catch((err) => console.warn('Could not create rejection notification for author:', err.message));

      User.findById(book.createdBy)
        .select('name email')
        .then((authorUser) => {
          if (authorUser?.email) {
            sendBookRejectionEmail({
              to: authorUser.email,
              authorName: authorUser.name || book.author || 'Author',
              bookTitle: book.title,
              reason: reasonText,
            }).catch((err) => console.warn('Could not dispatch book rejection email:', err.message));
          }
        })
        .catch(() => {});
    }
  }

  return success(res, 200, 'Book updated successfully.', { book });
});

// @route PATCH /api/books/:id/mine
// @desc  Phase 2 of customer self-publishing (see WritePage.jsx) - lets a
//        customer edit or add chapters to a book THEY submitted, which
//        updateBook above never allowed (staff-only). Ownership-checked by
//        filtering on createdBy in the query itself, not by loading the
//        book and checking after - a book that exists but isn't theirs
//        404s the same as one that doesn't exist at all, rather than
//        confirming its existence to someone who shouldn't see it.
//
//        If the book was already 'published', any edit here sends it back
//        to 'draft' - an admin has to re-review it before the new version
//        (new chapters included) goes live again. This is the real
//        trade-off of Phase 2: without it, a customer could get a book
//        approved and then silently swap in different content afterward.
//        Status itself is deliberately NOT in allowedFields - a customer
//        can't set their own book to 'published', only an admin can.
const updateMyBook = asyncHandler(async (req, res) => {
  const book = await Book.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  const wasPublished = book.status === 'published';

  const allowedFields = ['title', 'author', 'description', 'category', 'coverUrl', 'chapters', 'subjects', 'language'];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      book[field] = req.body[field];
    }
  });

  if (wasPublished) {
    book.status = 'draft';
  }

  try {
    await book.save();
  } catch (error) {
    if (error.code === 11000) {
      return fail(res, 409, `"${book.title}" is already in the catalog.`);
    }
    throw error;
  }

  return success(
    res,
    200,
    wasPublished ? 'Updated - sent back for admin review before it goes live again.' : 'Book updated.',
    { book },
  );
});

// @route DELETE /api/books/:id/mine
// @desc  Allows a customer or author to delete a book THEY created.
const deleteMyBook = asyncHandler(async (req, res) => {
  const book = await Book.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
  if (!book) {
    return fail(res, 404, 'Book not found or you are not authorized to delete it.');
  }
  return success(res, 200, 'Your book has been deleted successfully.', null);
});

// @route DELETE /api/books/:id
const deleteBook = asyncHandler(async (req, res) => {
  const book = await Book.findByIdAndDelete(req.params.id);

  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  return success(res, 200, 'Book deleted successfully.', null);
});

// @route GET /api/books/:id/reader-text
// @desc  Real reader text for books that don't have chapters typed into
//        Mongo (see Book.chapters) - fetches the Gutenberg "read online"
//        page server-side (browsers can't hit gutenberg.org directly, no
//        CORS headers there) and returns the cleaned book body only, not
//        the page itself.
const getBookReaderText = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id).select('sourceEtextNumber chapters readerUrl title');

  if (!book) {
    const content = await Content.findOne({ _id: req.params.id, status: 'published' }).lean();
    if (content) {
      const htmlFile = (content.files || []).find((file) => file.format === 'html');
      const txtFile = (content.files || []).find((file) => file.format === 'txt');
      if (htmlFile || txtFile) {
        try {
          const text = await fetchGutenbergReaderText({
            readOnlineUrl: htmlFile?.url,
            plainTextUtf8Url: txtFile?.url,
          });
          return success(res, 200, 'Reader text retrieved successfully.', { text });
        } catch (err) {
          return fail(res, 502, `Could not fetch reader text: ${err.message}`);
        }
      }
    }
    return fail(res, 404, 'Book not found.');
  }

  if (book.chapters && book.chapters.some((chapter) => chapter.content)) {
    const text = book.chapters
      .map((ch, idx) => `## ${ch.title || `Chapter ${idx + 1}`}\n\n${ch.content || ''}`)
      .join('\n\n');
    return success(res, 200, 'Reader text retrieved successfully.', { text });
  }

  let readOnlineUrl = book.readerUrl;
  let plainTextUtf8Url = null;

  if (book.sourceEtextNumber) {
    if (!readOnlineUrl) {
      readOnlineUrl = `https://www.gutenberg.org/ebooks/${book.sourceEtextNumber}.html.images`;
    }
    plainTextUtf8Url = `https://www.gutenberg.org/cache/epub/${book.sourceEtextNumber}/pg${book.sourceEtextNumber}.txt`;
  }

  if (!readOnlineUrl && !plainTextUtf8Url) {
    const metadata = await BookMetadata.findOne({ etextNumber: book.sourceEtextNumber });
    if (metadata && (metadata.readOnlineUrl || metadata.plainTextUtf8Url)) {
      readOnlineUrl = metadata.readOnlineUrl;
      plainTextUtf8Url = metadata.plainTextUtf8Url;
    }
  }

  if (!readOnlineUrl && !plainTextUtf8Url) {
    const matchingContent = await Content.findOne({
      title: { $regex: new RegExp(escapeRegExp(book.title), 'i') },
      type: 'ebook',
      status: 'published',
    }).lean();
    if (matchingContent) {
      const htmlFile = (matchingContent.files || []).find((file) => file.format === 'html');
      const txtFile = (matchingContent.files || []).find((file) => file.format === 'txt');
      readOnlineUrl = htmlFile?.url;
      plainTextUtf8Url = txtFile?.url;
    }
  }

  if (!readOnlineUrl && !plainTextUtf8Url) {
    return fail(res, 404, 'No readable source is on file for this book in the Gutenberg catalog.');
  }

  try {
    const text = await fetchGutenbergReaderText({
      readOnlineUrl,
      plainTextUtf8Url,
    });
    return success(res, 200, 'Reader text retrieved successfully.', { text });
  } catch (error) {
    return fail(res, 502, `Could not fetch reader text from Project Gutenberg: ${error.message}`);
  }
});

// @route POST /api/books/:id/ai-fill
// @desc  Suggests a description + subject tags for one book via an LLM
//        (OpenRouter) - used by the Edit Book modal's "Generate with AI"
//        button. This never writes to the database itself; it only
//        returns a suggestion for the admin to review, edit, and save
//        through the normal PUT /api/books/:id the same as any manual
//        edit. Uses a real excerpt of the book's own text when one is
//        available (see getBookAiContext), which produces a far better
//        summary than guessing from the title alone.
const generateBookMetadata = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id).select('title author category subjects description readerUrl chapters sourceEtextNumber');

  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  const { textExcerpt, readerUrlSuggestion } = await getBookAiContext(book);

  try {
    const suggestion = await generateBookMetadataSuggestion({
      title: book.title,
      author: book.author,
      category: book.category,
      existingSubjects: book.subjects,
      existingDescription: book.description,
      textExcerpt,
    });
    if (readerUrlSuggestion) {
      suggestion.readerUrl = readerUrlSuggestion;
    }
    return success(res, 200, 'AI suggestion generated.', suggestion);
  } catch (error) {
    if (error instanceof OpenRouterConfigError) {
      return fail(res, 503, error.message);
    }
    return fail(res, 502, `Could not generate an AI suggestion: ${error.message}`);
  }
});

// @route POST /api/books/:id/view
// @desc  Records one real read/open of a book - anyone, including
//        anonymous visitors, counts. Fire-and-forget from the frontend the
//        moment a reader opens a book; this is what the Dashboard's "most
//        viewed" stat and each book's on-page view count are based on now,
//        replacing the old browser-only counter that reset on every reload
//        and never counted anyone else's visits.
const incrementBookViews = asyncHandler(async (req, res) => {
  const mongoose = require('mongoose');
  const filter = mongoose.Types.ObjectId.isValid(req.params.id)
    ? { _id: req.params.id }
    : { externalId: req.params.id };

  const book = await Book.findOneAndUpdate(
    filter,
    { $inc: { views: 1 } },
    { new: true, select: 'views' }
  );

  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  // Only signed-in readers count toward "Top readers" - identify (not
  // protect) is used on this route so anonymous views still bump the
  // book's own count above, they just don't attribute to anyone.
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { $inc: { booksReadCount: 1 } });
  }

  return success(res, 200, 'View recorded.', { views: book.views });
});

// @route GET /api/books/stats
// @desc  Admin Dashboard numbers: totals by status/contributor, the most
//        viewed books, and the most commented books. Real aggregates
//        straight from Mongo - nothing here is estimated or client-derived.
const getBookStats = asyncHandler(async (req, res) => {
  const Comment = require('../models/Comment');

  const [totalBooks, statusBreakdown, contributorBreakdown, mostViewed, mostCommentedRaw, mostActiveReadersRaw] = await Promise.all([
    Book.countDocuments({}),
    Book.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Book.aggregate([{ $group: { _id: '$createdByRole', count: { $sum: 1 } } }]),
    Book.find({}).select('title author views').sort({ views: -1 }).limit(5),
    Comment.aggregate([
      { $group: { _id: '$book', commentCount: { $sum: 1 } } },
      { $sort: { commentCount: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } },
      { $unwind: '$book' },
      { $project: { _id: 0, bookId: '$book._id', title: '$book.title', author: '$book.author', commentCount: 1 } },
    ]),
    User.find({ booksReadCount: { $gt: 0 } }).select('name email booksReadCount').sort({ booksReadCount: -1 }).limit(5),
  ]);

  const toCountMap = (rows) => rows.reduce((map, row) => ({ ...map, [row._id || 'unknown']: row.count }), {});

  return success(res, 200, 'Stats retrieved successfully.', {
    totalBooks,
    byStatus: toCountMap(statusBreakdown),
    byContributorRole: toCountMap(contributorBreakdown),
    mostViewed: mostViewed.map((book) => ({ id: book._id, title: book.title, author: book.author, views: book.views })),
    mostCommented: mostCommentedRaw,
    mostActiveReaders: mostActiveReadersRaw.map((user) => ({
      id: user._id,
      name: user.name,
      maskedEmail: maskEmail(user.email),
      booksReadCount: user.booksReadCount,
    })),
  });
});

// @route POST /api/books/ai-summary
// @desc  Universal AI book summary generator for readers, creators, and authors
const summarizeBook = asyncHandler(async (req, res) => {
  const { id, title, author, category, textExcerpt, existingDescription, chapters } = req.body;

  let resolvedTitle = (title || '').trim();
  let resolvedAuthor = (author || '').trim();
  let resolvedCategory = (category || '').trim();
  let resolvedDescription = (existingDescription || '').trim();
  let resolvedExcerpt = (textExcerpt || '').trim();
  let resolvedChapters = Array.isArray(chapters) ? chapters : [];

  if (id) {
    const book = await Book.findById(id).select('title author category subjects description readerUrl chapters sourceEtextNumber');
    if (book) {
      resolvedTitle = resolvedTitle || book.title;
      resolvedAuthor = resolvedAuthor || book.author;
      resolvedCategory = resolvedCategory || book.category;
      resolvedDescription = resolvedDescription || book.description;
      resolvedChapters = resolvedChapters.length ? resolvedChapters : (book.chapters || []);
      if (!resolvedExcerpt) {
        try {
          const { textExcerpt: bookExcerpt } = await getBookAiContext(book);
          resolvedExcerpt = bookExcerpt || '';
        } catch (_) {}
      }
    } else {
      const Content = require('../models/Content');
      const content = await Content.findById(id);
      if (content) {
        resolvedTitle = resolvedTitle || content.title;
        resolvedAuthor = resolvedAuthor || content.author;
        resolvedCategory = resolvedCategory || (content.categories?.[0] || content.type);
        resolvedDescription = resolvedDescription || content.description;
      }
    }
  }

  if (!resolvedTitle && !resolvedExcerpt && !resolvedChapters.length) {
    return fail(res, 400, 'Title, chapters, or text excerpt is required to generate a summary.');
  }

  try {
    const result = await generateBookSummary({
      title: resolvedTitle,
      author: resolvedAuthor,
      category: resolvedCategory,
      textExcerpt: resolvedExcerpt,
      existingDescription: resolvedDescription,
      chapters: resolvedChapters,
    });

    return success(res, 200, 'Summary generated successfully.', result);
  } catch (error) {
    return fail(res, 502, `Failed to generate summary: ${error.message}`);
  }
});

// @route POST /api/books/split-chapters
// @desc  Splits unstructured text or Gutenberg paragraphs into structured chapters
const splitChapters = asyncHandler(async (req, res) => {
  const { text, paragraphs, title } = req.body;

  let paragraphArray = [];
  if (Array.isArray(paragraphs) && paragraphs.length) {
    paragraphArray = paragraphs;
  } else if (typeof text === 'string' && text.trim()) {
    paragraphArray = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  }

  if (!paragraphArray.length) {
    return fail(res, 400, 'Text or paragraphs array is required.');
  }

  const chapters = splitParagraphsIntoChapters(paragraphArray, title || 'Book');
  return success(res, 200, 'Chapters split successfully.', { chapters, totalChapters: chapters.length });
});

module.exports = {
  createBook,
  listBooks,
  listCategories,
  listMyBooks,
  getBook,
  updateBook,
  updateMyBook,
  deleteMyBook,
  deleteBook,
  getBookReaderText,
  generateBookMetadata,
  incrementBookViews,
  getBookStats,
  listHotBooks,
  listRecommendedBooks,
  summarizeBook,
  splitChapters,
};
