'use strict';
const AppError = require('../utils/AppError');
const { verifyToken } = require('../services/auth.service');

/**
 * Verifies the Bearer JWT in the Authorization header.
 * On success, attaches req.user = { id, email } for downstream handlers.
 *
 * JWT algorithm: HS256 with JWT_SECRET.
 * The Notify Spring Boot service can verify the same token using:
 *   - Shared secret: process.env.JWT_SECRET
 *   - Algorithm: HS256
 * See auth.service.js signAccessToken() for the full compatibility note.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Provide a Bearer token.', 401));
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    // Guard against using a refresh token as an access token
    if (payload.type === 'refresh') {
      return next(new AppError('Cannot use a refresh token for API access.', 401));
    }
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Access token has expired. Please refresh.', 401));
    }
    return next(new AppError('Invalid access token.', 401));
  }
}

module.exports = authenticate;
