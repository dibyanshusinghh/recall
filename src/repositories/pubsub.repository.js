'use strict';
const db = require('../config/db');

async function insertEvent(event) {
  const { messageId, eventType, resourceName, payload } = event;
  const { rows } = await db.query(
    `INSERT INTO recall.pubsub_events
       (id, message_id, event_type, resource_name, payload, status, received_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'received', now())
     RETURNING *`,
    [messageId, eventType || null, resourceName || null, payload ? JSON.stringify(payload) : null]
  );
  return rows[0];
}

async function findByMessageId(messageId) {
  const { rows } = await db.query(
    'SELECT * FROM recall.pubsub_events WHERE message_id = $1 LIMIT 1',
    [messageId]
  );
  return rows[0] || null;
}

async function updateStatus(id, status, errorMessage) {
  const { rows } = await db.query(
    `UPDATE recall.pubsub_events
     SET status        = $1,
         error_message = $2,
         processed_at  = CASE WHEN $1 IN ('processed', 'failed') THEN now() ELSE processed_at END
     WHERE id = $3
     RETURNING *`,
    [status, errorMessage || null, id]
  );
  return rows[0] || null;
}

module.exports = { insertEvent, findByMessageId, updateStatus };
