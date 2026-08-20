'use strict';
const swaggerJsdoc = require('swagger-jsdoc');
const schemas = require('./schemas');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Recall API',
      version: '1.0.0',
      description:
        'Book and manage meetings via Google Calendar (with native Google email notifications).\n\n' +
        'When the connected Google account has **Workspace with Gemini** enabled, Recall also ' +
        'syncs AI-generated recordings, transcripts, and summaries from Google Meet, Drive, and ' +
        'Docs via Pub/Sub — full-text searchable via PostgreSQL tsvector.\n\n' +
        '### Tier architecture\n' +
        '**Tier 1 (always works):** OAuth, booking, rescheduling, cancellation, availability, slot holds.\n\n' +
        '**Tier 2 (Workspace-gated):** Pub/Sub webhook, artifact fetch, transcripts, summaries, search. ' +
        'Tier 2 endpoints return `{ status: "unavailable" }` (not an error) when ' +
        '`WORKSPACE_FEATURES_ENABLED=false`.',
      contact: { name: 'Recall API' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local dev' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'HS256 JWT issued by the `/auth/google/callback` flow. ' +
            'The Notify Spring Boot service can verify these tokens using the same `JWT_SECRET`.',
        },
      },
      schemas,
    },
  },
  // Pull @openapi JSDoc annotations from all route files
  apis: ['./src/routes/**/*.js'],
};

module.exports = swaggerJsdoc(options);
