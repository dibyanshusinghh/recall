'use strict';
const logger = require('../utils/logger');

/**
 * Central Express error-handling middleware.
 * Must be the LAST middleware registered in app.js.
 *
 * Distinguishes:
 *  - Operational errors (AppError.isOperational = true): expected conditions
 *    (validation failures, 404s, auth errors). Returns the message to the client.
 *  - Programming errors (unexpected): logs the full stack, returns a generic 500.
 *    Never leak internal details in production.
 *
 * Also handles common third-party error shapes (Joi, pg, googleapis).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // ── Normalise known third-party errors ─────────────────────────────────────

  // Joi validation error (from middleware/validate.js re-throwing as AppError,
  // but guard here in case it propagates raw)
  if (err.isJoi) {
    return res.status(400).json({
      status: 'error',
      message: err.details?.[0]?.message || 'Validation error',
    });
  }

  // PostgreSQL unique-violation (23505)
  if (err.code === '23505') {
    return res.status(409).json({
      status: 'error',
      message: 'A record with that value already exists.',
    });
  }

  // PostgreSQL foreign-key violation (23503)
  if (err.code === '23503') {
    return res.status(409).json({
      status: 'error',
      message: 'Referenced resource does not exist.',
    });
  }

  // JSON parse error (malformed request body)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      status: 'error',
      message: 'Malformed JSON in request body.',
    });
  }

  // ── AppError (operational) ─────────────────────────────────────────────────
  if (err.isOperational) {
    return res.status(err.statusCode || 500).json({
      status: 'error',
      message: err.message,
    });
  }

  // ── Unexpected / programming error ─────────────────────────────────────────
  const log = req.log || logger;
  log.error({ err, reqId: req.id }, 'Unhandled error');

  return res.status(500).json({
    status: 'error',
    message: 'An unexpected error occurred. Please try again later.',
  });
}

module.exports = errorHandler;
