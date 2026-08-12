const { fail } = require('../utils/response');

function notFound(req, res) {
  return fail(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return fail(res, 409, `This ${field} is already in use.`);
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join(' ');
    return fail(res, 400, message || 'Invalid input data.');
  }

  if (err.name === 'CastError') {
    return fail(res, 400, 'Invalid identifier supplied.');
  }

  const statusCode = err.statusCode || 500;
  return fail(res, statusCode, err.message || 'Something went wrong on the server.');
}

module.exports = { notFound, errorHandler };
