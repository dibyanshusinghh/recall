'use strict';
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redis } = require('../config/redis');

/**
 * Factory for a per-user Redis-backed rate limiter.
 *
 * When the request carries an authenticated user (req.user.id set by the
 * authenticate middleware), limits are keyed by user ID — immune to IP
 * rotation. For unauthenticated requests (e.g. public endpoints), we fall
 * back to IP using express-rate-limit's ipKeyGenerator() helper which
 * normalises IPv6 addresses correctly.
 *
 * @param {object} opts
 * @param {number}  opts.windowMs      - Time window in milliseconds
 * @param {number}  opts.max           - Max requests per window per key
 * @param {string}  [opts.keyPrefix]   - Redis key prefix to namespace limits
 * @param {string}  [opts.message]     - Error message returned on rate limit
 */
function createRateLimiter({ windowMs, max, keyPrefix = 'rl', message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Use ipKeyGenerator for the IP fallback path so that IPv6 addresses are
    // normalised (e.g. ::ffff:127.0.0.1 → 127.0.0.1) and cannot be used to
    // bypass rate limits by rotating between IPv4-mapped IPv6 representations.
    keyGenerator: (req) => {
      if (req.user?.id) return `${keyPrefix}:user:${req.user.id}`;
      return `${keyPrefix}:ip:${ipKeyGenerator(req)}`;
    },
    handler: (_req, res) => {
      res.status(429).json({
        status: 'error',
        message: message || 'Too many requests. Please slow down.',
      });
    },
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
    }),
  });
}

// Applied to POST /meetings, PATCH /meetings/:id/reschedule, DELETE /meetings/:id
const bookingLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1_000, // 1 hour
  max: 30,
  keyPrefix: 'rl:booking',
  message: 'Too many booking requests this hour. Please try again later.',
});

// Applied to slot hold endpoints
const slotHoldLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1_000, // 15 minutes
  max: 60,
  keyPrefix: 'rl:slot',
  message: 'Too many slot hold requests. Please slow down.',
});

// General API limiter (can be applied globally or per-route)
const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1_000,
  max: 200,
  keyPrefix: 'rl:general',
});

module.exports = { bookingLimiter, slotHoldLimiter, generalLimiter, createRateLimiter };
