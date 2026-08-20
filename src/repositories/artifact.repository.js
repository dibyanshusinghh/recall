'use strict';
const db = require('../config/db');

async function createArtifact(client, artifact) {
  const { meetingId, conferenceRecordId, type, driveFileId, docsFileId, status } = artifact;
  const { rows } = await client.query(
    `INSERT INTO recall.meeting_artifacts
       (id, meeting_id, conference_record_id, type, drive_file_id, docs_file_id, status, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now())
     RETURNING *`,
    [meetingId, conferenceRecordId || null, type, driveFileId || null, docsFileId || null, status || 'pending']
  );
  return rows[0];
}

async function updateArtifactStatus(id, status, fetchedAt) {
  const { rows } = await db.query(
    `UPDATE recall.meeting_artifacts
     SET status = $1, fetched_at = $2
     WHERE id = $3
     RETURNING *`,
    [status, fetchedAt || null, id]
  );
  return rows[0] || null;
}

async function getArtifactsByMeeting(meetingId) {
  const { rows } = await db.query(
    'SELECT * FROM recall.meeting_artifacts WHERE meeting_id = $1 ORDER BY created_at DESC',
    [meetingId]
  );
  return rows;
}

async function insertTranscript(client, { meetingId, artifactId, content }) {
  const { rows } = await client.query(
    `INSERT INTO recall.transcripts (id, meeting_id, artifact_id, content, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, now())
     RETURNING *`,
    [meetingId, artifactId || null, content]
  );
  return rows[0];
}

async function insertSummary(client, { meetingId, artifactId, content, source }) {
  const { rows } = await client.query(
    `INSERT INTO recall.summaries (id, meeting_id, artifact_id, content, source, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
     RETURNING *`,
    [meetingId, artifactId || null, content, source || 'gemini_native']
  );
  return rows[0];
}

async function getTranscriptByMeeting(meetingId) {
  const { rows } = await db.query(
    'SELECT * FROM recall.transcripts WHERE meeting_id = $1 ORDER BY created_at DESC LIMIT 1',
    [meetingId]
  );
  return rows[0] || null;
}

async function getSummaryByMeeting(meetingId) {
  const { rows } = await db.query(
    'SELECT * FROM recall.summaries WHERE meeting_id = $1 ORDER BY created_at DESC LIMIT 1',
    [meetingId]
  );
  return rows[0] || null;
}

module.exports = {
  createArtifact,
  updateArtifactStatus,
  getArtifactsByMeeting,
  insertTranscript,
  insertSummary,
  getTranscriptByMeeting,
  getSummaryByMeeting,
};
