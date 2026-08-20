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
router.post(
  '/',
  bookingLimiter,
  validate(meetingSchemas.create),
  meetingCtrl.createMeeting
);

router.get('/', validate(meetingSchemas.list), meetingCtrl.listMeetings);

router.get('/:id', validate(meetingSchemas.getOne), meetingCtrl.getMeeting);

router.patch(
  '/:id/reschedule',
  bookingLimiter,
  validate(meetingSchemas.reschedule),
  meetingCtrl.rescheduleMeeting
);

router.delete(
  '/:id',
  bookingLimiter,
  validate(meetingSchemas.cancel),
  meetingCtrl.cancelMeeting
);

// ─── Tier 2 artifact endpoints ────────────────────────────────────────────────
// These return a clear "not available" response when WORKSPACE_FEATURES_ENABLED=false.
router.get('/:id/artifacts', meetingCtrl.getArtifacts);
router.get('/:id/transcript', meetingCtrl.getTranscript);
router.get('/:id/summary', meetingCtrl.getSummary);

module.exports = router;
