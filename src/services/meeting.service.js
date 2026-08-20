'use strict';
const { google } = require('googleapis');
const db = require('../config/db');
const meetingRepo = require('../repositories/meeting.repository');
const authService = require('./auth.service');
const slotHoldService = require('./slotHold.service');
const AppError = require('../utils/AppError');
const { MEETING_STATUS, RECURRING_SCOPE } = require('../constants');

/**
 * Ordering note (Step 10 spec):
 * We call the Google Calendar API FIRST, then persist to the DB.
 * Rationale: Google Calendar is the source of truth for event existence.
 * If the DB write fails after a successful Google insert, we attempt
 * a compensating Google delete. If that also fails, we log a "dangling
 * Google event" warning for manual cleanup. The booking request returns an
 * error to the client in that case.
 */

// ─── Book a meeting ────────────────────────────────────────────────────────

async function createMeeting(organizerId, data) {
  const {
    title, description, startTime, endTime, timezone,
    guests = [], holdId, rrule,
  } = data;

  // Validate hold if supplied
  if (holdId) {
    await slotHoldService.validateHold(holdId, organizerId, startTime, endTime);
  }

  const authClient = await authService.getAuthorizedGoogleClient(organizerId);
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  // Build the Calendar event resource
  const eventResource = {
    summary: title,
    description,
    start: { dateTime: startTime, timeZone: timezone },
    end:   { dateTime: endTime,   timeZone: timezone },
    attendees: guests.map((g) => ({ email: g.email, displayName: g.name })),
    conferenceData: {
      createRequest: {
        requestId: require('crypto').randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  // Recurring meeting: pass the RRULE to Google
  if (rrule) {
    eventResource.recurrence = [rrule];
  }

  // ── Step 1: Create Google Calendar event ────────────────────────────────
  let googleEvent;
  try {
    const { data: ev } = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',  // Google sends email notifications to all guests natively
      conferenceDataVersion: 1,
      requestBody: eventResource,
    });
    googleEvent = ev;
  } catch (err) {
    throw new AppError(`Google Calendar API error: ${err.message}`, 502);
  }

  const meetLink = googleEvent.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === 'video'
  )?.uri || googleEvent.hangoutLink || null;

  const meetSpaceId = googleEvent.conferenceData?.conferenceId || null;

  // ── Step 2: Persist to DB in a transaction ───────────────────────────────
  let meeting;
  try {
    meeting = await db.transaction(async (client) => {
      const m = await meetingRepo.create(client, {
        organizerId,
        googleEventId: googleEvent.id,
        googleCalendarId: googleEvent.organizer?.email || 'primary',
        recurringEventId: googleEvent.recurringEventId || null,
        rrule: rrule || null,
        isRecurring: !!rrule,
        title,
        description,
        startTime,
        endTime,
        timezone,
        meetLink,
        meetSpaceId,
        status: MEETING_STATUS.SCHEDULED,
      });

      await meetingRepo.createGuests(client, m.id, guests);
      await meetingRepo.insertStatusHistory(client, {
        meetingId: m.id,
        fromStatus: null,
        toStatus: MEETING_STATUS.SCHEDULED,
        reason: 'Meeting created',
      });

      return m;
    });
  } catch (dbErr) {
    // Compensating action: delete the Google event to avoid orphaned events
    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: googleEvent.id,
        sendUpdates: 'all',
      });
    } catch (cleanupErr) {
      // Log the dangling event ID for manual cleanup
      const logger = require('../utils/logger');
      logger.error(
        { googleEventId: googleEvent.id, dbErr: dbErr.message, cleanupErr: cleanupErr.message },
        'DANGLING GOOGLE EVENT: DB write failed and cleanup delete also failed. ' +
        'Manual cleanup required.'
      );
    }
    throw new AppError(`Failed to save meeting after Google event creation: ${dbErr.message}`, 500, false);
  }

  // Release the slot hold on success
  if (holdId) {
    await slotHoldService.releaseHold(organizerId, startTime, endTime).catch(() => {});
  }

  return meetingRepo.findById(meeting.id);
}

// ─── Reschedule a meeting ─────────────────────────────────────────────────

/**
 * Reschedule strategy for recurring events (Step 17):
 *
 * - scope='instance': Update only this specific occurrence.
 *   Google returns a per-instance event ID when listing recurring event
 *   instances. Pass that specific ID to events.patch.
 *   The `recurring_event_id` column points back to the series master row.
 *
 * - scope='series': Update all future instances from this occurrence onward.
 *   Use the recurring_event_id (master event ID) and include
 *   `recurringEventId` in the patch with eventType=default to update
 *   the entire series. Alternatively, use instances endpoint and update
 *   each, but the simplest Google-native way is to PATCH the master event.
 *
 * For this v1 implementation we handle 'instance' by patching the specific
 * google_event_id and 'series' by patching the recurring_event_id (master).
 */
async function rescheduleMeeting(meetingId, organizerId, data) {
  const { startTime, endTime, timezone, scope = 'instance', reason } = data;

  const meeting = await meetingRepo.findById(meetingId);
  if (!meeting) throw new AppError('Meeting not found', 404);
  if (meeting.organizer_id !== organizerId) throw new AppError('Forbidden', 403);
  if (meeting.status === MEETING_STATUS.CANCELLED) {
    throw new AppError('Cannot reschedule a cancelled meeting', 400);
  }

  const authClient = await authService.getAuthorizedGoogleClient(organizerId);
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  // For 'series' scope on a recurring meeting, target the master event ID
  const targetGoogleId =
    scope === RECURRING_SCOPE.SERIES && meeting.recurring_event_id
      ? meeting.recurring_event_id
      : meeting.google_event_id;

  // ── Step 1: Patch the Google Calendar event ──────────────────────────────
  try {
    await calendar.events.patch({
      calendarId: 'primary',
      eventId: targetGoogleId,
      sendUpdates: 'all',
      requestBody: {
        start: { dateTime: startTime, timeZone: timezone || meeting.timezone },
        end:   { dateTime: endTime,   timeZone: timezone || meeting.timezone },
      },
    });
  } catch (err) {
    throw new AppError(`Google Calendar reschedule failed: ${err.message}`, 502);
  }

  // ── Step 2: Update DB ────────────────────────────────────────────────────
  return db.transaction(async (client) => {
    const updated = await meetingRepo.updateMeeting(client, meetingId, {
      startTime,
      endTime,
      timezone: timezone || meeting.timezone,
      status: MEETING_STATUS.RESCHEDULED,
    });

    await meetingRepo.insertStatusHistory(client, {
      meetingId,
      fromStatus: meeting.status,
      toStatus: MEETING_STATUS.RESCHEDULED,
      reason: reason || 'Meeting rescheduled',
    });

    return updated;
  });
}

// ─── Cancel a meeting ─────────────────────────────────────────────────────

async function cancelMeeting(meetingId, organizerId, data = {}) {
  const { scope = 'instance', reason } = data;

  const meeting = await meetingRepo.findById(meetingId);
  if (!meeting) throw new AppError('Meeting not found', 404);
  if (meeting.organizer_id !== organizerId) throw new AppError('Forbidden', 403);
  if (meeting.status === MEETING_STATUS.CANCELLED) {
    throw new AppError('Meeting is already cancelled', 400);
  }

  const authClient = await authService.getAuthorizedGoogleClient(organizerId);
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const targetGoogleId =
    scope === RECURRING_SCOPE.SERIES && meeting.recurring_event_id
      ? meeting.recurring_event_id
      : meeting.google_event_id;

  // ── Step 1: Cancel via Google Calendar ──────────────────────────────────
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: targetGoogleId,
      sendUpdates: 'all',
    });
  } catch (err) {
    // 410 Gone = already deleted on Google's side; proceed with DB update
    if (err.status !== 410 && err.code !== 410) {
      throw new AppError(`Google Calendar cancel failed: ${err.message}`, 502);
    }
  }

  // ── Step 2: Update DB ────────────────────────────────────────────────────
  return db.transaction(async (client) => {
    const updated = await meetingRepo.updateMeeting(client, meetingId, {
      status: MEETING_STATUS.CANCELLED,
    });

    await meetingRepo.insertStatusHistory(client, {
      meetingId,
      fromStatus: meeting.status,
      toStatus: MEETING_STATUS.CANCELLED,
      reason: reason || 'Meeting cancelled',
    });

    return updated;
  });
}

// ─── Read operations ──────────────────────────────────────────────────────

async function getMeeting(meetingId, requesterId) {
  const meeting = await meetingRepo.findById(meetingId);
  if (!meeting) throw new AppError('Meeting not found', 404);

  // Allow organizer OR any invited guest to view
  const isOrganizer = meeting.organizer_id === requesterId;
  const isGuest = (meeting.guests || []).some((g) => g.id === requesterId);
  if (!isOrganizer && !isGuest) throw new AppError('Forbidden', 403);

  return meeting;
}

async function listMeetings(filters) {
  const { status, from, to, organizerId, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;
  return meetingRepo.list({ status, from, to, organizerId, limit, offset });
}

module.exports = {
  createMeeting,
  rescheduleMeeting,
  cancelMeeting,
  getMeeting,
  listMeetings,
};
