'use strict';
const express = require('express');
const router = express.Router();
const meetingCtrl = require('../controllers/meeting.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { bookingLimiter } = require('../middleware/rateLimiter');
const meetingSchemas = require('../validations/meeting.validation');

// All meeting routes require authentication
router.use(authenticate);

// ─── Core Tier 1 endpoints ────────────────────────────────────────────────────

/**
 * @openapi
 * /meetings:
 *   post:
 *     summary: Book a meeting (Tier 1)
 *     description: >
 *       Creates a Google Calendar event with `sendUpdates: all` (Google sends
 *       native email notifications to all guests). Optionally accepts a slot
 *       `holdId` to release after booking. Pass an `rrule` (RFC 5545) to create
 *       a recurring series.
 *
 *       **Ordering:** Google Calendar API is called first; if the DB write
 *       subsequently fails, a compensating `events.delete` is attempted.
 *
 *       Rate-limited to 30 requests per user per hour.
 *     tags: [Meetings]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, startTime, endTime]
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 500
 *               description:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *                 default: UTC
 *               guests:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [email]
 *                   properties:
 *                     email:
 *                       type: string
 *                       format: email
 *                     name:
 *                       type: string
 *               holdId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional slot hold ID to consume on booking.
 *               rrule:
 *                 type: string
 *                 description: RFC 5545 RRULE string for recurring meetings.
 *                 example: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE"
 *     responses:
 *       201:
 *         description: Meeting booked successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Meeting'
 *       400:
 *         description: Validation error or slot hold expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Slot already held by another user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Rate limit exceeded.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Google Calendar API error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/',
  bookingLimiter,
  validate(meetingSchemas.create),
  meetingCtrl.createMeeting
);

/**
 * @openapi
 * /meetings:
 *   get:
 *     summary: List meetings with optional filters
 *     tags: [Meetings]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, rescheduled, cancelled, completed]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter meetings starting on or after this UTC time.
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: organizerId
 *         schema:
 *           type: string
 *         description: BIGINT user ID as string.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Array of meetings.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Meeting'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', validate(meetingSchemas.list), meetingCtrl.listMeetings);

/**
 * @openapi
 * /meetings/{id}:
 *   get:
 *     summary: Get a single meeting by ID
 *     tags: [Meetings]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Meeting UUID.
 *     responses:
 *       200:
 *         description: Meeting details including guests.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Meeting'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Requester is not the organizer.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Meeting not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', validate(meetingSchemas.getOne), meetingCtrl.getMeeting);

/**
 * @openapi
 * /meetings/{id}/reschedule:
 *   patch:
 *     summary: Reschedule a meeting (Tier 1)
 *     description: >
 *       Updates the Google Calendar event start/end with `sendUpdates: all`
 *       (Google notifies guests), then updates the DB. For recurring meetings,
 *       use `scope=instance` to move only this occurrence or `scope=series` to
 *       move the entire series (targets the master event via `recurring_event_id`).
 *
 *       Rate-limited to 30 requests per user per hour.
 *     tags: [Meetings]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startTime, endTime]
 *             properties:
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *               scope:
 *                 type: string
 *                 enum: [instance, series]
 *                 default: instance
 *                 description: >
 *                   `instance` — move only this calendar occurrence.
 *                   `series` — move the entire recurring series (targets the master event).
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Meeting rescheduled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Meeting'
 *       400:
 *         description: Validation error or meeting already cancelled.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Requester is not the organizer.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Meeting not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Google Calendar API error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch(
  '/:id/reschedule',
  bookingLimiter,
  validate(meetingSchemas.reschedule),
  meetingCtrl.rescheduleMeeting
);

/**
 * @openapi
 * /meetings/{id}:
 *   delete:
 *     summary: Cancel a meeting (Tier 1)
 *     description: >
 *       Deletes the Google Calendar event with `sendUpdates: all`
 *       (Google notifies guests), then marks the DB row as cancelled.
 *       A 410 Gone from Google (already deleted) is treated as success.
 *       Use `scope=series` to cancel the entire recurring series.
 *
 *       Rate-limited to 30 requests per user per hour.
 *     tags: [Meetings]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scope:
 *                 type: string
 *                 enum: [instance, series]
 *                 default: instance
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Meeting cancelled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Meeting'
 *       400:
 *         description: Meeting already cancelled.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Requester is not the organizer.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Meeting not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Google Calendar API error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete(
  '/:id',
  bookingLimiter,
  validate(meetingSchemas.cancel),
  meetingCtrl.cancelMeeting
);

// ─── Tier 2 artifact endpoints ────────────────────────────────────────────────
// These return a clear "not available" response when WORKSPACE_FEATURES_ENABLED=false.

/**
 * @openapi
 * /meetings/{id}/artifacts:
 *   get:
 *     summary: List artifacts for a meeting (Tier 2)
 *     description: >
 *       Returns recordings, transcript references, and summary references fetched
 *       by the BullMQ artifact worker after the meeting ends.
 *
 *       **Tier 2 — requires `WORKSPACE_FEATURES_ENABLED=true` and a Google Workspace
 *       account with Gemini.** Returns `{ status: "unavailable" }` (HTTP 200) when
 *       Workspace features are disabled.
 *     tags: [Artifacts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Artifact list or unavailable response.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: success
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Artifact'
 *                 - $ref: '#/components/schemas/Tier2Unavailable'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/artifacts', meetingCtrl.getArtifacts);

/**
 * @openapi
 * /meetings/{id}/transcript:
 *   get:
 *     summary: Get transcript for a meeting (Tier 2)
 *     description: >
 *       Returns the full text transcript fetched from Google Docs after the
 *       meeting ends. Returns `{ status: "pending" }` if the transcript hasn't
 *       arrived yet, or `{ status: "unavailable" }` if Workspace is disabled.
 *     tags: [Artifacts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Transcript, pending status, or unavailable.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: success
 *                     data:
 *                       $ref: '#/components/schemas/Transcript'
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: pending
 *                     message:
 *                       type: string
 *                 - $ref: '#/components/schemas/Tier2Unavailable'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/transcript', meetingCtrl.getTranscript);

/**
 * @openapi
 * /meetings/{id}/summary:
 *   get:
 *     summary: Get AI-generated summary for a meeting (Tier 2)
 *     description: >
 *       Returns the Gemini-generated meeting summary. Returns `{ status: "pending" }`
 *       if not yet generated, or `{ status: "unavailable" }` if Workspace is disabled.
 *     tags: [Artifacts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Summary, pending status, or unavailable.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: success
 *                     data:
 *                       $ref: '#/components/schemas/Summary'
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: pending
 *                     message:
 *                       type: string
 *                 - $ref: '#/components/schemas/Tier2Unavailable'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/summary', meetingCtrl.getSummary);

module.exports = router;
