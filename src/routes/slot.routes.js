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

// GET /slots?userId=&from=&to=&duration=  — compute available slots
router.get(
  '/',
  authenticate,
  validate(availSchemas.getSlots),
  availCtrl.getSlots
);

// POST /slots/hold  — create a Redis slot hold
router.post(
  '/hold',
  authenticate,
  slotHoldLimiter,
  validate(slotSchemas.createHold),
  slotCtrl.createHold
);

// DELETE /slots/hold/:holdId  — release a slot hold
router.delete(
  '/hold/:holdId',
  authenticate,
  validate(slotSchemas.releaseHold),
  slotCtrl.releaseHold
);

module.exports = router;
