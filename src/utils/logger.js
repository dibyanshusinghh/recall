'use strict';
const pino = require('pino');
const pinoHttp = require('pino-http');

const isDev = (process.env.NODE_ENV || 'development') === 'development';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  ...(!isDev && {
    // Structured JSON in production
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
});

/**
 * pino-http middleware.
 * Attaches req.log (child logger with request-id) and logs every
 * HTTP request/response automatically.
 */
const httpLogger = pinoHttp({
  logger,
  // Use the request-id already attached by the requestId middleware
  genReqId: (req) => req.id,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

module.exports = logger;
module.exports.httpLogger = httpLogger;
