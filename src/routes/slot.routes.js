'use strict';
const express = require('express');
const router = express.Router();
const availCtrl = require('../controllers/availability.controller');
const slotCtrl = require('../controllers/slot.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { slotHoldLimiter } = require('../middleware/rateLimiter');
const availSchemas = require('../validations/availability.validation');
const slotSchemas = require('../validations/slot.validation');

/**
 * @openapi
 * /slots:
 *   get:
 *     summary: Compute available booking slots for a user
 *     description: >
 *       Merges the user's `availability_rules` with Google Calendar freebusy
 *       data to return concrete open time slots of the requested duration.
 *       All times are returned in UTC. If the Google Calendar freebusy call
 *       fails, rule-based slots are returned without busy-time filtering
 *       (Tier 1 graceful degradation).
 *     tags: [Slots]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d+$'
 *         description: User ID to query availability for.
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Range start (UTC ISO 8601).
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Range end (UTC ISO 8601).
 *       - in: query
 *         name: duration
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 15
 *           maximum: 480
 *         description: Desired slot duration in minutes.
 *     responses:
 *       200:
 *         description: Array of available slots.
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
 *                     $ref: '#/components/schemas/Slot'
 *       400:
 *         description: Validation error.
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
 */
router.get(
  '/',
  authenticate,
  validate(availSchemas.getSlots),
  availCtrl.getSlots
);

/**
 * @openapi
 * /slots/hold:
 *   post:
 *     summary: Create a Redis slot hold
 *     description: >
 *       Reserves a time slot in Redis using SET NX EX so that concurrent
 *       booking requests for the same slot fail fast before hitting the
 *       Google Calendar API. The hold expires automatically after
 *       `SLOT_HOLD_TTL_SECONDS` (default 10 minutes).
 *
 *       Pass the returned `holdId` to `POST /meetings` to consume the hold.
 *       Rate-limited to 60 requests per user per 15 minutes.
 *     tags: [Slots]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, startTime, endTime]
 *             properties:
 *               userId:
 *                 type: string
 *                 pattern: '^\d+$'
 *                 description: Must match the authenticated user's ID.
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Hold created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/SlotHold'
 *       400:
 *         description: Validation error.
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
 *         description: Attempting to hold a slot for a different user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Slot already held.
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
 */
router.post(
  '/hold',
  authenticate,
  slotHoldLimiter,
  validate(slotSchemas.createHold),
  slotCtrl.createHold
);

/**
 * @openapi
 * /slots/hold/{holdId}:
 *   delete:
 *     summary: Release a slot hold
 *     description: >
 *       Explicitly releases a Redis hold before its TTL expires (e.g. when
 *       the user cancels the booking flow). The `startTime` and `endTime` that
 *       were used to create the hold must be supplied in the request body.
 *     tags: [Slots]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: holdId
 *         required: true
 *         schema:
 *           type: string
 *         description: Hold UUID returned by POST /slots/hold.
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
 *     responses:
 *       200:
 *         description: Hold released.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Hold belongs to a different user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete(
  '/hold/:holdId',
  authenticate,
  validate(slotSchemas.releaseHold),
  slotCtrl.releaseHold
);

module.exports = router;
