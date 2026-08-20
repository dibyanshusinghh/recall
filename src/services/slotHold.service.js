'use strict';
const { randomUUID } = require('crypto');
const { redis } = require('../config/redis');
const env = require('../config/env');
const AppError = require('../utils/AppError');

/**
 * Redis key for a slot hold.
 * Encodes organizer + start/end so holds are slot-specific.
 * ISO strings are URL-safe (colons are OK in Redis keys).
 */
function holdKey(organizerId, startTime, endTime) {
  return `slot_hold:${organizerId}:${startTime}:${endTime}`;
}

/**
 * Create a slot hold in Redis using SET NX EX.
 * Returns the hold object if successful, or throws if the slot is already held.
 *
 * @param {string} organizerId
 * @param {string} startTime  - ISO 8601 UTC string
 * @param {string} endTime    - ISO 8601 UTC string
 * @returns {{ holdId: string, organizerId: string, startTime: string, endTime: string, expiresIn: number }}
 */
async function createHold(organizerId, startTime, endTime) {
  const holdId = randomUUID();
  const ttl = env.SLOT_HOLD_TTL_SECONDS;
  const key = holdKey(organizerId, startTime, endTime);

  const value = JSON.stringify({ holdId, organizerId, startTime, endTime });

  // NX = only set if key does not exist; EX = expire in ttl seconds
  const result = await redis.set(key, value, 'NX', 'EX', ttl);

  if (result === null) {
    throw new AppError(
      'This slot is already held. Try a different time or wait for the hold to expire.',
      409
    );
  }

  return { holdId, organizerId, startTime, endTime, expiresIn: ttl };
}

/**
 * Validate that a hold exists and belongs to the correct organizer.
 * Returns the hold data, or throws.
 *
 * @param {string} holdId
 * @param {string} organizerId
 * @param {string} startTime
 * @param {string} endTime
 */
async function validateHold(holdId, organizerId, startTime, endTime) {
  const key = holdKey(organizerId, startTime, endTime);
  const raw = await redis.get(key);

  if (!raw) {
    throw new AppError('Slot hold expired or not found. Please create a new hold.', 409);
  }

  const hold = JSON.parse(raw);
  if (hold.holdId !== holdId) {
    throw new AppError('Hold ID mismatch. This slot hold does not belong to you.', 403);
  }

  return hold;
}

/**
 * Release a slot hold immediately (e.g. after a successful booking).
 * Silent if the key no longer exists (already expired or released).
 */
async function releaseHold(organizerId, startTime, endTime) {
  const key = holdKey(organizerId, startTime, endTime);
  await redis.del(key);
}

/**
 * Release a hold by holdId.
 * Requires the caller to supply the same startTime/endTime used during createHold.
 */
async function releaseHoldById(holdId, organizerId, startTime, endTime) {
  const key = holdKey(organizerId, startTime, endTime);
  const raw = await redis.get(key);

  if (!raw) return; // already expired — no-op

  const hold = JSON.parse(raw);
  if (hold.holdId !== holdId) {
    throw new AppError('Cannot release a hold that does not belong to you.', 403);
  }

  await redis.del(key);
}

module.exports = { createHold, validateHold, releaseHold, releaseHoldById };
