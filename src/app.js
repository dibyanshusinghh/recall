'use strict';
/**
 * app.js — Express application factory.
 *
 * Assumes `require('./config/env')` has already been called in server.js
 * before this module is imported, so all env vars are validated.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { requestId } = require('./middleware/requestId');
const { httpLogger } = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');
const env = require('./config/env');

// ─── Routes ───────────────────────────────────────────────────────────────────
const authRoutes         = require('./routes/auth.routes');
const meetingRoutes      = require('./routes/meeting.routes');
const availabilityRoutes = require('./routes/availability.routes');
const slotRoutes         = require('./routes/slot.routes');
const webhookRoutes      = require('./routes/webhook.routes');
const searchRoutes       = require('./routes/search.routes');

const app = express();

// ─── Security & compression ───────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));
app.use(compression());

// ─── Request ID + structured HTTP logging ─────────────────────────────────────
// requestId must come before httpLogger so req.id is available to pino-http
app.use(requestId);
app.use(httpLogger);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/auth',      authRoutes);
app.use('/meetings',  meetingRoutes);
app.use('/users',     availabilityRoutes);
app.use('/slots',     slotRoutes);
app.use('/webhooks',  webhookRoutes);
app.use('/search',    searchRoutes);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found.`, 404));
});

// ─── Central error handler (must be last) ────────────────────────────────────
app.use(errorHandler);

module.exports = app;
