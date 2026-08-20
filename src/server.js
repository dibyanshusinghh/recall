'use strict';
/**
 * server.js — process entry point.
 *
 * Load + validate environment variables FIRST (before any other require
 * that might touch process.env), then wire up the DB, Redis, BullMQ worker,
 * and Express listener.
 */
require('../instrument'); // Sentry must be initialised before any other import
require('./config/env');

const app = require('./app');
const { connectDb } = require('./config/db');
const { redis } = require('./config/redis');
const env = require('./config/env');
const logger = require('./utils/logger');

async function start() {
  // ── Verify DB reachability ─────────────────────────────────────────────────
  try {
    await connectDb();
    logger.info('Database connection verified');
  } catch (err) {
    logger.fatal({ err: err.message }, 'Cannot connect to database. Exiting.');
    process.exit(1);
  }

  // ── Start Tier 2 BullMQ worker (only if Workspace features are enabled) ────
  if (env.WORKSPACE_FEATURES_ENABLED) {
    const { startWorker } = require('./jobs/artifactFetch.worker');
    startWorker();
  }

  // ── Start HTTP server ─────────────────────────────────────────────────────
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, tier2: env.WORKSPACE_FEATURES_ENABLED },
      'Recall API server started'
    );
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    logger.info({ signal }, 'Shutdown signal received. Draining connections…');

    server.close(async () => {
      // Stop the BullMQ worker gracefully
      if (env.WORKSPACE_FEATURES_ENABLED) {
        const { stopWorker } = require('./jobs/artifactFetch.worker');
        await stopWorker().catch(() => {});
      }
      await redis.quit().catch(() => {});
      logger.info('Graceful shutdown complete.');
      process.exit(0);
    });

    // Force-kill after 15 s if connections don't drain
    setTimeout(() => {
      logger.error('Forceful shutdown after timeout.');
      process.exit(1);
    }, 15_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}

start();
