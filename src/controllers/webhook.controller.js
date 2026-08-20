'use strict';
const { OAuth2Client } = require('google-auth-library');
const pubsubRepo = require('../repositories/pubsub.repository');
const meetingRepo = require('../repositories/meeting.repository');
const { artifactFetchQueue } = require('../jobs/queues');
const env = require('../config/env');
const logger = require('../utils/logger');
const asyncHandler = require('../utils/asyncHandler');

const googleAuthClient = new OAuth2Client();

/**
 * Verify the OIDC Bearer token Google attaches to Pub/Sub push requests.
 * Google signs the token with its own keys; we verify the audience matches
 * our endpoint URL (GOOGLE_PUBSUB_AUDIENCE env var).
 *
 * @throws if token is invalid or audience doesn't match
 */
async function verifyPubSubToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }
  const token = authHeader.slice(7);
  const ticket = await googleAuthClient.verifyIdToken({
    idToken: token,
    audience: env.GOOGLE_PUBSUB_AUDIENCE,
  });
  return ticket.getPayload();
}

/**
 * POST /webhooks/pubsub/meeting-events
 *
 * Pub/Sub push receiver. Contract with Google:
 *  - Must return 2xx within a few hundred ms
 *  - Non-2xx or timeouts trigger redelivery with backoff
 *  - We deduplicate by message_id so redeliveries are safe
 *
 * This handler is only mounted when WORKSPACE_FEATURES_ENABLED=true.
 * If Tier 2 is disabled, app.js never registers this route, so this
 * code is unreachable in a Tier-1-only deployment.
 */
const handlePubSubPush = asyncHandler(async (req, res) => {
  // ── Verify OIDC token ─────────────────────────────────────────────────────
  try {
    await verifyPubSubToken(req.headers.authorization);
  } catch (err) {
    logger.warn({ err: err.message }, 'Pub/Sub OIDC token verification failed');
    // Return 401 — Google will retry; after max retries it gives up.
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  // ── Parse Pub/Sub envelope ────────────────────────────────────────────────
  const envelope = req.body;
  if (!envelope?.message) {
    logger.warn('Received Pub/Sub push without message field');
    return res.status(400).json({ status: 'error', message: 'Invalid Pub/Sub envelope' });
  }

  const { message } = envelope;
  const messageId = message.messageId || message.message_id;
  const publishTime = message.publishTime || message.publish_time;

  // Decode the base64 data payload
  let payload = {};
  try {
    const decoded = Buffer.from(message.data || '', 'base64').toString('utf8');
    payload = decoded ? JSON.parse(decoded) : {};
  } catch {
    logger.warn({ messageId }, 'Failed to decode Pub/Sub message data');
    // Still ack — malformed data should not cause infinite redelivery
    return res.status(200).json({ status: 'acked', reason: 'undecodable_payload' });
  }

  // ── Deduplicate ───────────────────────────────────────────────────────────
  const existing = await pubsubRepo.findByMessageId(messageId);
  if (existing) {
    // Already seen — ack immediately so Google stops redelivering
    return res.status(200).json({ status: 'acked', reason: 'duplicate' });
  }

  // ── Persist Pub/Sub event record ─────────────────────────────────────────
  const resourceName = payload.resourceName || payload.resource_name || null;
  const eventType = payload.eventType || message.attributes?.eventType || null;

  const eventRecord = await pubsubRepo.insertEvent({
    messageId,
    eventType,
    resourceName,
    payload,
  });

  // ── Resolve organizer for the conference record ───────────────────────────
  // The Pub/Sub payload includes a conference record resource name like
  // "conferenceRecords/abc123". We map that to an organizer via meet_space_id.
  let organizerId = null;
  if (resourceName) {
    const spaceId = resourceName.split('/').pop();
    const meeting = await meetingRepo.findByGoogleEventId(spaceId).catch(() => null)
      || (await db_query_helper(spaceId));
    if (meeting) organizerId = meeting.organizer_id;
  }

  // ── Enqueue BullMQ job ────────────────────────────────────────────────────
  // Do not await — enqueue and return 200 fast
  await artifactFetchQueue.add('fetchArtifacts', {
    pubsubEventId: eventRecord.id,
    messageId,
    conferenceRecordId: resourceName,
    organizerId,
    resourceName,
    eventType,
    publishTime,
  });

  logger.info({ messageId, eventType, resourceName }, 'Pub/Sub event received and enqueued');

  // ── Acknowledge ───────────────────────────────────────────────────────────
  // Return 200 to Google within the timeout window
  res.status(200).json({ status: 'acked' });
});

// Tiny helper to query by meet_space_id without creating a circular dep
async function db_query_helper(spaceId) {
  const db = require('../config/db');
  const { rows } = await db.query(
    'SELECT * FROM recall.meetings WHERE meet_space_id = $1 LIMIT 1',
    [spaceId]
  );
  return rows[0] || null;
}

module.exports = { handlePubSubPush };
