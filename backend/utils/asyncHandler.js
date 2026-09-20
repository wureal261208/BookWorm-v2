function asyncHandler(fn) {
  return function (req, res, next) {
    // Return the promise as well: Express safely ignores it, while tests and
    // serverless adapters can reliably wait for controller completion.
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
