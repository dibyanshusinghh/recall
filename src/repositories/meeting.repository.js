'use strict';
const db = require('../config/db');

async function create(client, meeting) {
  const {
    organizerId,
    googleEventId,
    googleCalendarId,
    recurringEventId,
    rrule,
    isRecurring,
    title,
    description,
    startTime,
    endTime,
    timezone,
    meetLink,
    meetSpaceId,
    status,
  } = meeting;

  const { rows } = await client.query(
    `INSERT INTO recall.meetings
       (id, organizer_id, google_event_id, google_calendar_id, recurring_event_id,
        rrule, is_recurring, title, description, start_time, end_time, timezone,
        meet_link, meet_space_id, status, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, now(), now())
     RETURNING *`,
    [
      organizerId, googleEventId, googleCalendarId, recurringEventId || null,
      rrule || null, isRecurring || false, title, description || null,
      startTime, endTime, timezone,
      meetLink || null, meetSpaceId || null, status || 'scheduled',
    ]
  );
  return rows[0];
}

async function createGuests(client, meetingId, guests) {
  if (!guests || guests.length === 0) return [];
  const values = guests
    .map((g, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, gen_random_uuid())`)
    .join(', ');
  const params = guests.flatMap((g) => [meetingId, g.email, g.name || null]);
  const { rows } = await client.query(
    `INSERT INTO recall.meeting_guests (meeting_id, email, name, id) VALUES ${values} RETURNING *`,
    params
  );
  return rows;
}

async function insertStatusHistory(client, { meetingId, fromStatus, toStatus, reason }) {
  const { rows } = await client.query(
    `INSERT INTO recall.meeting_status_history
       (id, meeting_id, from_status, to_status, reason, changed_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
     RETURNING *`,
    [meetingId, fromStatus || null, toStatus, reason || null]
  );
  return rows[0];
}

async function updateMeeting(client, id, fields) {
  const sets = [];
  const params = [];
  let idx = 1;

  const allowed = [
    'startTime', 'endTime', 'timezone', 'status', 'title', 'description',
    'meetLink', 'meetSpaceId', 'googleEventId',
  ];
  const colMap = {
    startTime: 'start_time',
    endTime: 'end_time',
    timezone: 'timezone',
    status: 'status',
    title: 'title',
    description: 'description',
    meetLink: 'meet_link',
    meetSpaceId: 'meet_space_id',
    googleEventId: 'google_event_id',
  };

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${colMap[key]} = $${idx}`);
      params.push(fields[key]);
      idx++;
    }
  }

  sets.push(`updated_at = now()`);
  params.push(id);

  const { rows } = await client.query(
    `UPDATE recall.meetings SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT m.*,
       json_agg(DISTINCT jsonb_build_object(
         'id', mg.id, 'email', mg.email, 'name', mg.name,
         'responseStatus', mg.response_status
       )) FILTER (WHERE mg.id IS NOT NULL) AS guests
     FROM recall.meetings m
     LEFT JOIN recall.meeting_guests mg ON mg.meeting_id = m.id
     WHERE m.id = $1
     GROUP BY m.id`,
    [id]
  );
  return rows[0] || null;
}

async function findByGoogleEventId(googleEventId) {
  const { rows } = await db.query(
    'SELECT * FROM recall.meetings WHERE google_event_id = $1 LIMIT 1',
    [googleEventId]
  );
  return rows[0] || null;
}

async function list({ status, from, to, organizerId, limit, offset }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (organizerId) { conditions.push(`m.organizer_id = $${idx++}`); params.push(organizerId); }
  if (status)      { conditions.push(`m.status = $${idx++}`);       params.push(status); }
  if (from)        { conditions.push(`m.start_time >= $${idx++}`);   params.push(from); }
  if (to)          { conditions.push(`m.end_time   <= $${idx++}`);   params.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT m.*,
       json_agg(DISTINCT jsonb_build_object(
         'id', mg.id, 'email', mg.email, 'name', mg.name,
         'responseStatus', mg.response_status
       )) FILTER (WHERE mg.id IS NOT NULL) AS guests
     FROM recall.meetings m
     LEFT JOIN recall.meeting_guests mg ON mg.meeting_id = m.id
     ${where}
     GROUP BY m.id
     ORDER BY m.start_time ASC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );
  return rows;
}

module.exports = {
  create,
  createGuests,
  insertStatusHistory,
  updateMeeting,
  findById,
  findByGoogleEventId,
  list,
};
