'use strict';
const express = require('express');
const router = express.Router();
const availCtrl = require('../controllers/availability.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const availSchemas = require('../validations/availability.validation');

/**
 * @openapi
 * /users/{id}/availability-rules:
 *   get:
 *     summary: Get a user's availability rules
 *     description: >
 *       Returns the working-hours rules used to compute open booking slots.
 *       Each rule defines the day of week and time window during which the user
 *       is available (stored in the user's configured timezone).
 *     tags: [Availability]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d+$'
 *         description: User ID (BIGINT as numeric string).
 *     responses:
 *       200:
 *         description: List of availability rules.
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
 *                     $ref: '#/components/schemas/AvailabilityRule'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/:id/availability-rules',
  authenticate,
  validate(availSchemas.getRules),
  availCtrl.getRules
);

/**
 * @openapi
 * /users/{id}/availability-rules:
 *   put:
 *     summary: Replace all availability rules for a user (idempotent)
 *     description: >
 *       Atomically deletes all existing rules and inserts the new set.
 *       Send an empty `rules` array to clear all rules.
 *     tags: [Availability]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d+$'
 *         description: User ID (BIGINT as numeric string).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rules]
 *             properties:
 *               rules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [dayOfWeek, startTime, endTime]
 *                   properties:
 *                     dayOfWeek:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 6
 *                       description: 0=Sunday … 6=Saturday
 *                     startTime:
 *                       type: string
 *                       example: "09:00"
 *                       description: HH:MM 24-hour local time
 *                     endTime:
 *                       type: string
 *                       example: "17:00"
 *     responses:
 *       200:
 *         description: Updated rules.
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
 *                     $ref: '#/components/schemas/AvailabilityRule'
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
router.put(
  '/:id/availability-rules',
  authenticate,
  validate(availSchemas.putRules),
  availCtrl.replaceRules
);

module.exports = router;
