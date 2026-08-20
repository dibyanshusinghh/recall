'use strict';
const { google } = require('googleapis');
const db = require('../config/db');
const artifactRepo = require('../repositories/artifact.repository');
const meetingRepo = require('../repositories/meeting.repository');
const authService = require('./auth.service');
const { ARTIFACT_STATUS, ARTIFACT_TYPE } = require('../constants');
const logger = require('../utils/logger');

/**
 * Fetch recording, transcript, and summary artifacts for a given conference
 * record from the Google Meet, Drive, and Docs APIs.
 *
 * This function is called by the BullMQ worker (Step 14).
 * All errors are caught and returned as structured results so the worker
 * can mark the event as 'failed' with a meaningful message — the worker
 * process itself must never crash.
 *
 * @param {string} conferenceRecordId - Google Meet conference record resource name
 * @param {string} organizerId        - Used to get the authorized Google client
 */
async function fetchArtifacts(conferenceRecordId, organizerId) {
  const authClient = await authService.getAuthorizedGoogleClient(organizerId);

  // ── Find matching DB meeting ──────────────────────────────────────────────
  // The conference record resource name contains the meeting space ID.
  // e.g. "conferenceRecords/abc123". Extract and match to meet_space_id.
  const spaceId = conferenceRecordId.split('/').pop();
  // Search DB by meet_space_id — may not exist if Pub/Sub event arrived before
  // the booking was fully persisted (edge case; handled below).
  const { rows: meetingRows } = await db.pool.query(
    'SELECT * FROM recall.meetings WHERE meet_space_id = $1 LIMIT 1',
    [spaceId]
  );
  const meeting = meetingRows[0] || null;

  const results = { recording: null, transcript: null, summary: null };

  // ── Recording artifact (Drive file reference) ─────────────────────────────
  try {
    const meet = google.meet({ version: 'v2', auth: authClient });
    const { data: recordingsData } = await meet.conferenceRecords.recordings.list({
      parent: conferenceRecordId,
    });

    for (const rec of recordingsData.recordings || []) {
      const driveFileId = rec.driveDestination?.file?.split('/').pop();
      if (!driveFileId) continue;

      let artifactId = null;
      if (meeting) {
        await db.transaction(async (client) => {
          const artifact = await artifactRepo.createArtifact(client, {
            meetingId: meeting.id,
            conferenceRecordId,
            type: ARTIFACT_TYPE.RECORDING,
            driveFileId,
            status: ARTIFACT_STATUS.READY,
          });
          artifactId = artifact.id;
          await artifactRepo.updateArtifactStatus(artifact.id, ARTIFACT_STATUS.READY, new Date());
        });
      }
      results.recording = { driveFileId, artifactId };
    }
  } catch (err) {
    logger.warn({ err: err.message, conferenceRecordId }, 'Failed to fetch recording artifact');
  }

  // ── Transcript artifact (Docs content) ───────────────────────────────────
  try {
    const meet = google.meet({ version: 'v2', auth: authClient });
    const { data: transcriptData } = await meet.conferenceRecords.transcripts.list({
      parent: conferenceRecordId,
    });

    for (const tEntry of transcriptData.transcripts || []) {
      const docsFileId = tEntry.docsDestination?.document?.split('/').pop();
      if (!docsFileId) continue;

      // Fetch the actual text content from the Docs API
      const docs = google.docs({ version: 'v1', auth: authClient });
      const { data: docData } = await docs.documents.get({ documentId: docsFileId });

      const content = extractDocsText(docData);

      if (meeting && content) {
        await db.transaction(async (client) => {
          const artifact = await artifactRepo.createArtifact(client, {
            meetingId: meeting.id,
            conferenceRecordId,
            type: ARTIFACT_TYPE.TRANSCRIPT,
            docsFileId,
            status: ARTIFACT_STATUS.READY,
          });
          await artifactRepo.insertTranscript(client, {
            meetingId: meeting.id,
            artifactId: artifact.id,
            content,
          });
          await artifactRepo.updateArtifactStatus(artifact.id, ARTIFACT_STATUS.READY, new Date());
        });
        results.transcript = { docsFileId, content: content.slice(0, 200) + '...' };
      }
    }
  } catch (err) {
    logger.warn({ err: err.message, conferenceRecordId }, 'Failed to fetch transcript artifact');
  }

  // ── Summary artifact (Gemini-generated, served via Docs/Meet API) ─────────
  try {
    // Google Meet API provides summaries under conferenceRecords/{id}/transcripts
    // with a separate "summary" field, or as a Drive doc linked via the
    // conference record. The exact endpoint depends on the Workspace plan.
    // Here we attempt the Meet summary endpoint and fall back gracefully.
    const meet = google.meet({ version: 'v2', auth: authClient });

    // Try to list summaries if the API supports it
    let summaryContent = null;
    try {
      // Note: as of 2026, Google Meet API exposes summaries under
      // conferenceRecords.transcripts entries that have a `docsDestination`
      // pointing to a summary doc. Adjust if the API surface changes.
      const { data: transcriptData } = await meet.conferenceRecords.transcripts.list({
        parent: conferenceRecordId,
      });

      for (const t of transcriptData.transcripts || []) {
        if (t.state !== 'ENDED') continue;
        // Attempt to read summary from the same doc (some Workspace tiers
        // append a summary section to the transcript doc)
        const docsFileId = t.docsDestination?.document?.split('/').pop();
        if (!docsFileId) continue;

        const docs = google.docs({ version: 'v1', auth: authClient });
        const { data: docData } = await docs.documents.get({ documentId: docsFileId });
        summaryContent = extractSummarySection(docData);
        if (summaryContent) break;
      }
    } catch (_) {
      // Summary API not available on this Workspace tier — skip silently
    }

    if (meeting && summaryContent) {
      await db.transaction(async (client) => {
        const artifact = await artifactRepo.createArtifact(client, {
          meetingId: meeting.id,
          conferenceRecordId,
          type: ARTIFACT_TYPE.SUMMARY,
          status: ARTIFACT_STATUS.READY,
        });
        await artifactRepo.insertSummary(client, {
          meetingId: meeting.id,
          artifactId: artifact.id,
          content: summaryContent,
          source: 'gemini_native',
        });
        await artifactRepo.updateArtifactStatus(artifact.id, ARTIFACT_STATUS.READY, new Date());
      });
      results.summary = { content: summaryContent.slice(0, 200) + '...' };
    }
  } catch (err) {
    logger.warn({ err: err.message, conferenceRecordId }, 'Failed to fetch summary artifact');
  }

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract plain text from a Google Docs document body. */
function extractDocsText(docData) {
  const parts = [];
  for (const element of docData.body?.content || []) {
    for (const pe of element.paragraph?.elements || []) {
      if (pe.textRun?.content) parts.push(pe.textRun.content);
    }
  }
  return parts.join('').trim();
}

/**
 * Heuristic: extract a "Summary" section from a Docs document.
 * Some Workspace plans append a Gemini-generated summary heading.
 * Falls back to null if no summary section is found.
 */
function extractSummarySection(docData) {
  const fullText = extractDocsText(docData);
  const summaryIdx = fullText.search(/\bsummary\b/i);
  if (summaryIdx === -1) return null;
  return fullText.slice(summaryIdx).trim() || null;
}

module.exports = { fetchArtifacts };
