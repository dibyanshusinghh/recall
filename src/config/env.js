'use strict';
require('dotenv').config();

const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const WORKSPACE_FEATURES_ENABLED = process.env.WORKSPACE_FEATURES_ENABLED === 'true';

if (WORKSPACE_FEATURES_ENABLED) {
  const workspaceRequired = ['GOOGLE_PROJECT_ID', 'PUBSUB_TOPIC_NAME', 'GOOGLE_PUBSUB_AUDIENCE'];
  for (const key of workspaceRequired) {
    if (!process.env[key]) {
      throw new Error(
        `WORKSPACE_FEATURES_ENABLED=true but missing required variable: ${key}`
      );
    }
  }
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',

  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,

  WORKSPACE_FEATURES_ENABLED,
  GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID,
  PUBSUB_TOPIC_NAME: process.env.PUBSUB_TOPIC_NAME || 'meeting-events',
  PUBSUB_SUBSCRIPTION_NAME: process.env.PUBSUB_SUBSCRIPTION_NAME,
  GOOGLE_PUBSUB_AUDIENCE: process.env.GOOGLE_PUBSUB_AUDIENCE,

  SLOT_HOLD_TTL_SECONDS: parseInt(process.env.SLOT_HOLD_TTL_SECONDS, 10) || 600,

  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3001',

  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
};
