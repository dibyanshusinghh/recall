'use strict';
const { Queue } = require('bullmq');
const { createBullMQConnection } = require('../config/redis');

/**
 * BullMQ queue for Tier 2 artifact fetch jobs.
 *
 * Jobs are enqueued by the Pub/Sub webhook receiver (Step 13) and consumed
 * by the artifactFetch.worker (Step 14).
 *
 * This queue uses its own dedicated ioredis connection (see config/redis.js).
 * Do NOT share this connection with the general redis client.
 *
 * Only used when WORKSPACE_FEATURES_ENABLED=true, but the queue object is
 * always importable — it will just never receive jobs when Tier 2 is off.
 */
const artifactFetchQueue = new Queue('artifactFetch', {
  connection: createBullMQConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5_000, // 5s initial delay, doubles each retry
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

module.exports = { artifactFetchQueue };
