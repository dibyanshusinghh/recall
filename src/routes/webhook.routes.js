'use strict';
const express = require('express');
const router = express.Router();
const webhookCtrl = require('../controllers/webhook.controller');
const env = require('../config/env');

/**
 * @openapi
 * /webhooks/pubsub/meeting-events:
 *   post:
 *     summary: Google Pub/Sub push endpoint for Meet conference events (Tier 2)
 *     description: >
 *       Receives Pub/Sub push notifications from the `meeting-events` topic
 *       when a Google Meet conference ends and artifacts become available.
 *
 *       **This route is only registered when `WORKSPACE_FEATURES_ENABLED=true`.**
 *       It returns 404 in a Tier-1-only deployment.
 *
 *       Authentication: Google attaches a Bearer OIDC token in the
 *       `Authorization` header. The token is verified against Google's public
 *       keys with the audience set to `GOOGLE_PUBSUB_AUDIENCE`. Client-side
 *       JWTs are NOT used on this endpoint.
 *
 *       The handler acknowledges (200) within a few hundred ms and enqueues
 *       a BullMQ job for heavy processing. Duplicate `message_id` values are
 *       acknowledged immediately without re-processing.
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Standard Pub/Sub push envelope.
 *             properties:
 *               message:
 *                 type: object
 *                 properties:
 *                   messageId:
 *                     type: string
 *                   data:
 *                     type: string
 *                     description: Base64-encoded JSON payload.
 *                   publishTime:
 *                     type: string
 *                     format: date-time
 *                   attributes:
 *                     type: object
 *                     additionalProperties:
 *                       type: string
 *               subscription:
 *                 type: string
 *     responses:
 *       200:
 *         description: Acknowledged (event received, deduplicated, or undecodable payload).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [acked]
 *                 reason:
 *                   type: string
 *                   enum: [duplicate, undecodable_payload]
 *                   description: Present only for acked-without-processing cases.
 *       400:
 *         description: Missing Pub/Sub message field.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: OIDC token missing or failed verification.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
if (env.WORKSPACE_FEATURES_ENABLED) {
  router.post('/pubsub/meeting-events', webhookCtrl.handlePubSubPush);
}

module.exports = router;
