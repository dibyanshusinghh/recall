'use strict';
const db = require('../config/db');

async function getRulesByUser(userId) {
  const { rows } = await db.query(
    `SELECT * FROM recall.availability_rules
     WHERE user_id = $1
     ORDER BY day_of_week, start_time`,
    [userId]
  );
  return rows;
}

/**
 * Replace all availability rules for a user atomically.
 * Deletes existing rules then bulk-inserts the new ones inside the
 * caller-provided transaction client.
 */
async function replaceRules(client, userId, rules) {
  await client.query(
    'DELETE FROM recall.availability_rules WHERE user_id = $1',
    [userId]
  );

  if (!rules || rules.length === 0) return [];

  const placeholders = rules.map(
    (_, i) => `(gen_random_uuid(), $1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4}, now())`
  );
  const params = [userId, ...rules.flatMap((r) => [r.dayOfWeek, r.startTime, r.endTime])];

  const { rows } = await client.query(
    `INSERT INTO recall.availability_rules
       (id, user_id, day_of_week, start_time, end_time, created_at)
     VALUES ${placeholders.join(', ')}
     RETURNING *`,
    params
  );
  return rows;
}

module.exports = { getRulesByUser, replaceRules };
