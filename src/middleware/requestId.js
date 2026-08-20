'use strict';
const { randomUUID } = require('crypto');

/**
 * Assigns a UUID to each incoming request as req.id.
 * Reads X-Request-ID from the client first (useful for tracing
 * across services), falling back to a freshly generated UUID.
 * The id is also echoed back in the response header.
 */
function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

module.exports = { requestId };
