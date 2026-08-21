'use strict';
const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../config/redis');
const pubsubRepo = require('../repositories/pubsub.repository');
const artifactService = require('../services/artifact.service');
const { PUBSUB_STATUS } = require('../constants');
const logger = require('../utils/logger');

/**
 * BullMQ worker for Tier 2 artifact fetching.
 *
 * Each job payload (set by the Pub/Sub webhook controller) has the shape:
 * {
 *   pubsubEventId:      string  (recall.pubsub_events.id)
 *   messageId:          string
 *   conferenceRecordId: string  (Google Meet resource name)
 *   organizerId:        string  (recall.users.id)
 *   resourceName:       string
 *   eventType:          string
 * }
 *
 * BullMQ handles retries/backoff (configured in queues.js).
 * This worker must NEVER throw uncaught exceptions — all errors are caught,
 * logged, and recorded in the DB so Tier 1 routes are never affected.
 */

let workerInstance = null;

function startWorker() {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(
    'artifactFetch',
    async (job) => {
      const { pubsubEventId, conferenceRecordId, organizerId, messageId } = job.data;

      const jobLog = logger.child({ jobId: job.id, messageId, conferenceRecordId });
      jobLog.info('Artifact fetch job started');

      // Mark Pub/Sub event as processing
      await pubsubRepo.updateStatus(pubsubEventId, PUBSUB_STATUS.PROCESSING).catch(() => {});

      try {
        // Fetch all available artifacts from Google APIs
        const results = await artifactService.fetchArtifacts(conferenceRecordId, organizerId);
        jobLog.info({ results }, 'Artifact fetch completed');

        await pubsubRepo.updateStatus(pubsubEventId, PUBSUB_STATUS.PROCESSED);
      } catch (err) {
        jobLog.error({ err: err.message }, 'Artifact fetch failed');

        await pubsubRepo
          .updateStatus(pubsubEventId, PUBSUB_STATUS.FAILED, err.message)
          .catch(() => {});

        // Re-throw so BullMQ records the failure and applies retry backoff
        throw err;
      }
    },
    {
      connection: createBullMQConnection(),
      concurrency: 3,
      // Graceful shutdown: finish current jobs before stopping
      autorun: true,
    }
  );

  workerInstance.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message, attempts: job?.attemptsMade },
      'Artifact fetch job permanently failed'
    );
  });

  workerInstance.on('error', (err) => {
    // Worker-level errors (connection issues, etc.) — log and continue
    logger.error({ err: err.message }, 'BullMQ worker error');
  });

  logger.info('Artifact fetch BullMQ worker started');
  return workerInstance;
}

async function stopWorker() {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
}

module.exports = { startWorker, stopWorker };
