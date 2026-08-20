'use strict';

/**
 * Wraps an async route handler so that any rejected promise is forwarded
 * to Express's next(err) rather than causing an unhandled rejection.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 *
 * @param {(req, res, next) => Promise<any>} fn
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
