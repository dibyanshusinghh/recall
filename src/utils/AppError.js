'use strict';

/**
 * Base application error class.
 *
 * `isOperational` = true  → anticipated error (bad input, 404, auth failure).
 *   The error handler returns the message to the client.
 *
 * `isOperational` = false → programming / unexpected error.
 *   The error handler logs the full stack and returns a generic 500.
 */
class AppError extends Error {
  /**
   * @param {string} message    - Human-readable message (may be shown to client)
   * @param {number} statusCode - HTTP status code
   * @param {boolean} [isOperational=true]
   */
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
