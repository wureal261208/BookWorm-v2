const Book = require('../models/Book');
const Rental = require('../models/Rental');
const asyncHandler = require('../utils/asyncHandler');
const { success, fail } = require('../utils/response');

const DEFAULT_RENTAL_DAYS = 14;

// @route POST /api/rentals
// @desc  Customer rents a book. Anonymous and staff-only accounts cannot rent.
const rentBook = asyncHandler(async (req, res) => {
  const { bookId, days } = req.body;

  if (!bookId) {
    return fail(res, 400, 'bookId is required.');
  }

  const book = await Book.findById(bookId);
  if (!book) {
    return fail(res, 404, 'Book not found.');
  }

  if (!book.isAvailableToRent) {
    return fail(res, 400, 'This book is not available for rent.');
  }

  if (book.availableCopies < 1) {
    return fail(res, 400, 'No copies of this book are currently available.');
  }

  const rentalDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_RENTAL_DAYS;
  const dueDate = new Date(Date.now() + rentalDays * 24 * 60 * 60 * 1000);

  const rental = await Rental.create({
    book: book._id,
    customer: req.user._id,
    dueDate,
  });

  book.availableCopies -= 1;
  await book.save();

  return success(res, 201, 'Book rented successfully.', { rental });
});

// @route GET /api/rentals/mine
const getMyRentals = asyncHandler(async (req, res) => {
  const rentals = await Rental.find({ customer: req.user._id })
    .populate('book', 'title author coverUrl')
    .sort({ createdAt: -1 });

  return success(res, 200, 'Your rentals were retrieved successfully.', { rentals });
});

// @route PATCH /api/rentals/:id/return
const returnBook = asyncHandler(async (req, res) => {
  const rental = await Rental.findById(req.params.id);

  if (!rental) {
    return fail(res, 404, 'Rental not found.');
  }

  if (String(rental.customer) !== String(req.user._id)) {
    return fail(res, 403, 'You can only return your own rentals.');
  }

  if (rental.status === 'returned') {
    return fail(res, 400, 'This rental has already been returned.');
  }

  rental.status = 'returned';
  rental.returnedAt = new Date();
  await rental.save();

  await Book.findByIdAndUpdate(rental.book, { $inc: { availableCopies: 1 } });

  return success(res, 200, 'Book returned successfully.', { rental });
});

module.exports = { rentBook, getMyRentals, returnBook };
