'use strict';
const db = require('../config/db');

/**
 * Full-text search against recall.transcripts, scoped to organizer.
 * Ranked by ts_rank (most relevant first).
 *
 * @param {string} q        - Search query string (plainto_tsquery safe)
 * @param {string} userId   - Organizer ID to scope results
 * @param {number} limit
 * @param {number} offset
 */
async function searchTranscripts(q, userId, limit = 20, offset = 0) {
  const { rows } = await db.query(
    `SELECT t.id, t.meeting_id, t.content, t.created_at,
            ts_rank(t.search_vector, query) AS rank,
            m.title AS meeting_title, m.start_time
     FROM recall.transcripts t
     JOIN recall.meetings m ON m.id = t.meeting_id,
     plainto_tsquery('english', $1) AS query
     WHERE t.search_vector @@ query
       AND m.organizer_id = $2
     ORDER BY rank DESC, t.created_at DESC
     LIMIT $3 OFFSET $4`,
    [q, userId, limit, offset]
  );
  return rows;
}

/**
 * Full-text search against recall.summaries, scoped to organizer.
 */
async function searchSummaries(q, userId, limit = 20, offset = 0) {
  const { rows } = await db.query(
    `SELECT s.id, s.meeting_id, s.content, s.source, s.created_at,
            ts_rank(s.search_vector, query) AS rank,
            m.title AS meeting_title, m.start_time
     FROM recall.summaries s
     JOIN recall.meetings m ON m.id = s.meeting_id,
     plainto_tsquery('english', $1) AS query
     WHERE s.search_vector @@ query
       AND m.organizer_id = $2
     ORDER BY rank DESC, s.created_at DESC
     LIMIT $3 OFFSET $4`,
    [q, userId, limit, offset]
  );
  return rows;
}

module.exports = { searchTranscripts, searchSummaries };
