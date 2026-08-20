/**
 * instrument.js — Sentry initialization scaffold.
 *
 * Must be required FIRST in src/server.js before any other import so that
 * Sentry can instrument all modules correctly.
 *
 * When SENTRY_DSN is not set (local dev / CI), Sentry.init() is a no-op
 * and captureException() calls are silently discarded — the app runs normally.
 *
 * Customize this file with integrations, profiling, and release tracking as
 * needed; the scaffold below is intentionally minimal.
 */
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.2,
});

module.exports = Sentry;
