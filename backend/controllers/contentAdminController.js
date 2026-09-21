const Content = require('../models/Content');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

const VALID_STATUSES = ['draft', 'published', 'hidden'];

// Unlike the public GET /api/content (controllers/contentController.js),
// this sees every status - an admin needs to find drafts/hidden items to
// act on them, not just what's already live.
const listContentForAdmin = asyncHandler(async (req, res) => {
  const { type, category, author, status, search } = req.query;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const filter = {};
  if (type === 'ebook' || type === 'audiobook') filter.type = type;
  if (category) filter.categories = category;
  if (author) filter.author = { $regex: author, $options: 'i' };
  if (status && VALID_STATUSES.includes(status)) filter.status = status;
  if (search) filter.$text = { $search: search };

  const [items, total] = await Promise.all([
    Content.find(filter)
      .sort(search ? { score: { $meta: 'textScore' } } : { updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Content.countDocuments(filter),
  ]);

  return success(res, 200, 'Content fetched for admin.', { items, total, page, limit });
});

const getContentDetail = asyncHandler(async (req, res) => {
  const item = await Content.findById(req.params.id).lean();
  if (!item) return fail(res, 404, 'Content not found.');
  return success(res, 200, 'Content detail fetched.', item);
});

// "Publish" / "Hide" from the admin table both land here with a different
// body.status - there's no separate approve/reject action because
// draft/published/hidden already covers both "not reviewed yet" and
// "reviewed and taken down".
const updateContentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const item = await Content.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!item) return fail(res, 404, 'Content not found.');

  return success(res, 200, `Status updated to ${status}.`, item);
});

const getContentStats = asyncHandler(async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [total, byStatusRaw, byTypeRaw, byCategoryRaw, updatedToday] = await Promise.all([
    Content.countDocuments({}),
    Content.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Content.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
    Content.aggregate([
      { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    Content.countDocuments({ updatedAt: { $gte: startOfToday } }),
  ]);

  const byStatus = { draft: 0, published: 0, hidden: 0 };
  byStatusRaw.forEach((entry) => {
    if (entry._id in byStatus) byStatus[entry._id] = entry.count;
  });

  const byType = { ebook: 0, audiobook: 0 };
  byTypeRaw.forEach((entry) => {
    if (entry._id in byType) byType[entry._id] = entry.count;
  });

  return success(res, 200, 'Content stats fetched.', {
    total,
    byStatus,
    byType,
    byCategory: byCategoryRaw.map((entry) => ({ category: entry._id, count: entry.count })),
    updatedToday,
  });
});

module.exports = { listContentForAdmin, getContentDetail, updateContentStatus, getContentStats };
