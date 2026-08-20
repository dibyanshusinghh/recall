'use strict';
const Redis = require('ioredis');
const env = require('./env');

/**
 * General-purpose Redis client.
 * Used for slot holds, rate limiting, and other non-BullMQ operations.
 */
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3_000),
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.info('[Redis] Connected');
});

/**
 * Create a new ioredis connection configured specifically for BullMQ.
 * BullMQ requires maxRetriesPerRequest: null and its own dedicated connection
 * — do NOT share the general `redis` instance with BullMQ.
 */
function createBullMQConnection() {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 100, 3_000),
  });
}

module.exports = { redis, createBullMQConnection };
